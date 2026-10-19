import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verificationHash,sha} from './release-files.mjs';
fs.mkdirSync('reports',{recursive:true});
const steps=[];
const startedInputHash=verificationHash();
fs.writeFileSync('reports/verification.json',JSON.stringify({status:'IN_PROGRESS',steps},null,2)+'\n');
function run(name,command,args,json=false){
 const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:100_000_000});
 fs.writeFileSync(`reports/${name}.${json?'json':'txt'}`,result.stdout??'');
 if(result.stderr)fs.writeFileSync(`reports/${name}.stderr.txt`,result.stderr);
 else if(fs.existsSync(`reports/${name}.stderr.txt`))fs.unlinkSync(`reports/${name}.stderr.txt`);
 const status=result.status===0?'PASS':'FAIL';steps.push({name,command:[command,...args],status,exitCode:result.status,evidence:`reports/${name}.${json?'json':'txt'}`,evidenceSHA256:sha(result.stdout??'')});
 fs.writeFileSync('reports/verification.json',JSON.stringify({status:status==='PASS'?'IN_PROGRESS':'FAIL',steps},null,2)+'\n');
 console.log(`${name}: ${status}`);
 if(result.status!==0){console.error((result.stderr||result.stdout||'No output').slice(-5000));process.exit(1);}
}
run('bootstrap',process.execPath,['scripts/bootstrap.mjs']);
run('format',process.execPath,['scripts/forge.mjs','fmt','--check']);
run('clean',process.execPath,['scripts/forge.mjs','clean']);
run('seaport-build',process.execPath,['scripts/build-seaport.mjs']);
run('build',process.execPath,['scripts/forge.mjs','build','--sizes']);
run('solidity-tests',process.execPath,['scripts/forge.mjs','test','--json'],true);
run('gas',process.execPath,['scripts/forge.mjs','test','--match-contract','GasBench.*Test','--gas-report','-vv']);
run('typecheck','npm',['run','typecheck']);
run('sdk-tests','npm',['run','test:sdk']);
run('export',process.execPath,['scripts/export.mjs']);
run('fork-preflight',process.execPath,['--import','tsx','scripts/fork-preflight.mjs']);
const endedInputHash=verificationHash();
if(startedInputHash!==endedInputHash)throw new Error('Verification inputs changed during run; rerun after edits finish');
fs.writeFileSync('reports/verification.json',JSON.stringify({status:'PASS',completed:true,verificationInputHash:endedInputHash,steps},null,2)+'\n');
console.log('Local verification complete. Real BSC fork results, if executed, are recorded separately in reports/real-bsc-fork-tests.json; live/UI remain NOT_RUN.');
