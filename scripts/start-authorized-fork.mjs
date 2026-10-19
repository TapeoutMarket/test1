#!/usr/bin/env node
// Explicitly authorized input only: secrets stay in this parent process.
import fs from 'node:fs/promises';
import {authorizedInputs} from './probe-authorized-fork.mjs';
import {localConfig,startLocal} from './fork-local.mjs';
try{
 if(process.argv.length!==4||process.argv[2]!=='--env')throw new Error('EXPLICIT_ENV_FILE_REQUIRED');
 const input=await authorizedInputs(process.argv[3]);
 const pin=JSON.parse(await fs.readFile('reports/authorized-source-observation.json','utf8'));
 if(pin.status!=='READ_ONLY_SOURCE_OBSERVED'||pin.chainId!==56||!pin.holderAOwnsConfiguredMiner||JSON.stringify(pin.accounts)!==JSON.stringify(input.accounts))throw new Error('PIN_OR_PUBLIC_ACCOUNTS_MISMATCH');
 const running=await startLocal(localConfig({FORK_SOURCE_RPC_URL:input.source,FORK_BLOCK_NUMBER:pin.blockNumber,FORK_BLOCK_HASH:pin.blockHash,FORK_LOCAL_PORT:'18545'}));
 console.log(JSON.stringify({status:'PINNED_LOCAL_BSC_FORK_RUNNING',...running.manifest,privateKeysUsedForSigning:false},null,2));
 await running.stopped;
}catch(error){
 const code=/^[A-Z_]+$/.test(error?.message??'')?error.message:'FORK_START_FAILED_DETAILS_REDACTED';
 console.error(JSON.stringify({status:'FAILED',reasonCode:code}));process.exitCode=1;
}
