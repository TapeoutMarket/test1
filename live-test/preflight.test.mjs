import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fundingPlan, guardedProvider, readOnlyClientFromEnv, TOTAL, SHARE} from './preflight.mjs';

test('exact stated 0.2/0.1 balances cannot fund 100 integral shares or fees', () => {
  const p = fundingPlan(200000000000000000n, 100000000000000000n);
  assert.equal(p.totalMaximumSharesBeforeGas, 99n);
  assert.equal(p.aggregatePrincipalShortfallWei, 3000000000000000n);
  assert.equal(p.completeFundingPossibleBeforeGas, false);
  assert.equal(p.gasIncluded, false);
});
test('aggregate balance alone is insufficient when share rounding strands funds', () => {
  const p = fundingPlan(SHARE / 2n, TOTAL - SHARE / 2n);
  assert.equal(p.aggregatePrincipalShortfallWei, 0n);
  assert.equal(p.totalMaximumSharesBeforeGas, 99n);
  assert.equal(p.completeFundingPossibleBeforeGas, false);
});
test('67/33 exact contributions completely fund the order but do not include gas', () => {
  const p = fundingPlan(67n * SHARE, 33n * SHARE);
  assert.equal(p.totalMaximumSharesBeforeGas, 100n);
  assert.equal(p.completeFundingPossibleBeforeGas, true);
  assert.equal(p.allocationConfirmed, true);
  assert.equal(p.confirmedAllocationFundedBeforeGas, true);
});
test('live observed balances cover principal without claiming a full gas budget', () => {
  const p = fundingPlan(204835734200000000n, 114878979500000000n);
  assert.equal(p.completeFundingPossibleBeforeGas, true);
  assert.equal(p.gasIncluded, false);
});
test('negative balances are rejected', () => assert.throws(() => fundingPlan(-1n, 0n), /NEGATIVE_BALANCE/));
test('funding another split does not mean the confirmed 67/33 split is funded', () => {
  const p = fundingPlan(SHARE * 66n, SHARE * 34n);
  assert.equal(p.completeFundingPossibleBeforeGas, true);
  assert.equal(p.confirmedAllocationFundedBeforeGas, false);
});
test('read-only RPC methods reach the underlying provider', async () => {
  const seen = [];
  const p = guardedProvider({request: async req => { seen.push(req); return '0x38'; }});
  assert.equal(await p.request({method: 'eth_chainId'}), '0x38');
  assert.equal(seen.length, 1);
});
test('broadcast, wallet signatures, impersonation and unknown RPCs cannot reach transport', async () => {
  let calls = 0;
  const p = guardedProvider({request: async () => { calls++; }});
  for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'eth_sign', 'eth_signTypedData_v4', 'personal_sign', 'anvil_impersonateAccount', 'anvil_setBalance', 'wallet_sendCalls', 'unknown']) {
    await assert.rejects(p.request({method, params: []}), /READ_ONLY_RPC_METHOD_REFUSED/);
  }
  assert.equal(calls, 0);
});
test('environment input is mandatory', async () => assert.rejects(readOnlyClientFromEnv(), /EXPLICIT_ENV_FILE_REQUIRED/));
test('CLI refuses broadcast before reading environment or opening a network connection', () => {
  const result = spawnSync(process.execPath, ['live-test/preflight.mjs', '--env', '../.env', '--broadcast'], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).mainnetTransactionsSent, 0);
  assert.match(JSON.parse(result.stderr).reason, /USAGE/);
});
