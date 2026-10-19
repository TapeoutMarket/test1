// Durable bootstrap state. The caller holds the shared deployment lock while
// checking identity, reserving budget, signing, sending, and recording results.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = 'deployments/live-budget.json';
const LOCK = 'deployments/live-budget.lock';
const UINT = /^(0|[1-9][0-9]*)$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const STATUSES = new Set(['RESERVED_BEFORE_SEND', 'SIGNED_NOT_SUBMITTED', 'SUBMISSION_UNKNOWN', 'SUBMITTED', 'CONFIRMED_SUCCESS', 'CONFIRMED_REVERTED', 'RECEIPT_VERIFIED']);
const need = (ok, code) => { if (!ok) throw new Error(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
function integer(value, code = 'INVALID_BUDGET_INTEGER') {
  need(typeof value === 'string' && UINT.test(value), code);
  const result = BigInt(value);
  need(result < 2n ** 256n, code);
  return result;
}
function parameterInteger(value, code) {
  need(typeof value === 'string' || typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value)), code);
  return integer(String(value), code);
}
const validAddress = value => typeof value === 'string' && ADDRESS.test(value) && !/^0x0{40}$/i.test(value);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value);
async function statOrMissing(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function confined(relative, {root = ROOT, createParent = false} = {}) {
  need(typeof relative === 'string' && relative.length > 0 && !relative.includes('\0') && !path.isAbsolute(relative), 'RELATIVE_REPOSITORY_PATH_REQUIRED');
  const resolvedRoot = path.resolve(root), file = path.resolve(resolvedRoot, relative), relation = path.relative(resolvedRoot, file);
  need(relation !== '' && relation !== '..' && !relation.startsWith('..' + path.sep) && !path.isAbsolute(relation), 'PATH_OUTSIDE_REPOSITORY');
  need(await fs.realpath(resolvedRoot) === resolvedRoot, 'REPOSITORY_ROOT_SYMLINK_REFUSED');
  let current = resolvedRoot;
  for (const component of relation.split(path.sep).slice(0, -1)) {
    current = path.join(current, component);
    let stat = await statOrMissing(current);
    if (!stat && createParent) {
      let created = false;
      try { await fs.mkdir(current, {mode: 0o700}); created = true; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      stat = await fs.lstat(current);
      if (created) await syncDirectory(path.dirname(current));
    }
    need(stat && stat.isDirectory() && !stat.isSymbolicLink(), 'PARENT_DIRECTORY_MISSING_OR_SYMLINK');
  }
  const stat = await statOrMissing(file);
  need(!stat || (stat.isFile() && !stat.isSymbolicLink()), 'STATE_FILE_NOT_REGULAR_OR_SYMLINK');
  return {file, parent: path.dirname(file), stat, root: resolvedRoot};
}

export async function readConfinedJson(relative, options = {}) {
  const {file} = await confined(relative, options);
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let raw;
  try { need((await handle.stat()).isFile(), 'STATE_FILE_NOT_REGULAR_OR_SYMLINK'); raw = await handle.readFile(); }
  finally { await handle.close(); }
  let value;
  try { value = JSON.parse(raw.toString('utf8')); }
  catch { throw new Error('STATE_JSON_INVALID'); }
  return {value, raw, path: file};
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function writeAtomic(relative, value, options = {}) {
  const target = await confined(relative, {...options, createParent: true});
  const temporary = path.join(target.parent, '.' + path.basename(target.file) + '.' + randomUUID() + '.tmp');
  let handle;
  try {
    handle = await fs.open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(json(value));
    await handle.sync();
    await handle.close(); handle = undefined;
    await confined(relative, options);
    await fs.rename(temporary, target.file);
    await syncDirectory(target.parent);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function acquireDeploymentLock(options = {}) {
  const target = await confined(LOCK, {...options, createParent: true});
  let handle;
  try { handle = await fs.open(target.file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('DEPLOYMENT_LOCK_ALREADY_EXISTS'); throw error; }
  const identity = await handle.stat();
  try {
    await handle.writeFile(json({schemaVersion: 1, pid: process.pid, createdAt: new Date().toISOString(), lockId: randomUUID(), recovery: 'Do not remove a stale lock until the journal and pending transactions have been reviewed.'}));
    await handle.sync();
    await syncDirectory(target.parent);
  } catch (error) {
    await handle.close();
    await fs.unlink(target.file);
    throw error;
  }
  let released = false;
  return async function release() {
    if (released) return;
    released = true;
    await handle.close();
    const fresh = await confined(LOCK, options);
    need(fresh.stat && fresh.stat.dev === identity.dev && fresh.stat.ino === identity.ino, 'DEPLOYMENT_LOCK_REPLACED_REVIEW_REQUIRED');
    await fs.unlink(target.file);
    await syncDirectory(target.parent);
  };
}

export function validateBudget(value) {
  need(plain(value) && Array.isArray(value.reservations), 'INVALID_BUDGET_SCHEMA');
  const claimed = integer(value.spentAndReservedWei);
  let total = 0n;
  const ids = new Set(), nonces = new Set();
  for (const entry of value.reservations) {
    need(plain(entry), 'INVALID_BUDGET_RESERVATION');
    const amount = integer(entry.valueWei), fee = integer(entry.maxFeeWei);
    need(fee > 0n && STATUSES.has(entry.status), 'INVALID_BUDGET_RESERVATION');
    if (Object.hasOwn(entry, 'reservationId')) {
      need(validId(entry.reservationId) && !ids.has(entry.reservationId), 'DUPLICATE_OR_INVALID_RESERVATION_ID');
      ids.add(entry.reservationId);
      need(typeof entry.operation === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(entry.operation), 'INVALID_BUDGET_OPERATION');
      need(validAddress(entry.sender) && HASH.test(entry.bundleHash) && HASH.test(entry.initCodeHash), 'INVALID_BUDGET_BINDING');
      integer(entry.nonce, 'INVALID_BUDGET_NONCE');
      const key = entry.sender.toLowerCase() + ':' + entry.nonce;
      need(!nonces.has(key), 'DUPLICATE_RESERVED_SENDER_NONCE');
      nonces.add(key);
    } else {
      // Preserve existing CLI reservations; they do not identify their nonce or
      // transaction hash and therefore cannot support automatic reconciliation.
      need(typeof entry.command === 'string' && entry.command.length > 0 && validAddress(entry.to) && HASH.test(entry.calldataHash), 'INVALID_LEGACY_BUDGET_RESERVATION');
    }
    total += amount + fee;
    need(total < 2n ** 256n, 'BUDGET_TOTAL_OUT_OF_RANGE');
  }
  need(claimed === total, 'BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS');
  return value;
}

export async function readBudget(options = {}) {
  const target = await confined(BUDGET, {...options, createParent: true});
  if (!target.stat) return {spentAndReservedWei: '0', reservations: []};
  return validateBudget((await readConfinedJson(BUDGET, options)).value);
}

export async function reserveBudget({id, operation, nonce, sender, valueWei, maxFeeWei, maxTotalWei, bundleHash, initCodeHash}, options = {}) {
  // Ownership of the shared lock belongs to the orchestrator. Its scope must
  // include all later signing/journal writes, not merely this reservation.
  const lock = await confined(LOCK, options);
  need(lock.stat, 'SHARED_DEPLOYMENT_LOCK_REQUIRED');
  const budget = await readBudget(options);
  const value = parameterInteger(valueWei, 'INVALID_BUDGET_VALUE');
  const fee = parameterInteger(maxFeeWei, 'INVALID_BUDGET_FEE');
  const maximum = parameterInteger(maxTotalWei, 'INVALID_BUDGET_MAXIMUM');
  need(fee > 0n && maximum > 0n, 'POSITIVE_BUDGET_REQUIRED');
  const reservation = {reservationId: id, operation, nonce: parameterInteger(nonce, 'INVALID_BUDGET_NONCE').toString(), sender, valueWei: value.toString(), maxFeeWei: fee.toString(), bundleHash, initCodeHash, status: 'RESERVED_BEFORE_SEND'};
  const total = BigInt(budget.spentAndReservedWei) + value + fee;
  need(total <= maximum, 'TOTAL_TEST_SPEND_BUDGET_EXCEEDED');
  const updated = {...budget, spentAndReservedWei: total.toString(), reservations: [...budget.reservations, reservation]};
  validateBudget(updated);
  await writeAtomic(BUDGET, updated, options);
  return updated;
}

export async function bootstrapToolHash(options = {}) {
  const root = path.resolve(options.root ?? ROOT), records = [];
  const excluded = new Set(['observations', 'reports', 'transactions', 'receipts', 'node_modules']);
  async function visit(relative) {
    const file = path.join(root, relative), stat = await fs.lstat(file);
    need(!stat.isSymbolicLink(), 'BOOTSTRAP_SOURCE_SYMLINK_REFUSED');
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) if (!excluded.has(name)) await visit(path.posix.join(relative, name));
    } else if (relative.endsWith('.mjs') && !relative.endsWith('.test.mjs')) {
      need(stat.isFile(), 'BOOTSTRAP_SOURCE_NOT_REGULAR');
      const target = await confined(relative, options), raw = await fs.readFile(target.file);
      records.push({path: relative, bytes: raw.length, sha256: sha(raw)});
    }
  }
  await visit('live-test');
  need(records.length > 0, 'BOOTSTRAP_RUNTIME_SOURCE_MISSING');
  const session = await readConfinedJson('live-test/SESSION_PLAN.json', options);
  records.push({path: 'live-test/SESSION_PLAN.json', bytes: session.raw.length, sha256: sha(session.raw)});
  records.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return sha(JSON.stringify(records));
}
