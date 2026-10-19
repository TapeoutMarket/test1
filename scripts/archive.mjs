import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourceRoots,files,index,sha} from './release-files.mjs';
const roots=[...sourceRoots,'exports','deployments','reports','CONTRACT_REPORT.md','CONTRACT_REPORT.json','RELEASE_MANIFEST.json'];
const list=files(roots);
for(const file of list){if(file!=='.env.example' && /(^|\/)(\.env(?:\..*)?|node_modules|broadcast|\.git|\.tools|\.runtime|\.npm-cache)(\/|$)/.test(file))throw new Error(`Forbidden archive path: ${file}`);}
const manifest=JSON.parse(fs.readFileSync('RELEASE_MANIFEST.json','utf8'));
if(sha(JSON.stringify(index(files(sourceRoots))))!==manifest.sourceSnapshotHash)throw new Error('Source changed after report; regenerate report');
fs.mkdirSync('artifacts',{recursive:true});const stage=fs.mkdtempSync('artifacts/package-');
for(const file of list){const target=path.join(stage,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
const embedded={...manifest,archive:{...manifest.archive,sha256:null,note:'Use detached RELEASE_MANIFEST.json or adjacent .sha256 for archive checksum.'}};
fs.writeFileSync(path.join(stage,'RELEASE_MANIFEST.json'),JSON.stringify(embedded,null,2)+'\n');
const checksums=list.map(p=>`${sha(fs.readFileSync(path.join(stage,p)))}  ${p}`).join('\n')+'\n';fs.writeFileSync(path.join(stage,'SHA256SUMS'),checksums);
const archive='artifacts/tapeout-groupbuy-v1-source.tar.gz';
const result=spawnSync('tar',['-czf',path.resolve(archive),'-C',stage,'.'],{stdio:'inherit',env:{...process.env,COPYFILE_DISABLE:'1'}});if(result.status!==0)throw new Error('Archive failed');
const hash=sha(fs.readFileSync(archive));fs.writeFileSync(archive+'.sha256',`${hash}  tapeout-groupbuy-v1-source.tar.gz\n`);
manifest.archive.sha256=hash;manifest.archive.bytes=fs.statSync(archive).size;manifest.archive.fileCount=list.length+1;
fs.writeFileSync('RELEASE_MANIFEST.json',JSON.stringify(manifest,null,2)+'\n');
const contents=spawnSync('tar',['-tzf',archive],{encoding:'utf8'});if(contents.status!==0)throw new Error('Cannot read archive');
if(contents.stdout.split('\n').some(p=>/(^|\/)(node_modules|broadcast|\.git|\.tools|\.runtime|\.npm-cache)(\/|$)/.test(p)||/(^|\/)\.env$/.test(p)))throw new Error('Forbidden archive entry');
fs.writeFileSync('artifacts/archive-check.json',JSON.stringify({status:'PASS',archive,sha256:hash,files:list.length+1,explicitAllowlist:roots,secretEnvironmentIncluded:false},null,2)+'\n');
console.log(JSON.stringify({status:'PACKAGED',archive,sha256:hash,bytes:manifest.archive.bytes,files:list.length+1}));
