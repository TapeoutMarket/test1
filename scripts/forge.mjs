import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// A fresh HOME keeps Foundry away from personal RPC/wallet/global config.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = path.join(root, '.runtime', 'foundry');
mkdirSync(home, {recursive: true});
const allowed = ['PATH', 'TMPDIR', 'SYSTEMROOT', 'LANG', 'LC_ALL'];
const env = Object.fromEntries(allowed.filter(k => process.env[k]).map(k => [k, process.env[k]]));
env.HOME = home;
env.FOUNDRY_DISABLE_NIGHTLY_WARNING = '1';
const args = process.argv.slice(2);
if (!['build','test','fmt','inspect','clean','snapshot','config','script'].includes(args[0])) throw new Error('unsupported local forge operation');
if(args[0]==='script') {
  if(args.length!==8 || args[1]!=='script/DeployLocal.s.sol:DeployLocal' || args[2]!=='--rpc-url' || args[4]!=='--sender' || args[6]!=='--unlocked' || args[7]!=='--broadcast') throw new Error('Only the explicit local deployment CLI invocation is allowed');
  const url=new URL(args[3]);
  if(url.protocol!=='http:' || !['127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Only numeric loopback Anvil is allowed');
  const {createPublicClient,http}=await import('viem');
  const client=createPublicClient({transport:http(url.toString(),{retryCount:0,timeout:5000})});
  if(await client.getChainId()!==56 || !/^anvil\//i.test(await client.request({method:'web3_clientVersion'}))) throw new Error('Local Anvil identity mismatch');
  await client.request({method:'anvil_nodeInfo'});
  args.push('--offline');
}
if (['build','test','inspect','snapshot'].includes(args[0]) && !args.includes('--offline')) args.push('--offline');
const result = spawnSync('forge', args, { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error('Local forge executable unavailable');
process.exit(result.status ?? 1);
