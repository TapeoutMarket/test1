import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const local='.tools/solc-0.8.24';
fs.mkdirSync('.tools',{recursive:true});
if(!fs.existsSync(local)){
 const platform=process.platform==='darwin'?'macosx-amd64':process.platform==='linux'&&process.arch==='x64'?'linux-amd64':null;
 if(!platform)throw new Error('Install native solc 0.8.24 in .tools/solc-0.8.24 on this platform');
 const base=`https://binaries.soliditylang.org/${platform}/`;
 const indexResponse=await fetch(base+'list.json');if(!indexResponse.ok)throw new Error('Official compiler index unavailable');
 const index=await indexResponse.json();const build=index.builds.find(b=>b.path===index.releases['0.8.24']);
 if(!build || build.longVersion!=='0.8.24+commit.e11b9ed9')throw new Error('Compiler release identity mismatch');
 const response=await fetch(base+build.path);if(!response.ok)throw new Error('Official compiler download unavailable');
 const bytes=Buffer.from(await response.arrayBuffer());const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 if('0x'+hash!==build.sha256)throw new Error('Compiler checksum mismatch');
 fs.writeFileSync(local,bytes,{mode:0o755});
 fs.writeFileSync('.tools/compiler-source.json',JSON.stringify({url:base+build.path,sha256:hash,version:build.longVersion},null,2)+'\n');
}
const compiler=spawnSync(local,['--version'],{encoding:'utf8'});if(compiler.status!==0||!compiler.stdout.includes('0.8.24+commit.e11b9ed9'))throw new Error('Wrong native compiler');
const forge=spawnSync('forge',['--version'],{encoding:'utf8'});if(forge.status!==0||!forge.stdout.includes('1.4.3'))throw new Error('Install Foundry v1.4.3 from official release before building');
console.log(JSON.stringify({status:'LOCAL_TOOLCHAIN_VERIFIED',solc:'0.8.24',foundry:'1.4.3',solcSHA256:crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex')}));
