import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readConfinedJson, writeAtomic, acquireDeploymentLock, validateBudget, readBudget, reserveBudget, bootstrapToolHash} from './deployment-io.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = '0x' + '12'.repeat(32), address = '0x' + '34'.repeat(20);
const legacy = () => ({command: 'contribute', to: address, valueWei: '30', maxFeeWei: '2', calldataHash: hash, status: 'RESERVED_BEFORE_SEND'});
const reservation = overrides => ({id: 'session-a:step-1', operation: 'deploy-vault', nonce: 5n, sender: address, valueWei: 0n, maxFeeWei: 10n, maxTotalWei: 100n, bundleHash: hash, initCodeHash: hash, ...overrides});
async function temporary(t) {
  const root = await fs.mkdtemp(path.join(ROOT, '.deployment-io-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return {root};
}

test('missing ledger starts empty and existing CLI reservations count toward new deployment budget', async t => {
  const options = await temporary(t);
  assert.deepEqual(await readBudget(options), {spentAndReservedWei: '0', reservations: []});
  await writeAtomic('deployments/live-budget.json', {spentAndReservedWei: '32', reservations: [legacy()]}, options);
  const release = await acquireDeploymentLock(options);
  try {
    const updated = await reserveBudget(reservation(), options);
    assert.equal(updated.spentAndReservedWei, '42');
    assert.deepEqual(updated.reservations[0], legacy());
    assert.deepEqual(await readBudget(options), updated);
  } finally { await release(); }
});

test('ledger total is recomputed and malformed or negative entries fail closed', () => {
  for (const mutate of [
    v => {v.spentAndReservedWei = '0';}, v => {v.spentAndReservedWei = '-32';},
    v => {v.reservations[0].valueWei = '-1';}, v => {v.reservations[0].maxFeeWei = '0';},
    v => {v.reservations[0].maxFeeWei = 2;}, v => {v.reservations[0].status = 'UNKNOWN';},
    v => {delete v.reservations[0].calldataHash;}, v => {v.reservations = {};},
  ]) {
    const value = {spentAndReservedWei: '32', reservations: [legacy()]}; mutate(value);
    assert.throws(() => validateBudget(value));
  }
});

test('budgets accumulate across bundles and sessions without resetting old reservations', async t => {
  const options = await temporary(t), release = await acquireDeploymentLock(options);
  try {
    await reserveBudget(reservation({maxTotalWei: 15n}), options);
    await assert.rejects(reserveBudget(reservation({id: 'session-b:step-1', nonce: 6n, bundleHash: '0x' + '56'.repeat(32), maxTotalWei: 15n}), options), /TOTAL_TEST_SPEND_BUDGET_EXCEEDED/);
    assert.equal((await readBudget(options)).spentAndReservedWei, '10');
  } finally { await release(); }
});

test('reservation replay and the same sender nonce under a different id are both rejected', async t => {
  const options = await temporary(t), release = await acquireDeploymentLock(options);
  try {
    await reserveBudget(reservation(), options);
    await assert.rejects(reserveBudget(reservation(), options), /DUPLICATE_OR_INVALID_RESERVATION_ID/);
    await assert.rejects(reserveBudget(reservation({id: 'different-session:step-1'}), options), /DUPLICATE_RESERVED_SENDER_NONCE/);
    assert.equal((await readBudget(options)).spentAndReservedWei, '10');
  } finally { await release(); }
});

test('confirmed and reverted reservations remain fully counted and cannot reserve their nonce again', async t => {
  const options = await temporary(t), release = await acquireDeploymentLock(options);
  try {
    let ledger = await reserveBudget(reservation(), options);
    for (const status of ['CONFIRMED_SUCCESS', 'CONFIRMED_REVERTED', 'SUBMISSION_UNKNOWN']) {
      ledger.reservations[0].status = status;
      await writeAtomic('deployments/live-budget.json', ledger, options);
      assert.equal((await readBudget(options)).spentAndReservedWei, '10');
      await assert.rejects(reserveBudget(reservation({id: 'replay:' + status}), options), /DUPLICATE_RESERVED_SENDER_NONCE/);
    }
  } finally { await release(); }
});

test('reservation requires the shared lock and validates positive limits, binding, and nonce', async t => {
  const options = await temporary(t);
  await fs.mkdir(path.join(options.root, 'deployments'));
  await assert.rejects(reserveBudget(reservation(), options), /SHARED_DEPLOYMENT_LOCK_REQUIRED/);
  const release = await acquireDeploymentLock(options);
  try {
    for (const change of [{maxTotalWei: 0n}, {maxFeeWei: -1n}, {valueWei: '-1'}, {nonce: 1.5}, {sender: '0x'}, {bundleHash: 'bad'}, {id: '../bad'}, {operation: 'bad\noperation'}]) {
      await assert.rejects(reserveBudget(reservation(change), options));
    }
    assert.equal((await readBudget(options)).spentAndReservedWei, '0');
  } finally { await release(); }
});

test('shared exclusive lock refuses simultaneous and stale lock files, and normal release is idempotent', async t => {
  const options = await temporary(t), release = await acquireDeploymentLock(options);
  await assert.rejects(acquireDeploymentLock(options), /DEPLOYMENT_LOCK_ALREADY_EXISTS/);
  await release(); await release();
  await fs.writeFile(path.join(options.root, 'deployments/live-budget.lock'), 'stale');
  await assert.rejects(acquireDeploymentLock(options), /DEPLOYMENT_LOCK_ALREADY_EXISTS/);
  assert.equal(await fs.readFile(path.join(options.root, 'deployments/live-budget.lock'), 'utf8'), 'stale');
});

test('release does not remove a replaced lock', async t => {
  const options = await temporary(t), release = await acquireDeploymentLock(options);
  const lock = path.join(options.root, 'deployments/live-budget.lock');
  await fs.rename(lock, lock + '.old');
  await fs.writeFile(lock, 'replacement');
  await assert.rejects(release(), /DEPLOYMENT_LOCK_REPLACED_REVIEW_REQUIRED/);
  assert.equal(await fs.readFile(lock, 'utf8'), 'replacement');
});

test('atomic state writes roundtrip BigInt, replace old contents, leave no temporary files and restrict permissions', async t => {
  const options = await temporary(t);
  await writeAtomic('deployments/journal.json', {nonce: 5n}, options);
  await writeAtomic('deployments/journal.json', {nonce: 6n, status: 'SUBMISSION_UNKNOWN'}, options);
  const result = await readConfinedJson('deployments/journal.json', options);
  assert.deepEqual(result.value, {nonce: '6', status: 'SUBMISSION_UNKNOWN'});
  assert.equal(Buffer.isBuffer(result.raw), true);
  assert.equal(result.path, path.join(options.root, 'deployments/journal.json'));
  assert.deepEqual(await fs.readdir(path.join(options.root, 'deployments')), ['journal.json']);
  assert.equal((await fs.stat(result.path)).mode & 0o777, 0o600);
});

test('failure before atomic rename preserves the previous journal and cleans the temporary file', async t => {
  const options = await temporary(t);
  await writeAtomic('deployments/journal.json', {status: 'SUBMITTED'}, options);
  const circular = {}; circular.self = circular;
  await assert.rejects(writeAtomic('deployments/journal.json', circular, options));
  assert.deepEqual((await readConfinedJson('deployments/journal.json', options)).value, {status: 'SUBMITTED'});
  assert.deepEqual(await fs.readdir(path.join(options.root, 'deployments')), ['journal.json']);
});

test('escaping paths, symlink files and symlink parent directories are refused without changing their target', async t => {
  const options = await temporary(t);
  await fs.mkdir(path.join(options.root, 'real'));
  await fs.writeFile(path.join(options.root, 'real/target.json'), '{"untouched":true}\n');
  await fs.symlink('real/target.json', path.join(options.root, 'link.json'));
  await fs.symlink('real', path.join(options.root, 'alias'));
  for (const relative of ['../escape.json', path.join(options.root, 'absolute.json'), 'link.json', 'alias/target.json']) {
    await assert.rejects(writeAtomic(relative, {modified: true}, options));
    await assert.rejects(readConfinedJson(relative, options));
  }
  assert.equal(await fs.readFile(path.join(options.root, 'real/target.json'), 'utf8'), '{"untouched":true}\n');
});

test('invalid JSON and a symlink ledger are never silently reset', async t => {
  const options = await temporary(t);
  await fs.mkdir(path.join(options.root, 'deployments'));
  const file = path.join(options.root, 'deployments/live-budget.json');
  await fs.writeFile(file, '{');
  await assert.rejects(readBudget(options), /STATE_JSON_INVALID/);
  await fs.rename(file, file + '.broken');
  await fs.symlink('live-budget.json.broken', file);
  await assert.rejects(readBudget(options), /STATE_FILE_NOT_REGULAR_OR_SYMLINK/);
});

test('tool hash binds runtime source and session, but excludes tests, observation files and reports', async t => {
  const options = await temporary(t), dir = path.join(options.root, 'live-test');
  await fs.mkdir(path.join(dir, 'observations'), {recursive: true});
  await fs.mkdir(path.join(dir, 'reports'));
  await fs.writeFile(path.join(dir, 'runner.mjs'), 'export const version=1;\n');
  await fs.writeFile(path.join(dir, 'SESSION_PLAN.json'), '{"delay":600}\n');
  const initial = await bootstrapToolHash(options);
  await fs.writeFile(path.join(dir, 'runner.test.mjs'), 'changed tests');
  await fs.writeFile(path.join(dir, 'REPORT.md'), 'changed report');
  await fs.writeFile(path.join(dir, 'observations/transient.mjs'), 'not executable source');
  await fs.writeFile(path.join(dir, 'reports/transient.json'), '{}');
  assert.equal(await bootstrapToolHash(options), initial);
  await fs.writeFile(path.join(dir, 'runner.mjs'), 'export const version=2;\n');
  const changedSource = await bootstrapToolHash(options); assert.notEqual(changedSource, initial);
  await fs.writeFile(path.join(dir, 'SESSION_PLAN.json'), '{"delay":601}\n');
  assert.notEqual(await bootstrapToolHash(options), changedSource);
});

test('symlink runtime inputs cannot produce a bootstrap tool hash', async t => {
  const options = await temporary(t), dir = path.join(options.root, 'live-test');
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, 'SESSION_PLAN.json'), '{}');
  await fs.writeFile(path.join(options.root, 'outside.mjs'), 'outside');
  await fs.symlink('../outside.mjs', path.join(dir, 'runner.mjs'));
  await assert.rejects(bootstrapToolHash(options), /BOOTSTRAP_SOURCE_SYMLINK_REFUSED/);
});
