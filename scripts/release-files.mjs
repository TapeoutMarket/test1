import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const sourceRoots=['src','script','test','sdk','cli','schemas','fixtures','scripts','lib','docs','.github',
 'package.json','package-lock.json','tsconfig.json','foundry.toml','remappings.txt','.gitignore','.env.example','README.md',
 'SPEC.md','SECURITY_MODEL.md','PROTOCOL_COMPATIBILITY.md','MARKET_HANDOFF.md','FORK_TEST_RUNBOOK.md','LIVE_TEST_CHECKLIST.md','tapeout-groupbuy-codex-prompt.md'];
export function sha(data){return crypto.createHash('sha256').update(data).digest('hex');}
export function files(roots){
 const result=[];
 function walk(p){if(!fs.existsSync(p))throw new Error(`Required delivery missing: ${p}`);const s=fs.lstatSync(p);if(s.isSymbolicLink())throw new Error('Symlinks not allowed in release');if(s.isDirectory())for(const name of fs.readdirSync(p).sort())walk(path.posix.join(p,name));else result.push(p);}
 roots.forEach(walk);return result.sort();
}
export function index(paths){return paths.map(file=>({path:file,sha256:sha(fs.readFileSync(file)),bytes:fs.statSync(file).size}));}
export const verificationRoots=['src','script','test','sdk','cli','schemas','scripts','lib','fixtures','package.json','package-lock.json','tsconfig.json','foundry.toml','remappings.txt'];
export function verificationHash(){return sha(JSON.stringify(index(files(verificationRoots))));}
