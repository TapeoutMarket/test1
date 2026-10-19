import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import solc from 'solc-seaport';
const root=process.cwd();
if(!solc.version().startsWith('0.8.17+'))throw new Error('Unexpected Seaport compiler');
const sources={};
function collect(dir) {for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
 const p=path.join(dir,entry.name);if(entry.isDirectory())collect(p);else if(entry.name.endsWith('.sol')){
  const key=p.replace(/^node_modules\//,'');sources[key]={content:fs.readFileSync(p,'utf8')};
 }
}}
collect('node_modules/seaport-core/src');collect('node_modules/seaport-types/src');
const settings={optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'london',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode']}}};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings})));
const errors=(output.errors??[]).filter(e=>e.severity==='error');if(errors.length){console.error(errors.map(e=>e.formattedMessage).join('\n'));process.exit(1);}
fs.mkdirSync('fixtures/seaport',{recursive:true});
const artifacts=[];
for(const [source,name] of [['seaport-core/src/Seaport.sol','Seaport'],['seaport-core/src/conduit/ConduitController.sol','ConduitController']]){
 const c=output.contracts[source][name];const bytes=c.evm.deployedBytecode.object.length/2;if(bytes>24576)throw new Error(`${name} exceeds EIP170: ${bytes}`);
 const artifact={contractName:name,abi:c.abi,bytecode:{object:'0x'+c.evm.bytecode.object},deployedBytecode:{object:'0x'+c.evm.deployedBytecode.object}};
 fs.writeFileSync(`fixtures/seaport/${name}.json`,JSON.stringify(artifact,null,2)+'\n');artifacts.push({name,runtimeBytes:bytes});
}
fs.writeFileSync('fixtures/seaport/BUILD.json',JSON.stringify({kind:'REAL_SEAPORT_SOURCE_LOCAL_ARTIFACT_NOT_BSC_FORK',packages:{core:'1.5.0',types:'0.0.1'},compiler:solc.version(),settings,artifacts,sources:Object.entries(sources).map(([file,{content}])=>({file,sha256:crypto.createHash('sha256').update(content).digest('hex')}))},null,2)+'\n');
console.log(JSON.stringify({status:'REAL_SOURCE_COMPILED',compiler:solc.version(),artifacts}));
