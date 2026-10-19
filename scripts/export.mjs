import fs from 'node:fs';
import path from 'node:path';
import {keccak256} from 'viem';
const names=['GroupBuyVault','GroupBuyFactory','GovernanceTimelock','MarketValidator'];
fs.mkdirSync('exports',{recursive:true});
const metadata=[];let ts='// Generated from actual compiler ABI; npm run export\n';
for(const name of names){
 const a=JSON.parse(fs.readFileSync(`out/${name}.sol/${name}.json`,'utf8'));
 const runtime=a.deployedBytecode.object;
 const runtimeBytes=(runtime.length-2)/2;
 if(runtimeBytes>24576)throw new Error(`${name} runtime exceeds EIP170`);
 fs.writeFileSync(`exports/${name}.abi.json`,JSON.stringify(a.abi,null,2)+'\n');
 fs.writeFileSync(`exports/${name}.storage-layout.json`,JSON.stringify(a.storageLayout,null,2)+'\n');
 ts+=`export const ${name}Abi = ${JSON.stringify(a.abi)} as const;\n`;
 metadata.push({name,runtimeBytes,creationBytes:(a.bytecode.object.length-2)/2,runtimeArtifactHash:keccak256(runtime),immutableReferences:a.deployedBytecode.immutableReferences??{},note:'Artifact hash has compiler immutable placeholders; verify actual deployed runtime separately.'});
}
fs.writeFileSync('exports/abi.ts',ts);
fs.writeFileSync('exports/contracts.json',JSON.stringify({compiler:'0.8.24',evmVersion:'paris',optimizerRuns:200,viaIR:true,contracts:metadata},null,2)+'\n');
console.log(JSON.stringify({status:'EXPORTED',contracts:metadata.map(({name,runtimeBytes})=>({name,runtimeBytes}))}));
