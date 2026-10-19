#!/usr/bin/env node
/** Local governance only. No .env loading, private key reading or source-RPC writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWalletClient, encodeAbiParameters, encodeFunctionData, http, keccak256, parseAbi, stringToHex, zeroAddress, zeroHash} from 'viem';
import {executionConfig, publicClient, verifyExecutionTarget, actorAddress, safeDiagnostic} from '../sdk/execution.ts';
import {configurationHash, loadArtifact, protocolConfigSchema} from '../sdk/contracts.ts';
import {confinedFile} from '../sdk/order-source.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const LOCAL_GAS_CAP=15_000_000n;
const serialize=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const help='node --import tsx scripts/configure-local.mjs --factory <proxy> --template <logic> --timelock <controller> --from <public-address> --config <repository-config.json> [--send-local]\nMODE must explicitly be mock or fork. Default is a read-only plan; --send-local schedules, advances only verified local Anvil time and executes governance.';

export function parseArguments(argv){
 const values=new Set(['--factory','--template','--timelock','--from','--config']);
 const result={sendLocal:false};
 if(argv.length===1&&argv[0]==='--help')return {help:true};
 const seen=new Set();
 for(let i=0;i<argv.length;i++){
  const key=argv[i];if(seen.has(key))throw new Error('Invalid duplicate argument');seen.add(key);
  if(key==='--send-local'){result.sendLocal=true;continue;}
  if(!values.has(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Invalid configure-local argument');
  result[key.slice(2)]=argv[++i];
 }
 for(const key of values)if(!result[key.slice(2)])throw new Error('Missing explicit '+key);
 for(const key of ['factory','template','timelock','from'])result[key]=actorAddress(result[key]);
 if(new Set(['factory','template','timelock'].map(k=>result[k].toLowerCase())).size!==3)throw new Error('Invalid overlapping governance addresses');
 return result;
}

export function localConfiguration(env,input){
 if(!['mock','fork'].includes(env.MODE))throw new Error('Invalid MODE: configure-local requires explicit mock or fork; live is forbidden');
 if(env.EXPECTED_EXECUTION_CHAIN_ID!=='56'||env.SOURCE_CHAIN_ID!=='56')throw new Error('Invalid explicit chain configuration: both chain IDs must be 56');
 const execution=executionConfig({MODE:env.MODE,EXECUTION_RPC_URL:env.EXECUTION_RPC_URL,EXPECTED_EXECUTION_CHAIN_ID:env.EXPECTED_EXECUTION_CHAIN_ID,SOURCE_CHAIN_ID:env.SOURCE_CHAIN_ID,FORK_BLOCK_NUMBER:env.FORK_BLOCK_NUMBER,FORK_BLOCK_HASH:env.FORK_BLOCK_HASH,FORK_EXECUTION_TOPOLOGY:env.FORK_EXECUTION_TOPOLOGY,FORK_SESSION_ID:env.FORK_SESSION_ID});
 const config=protocolConfigSchema.parse(input);
 if(config.chainId!=='56'||config.templateVersion!==1||BigInt(config.safetyMargin)>=2n**64n)throw new Error('Configuration chain/version/uint64 bounds mismatch');
 if(config.marketKind===1)throw new Error('OfficialAdapterDisabled: CIRCUIT_RESERVED cannot be configured');
 if(execution.mode==='mock'&&!config.mockOnly)throw new Error('Configuration mock mode requires mockOnly=true');
 if(execution.mode==='fork'&&(config.mockOnly||config.marketKind!==0))throw new Error('Configuration fork mode requires real Seaport config with mockOnly=false');
 for(const key of ['market','collection','mining','bem'])actorAddress(config[key]);
 return {execution,config};
}

export function operationSalt(factory,template,configHash,from){
 return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'address'},{type:'address'},{type:'bytes32'},{type:'address'}],[keccak256(stringToHex('TapeOut.configure-local.v1')),factory,template,configHash,from]));
}

async function save(report){
 if(!/^0x[0-9a-f]{64}$/i.test(report.operationId??''))return;
 const directory=path.join(ROOT,'reports');await fs.mkdir(directory,{recursive:true});
 if(await fs.realpath(directory)!==directory)throw new Error('Invalid report directory boundary');
 const file=path.join(directory,`local-governance-${report.operationId}.json`);
 try{if((await fs.lstat(file)).isSymbolicLink())throw new Error('Invalid report file boundary');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.writeFile(file,serialize(report),{mode:0o600});
}

export async function main(argv=process.argv.slice(2),env=process.env){
 let report={status:'NOT_EXECUTED',localOnly:true,productionReady:false,transactions:[]};
 try{
  const args=parseArguments(argv);if(args.help){console.log(help);return 0;}
  if(await fs.realpath(process.cwd())!==await fs.realpath(ROOT))throw new Error('Invalid working directory: run from repository root');
  // Reject live before opening even the supplied configuration file or connecting.
  if(!['mock','fork'].includes(env.MODE))throw new Error('Invalid MODE: configure-local requires explicit mock or fork; live is forbidden');
  const configFile=await confinedFile(ROOT,args.config);
  const {execution,config}=localConfiguration(env,JSON.parse(await fs.readFile(configFile,'utf8')));
  const client=publicClient(execution);
  const target=await verifyExecutionTarget(execution,client);
  const factoryArtifact=await loadArtifact('GroupBuyFactory'),vaultArtifact=await loadArtifact('GroupBuyVault');
  const timelockArtifact=JSON.parse(await fs.readFile(await confinedFile(ROOT,'out/GovernanceTimelock.sol/GovernanceTimelock.json'),'utf8'));
  const factory={address:args.factory,abi:factoryArtifact.abi};
  const template={address:args.template,abi:vaultArtifact.abi};
  const timelock={address:args.timelock,abi:timelockArtifact.abi};
  const checkpoint=await client.getBlock();
  const read=(contract,functionName,callArgs=[])=>client.readContract({...contract,functionName,args:callArgs,blockNumber:checkpoint.number});
  const code={};
  for(const [label,address] of Object.entries({factory:args.factory,template:args.template,timelock:args.timelock,market:config.market,collection:config.collection,mining:config.mining,bem:config.bem})){
   code[label]=await client.getCode({address,blockNumber:checkpoint.number});
   if(!code[label]||code[label]==='0x')throw new Error('Contract code missing: '+label);
  }
  const templateHash=keccak256(code.template),configHash=configurationHash(config);
  if(keccak256(code.market).toLowerCase()!==config.marketCodeHash.toLowerCase())throw new Error('Configuration market code hash mismatch');
  if((await read(factory,'upgradeAdmin')).toLowerCase()!==args.timelock.toLowerCase())throw new Error('Configuration Factory upgradeAdmin mismatch');
  if((await read(template,'implementationSelf')).toLowerCase()!==args.template.toLowerCase()||!(await read(template,'templateInitializersDisabled'))||await read(template,'vaultTemplateId')!==keccak256(stringToHex('TapeOut.GroupBuyVault.v1')))throw new Error('Configuration template is not fixed initialized-locked v1 logic');
  const delay=await read(timelock,'getMinDelay'),floor=await read(timelock,'minimumDelayFloor'),required=await read(factory,'requiredMinDelay');
  if(delay<=0n||floor<=0n||delay<floor||delay<required||(await read(timelock,'deploymentAddress')).toLowerCase()!==args.timelock.toLowerCase())throw new Error('Configuration genuine local Timelock delay/deployment mismatch');
  const proposer=await read(timelock,'PROPOSER_ROLE'),executor=await read(timelock,'EXECUTOR_ROLE'),guardian=await read(factory,'guardian');
  if(!(await read(timelock,'hasRole',[proposer,args.from]))||(!(await read(timelock,'hasRole',[executor,args.from]))&&!(await read(timelock,'hasRole',[executor,zeroAddress]))))throw new Error('Configuration --from must be local proposer and executor');
  if(!(await read(timelock,'hasRole',[zeroHash,args.timelock]))||guardian.toLowerCase()===args.timelock.toLowerCase()||await read(timelock,'hasRole',[proposer,guardian])||await read(timelock,'hasRole',[zeroHash,guardian]))throw new Error('Configuration Timelock self-admin or independent guardian mismatch');
  if(config.marketKind===0){
   const [version,domain]=await read({address:config.market,abi:parseAbi(['function information() view returns (string version,bytes32 domainSeparator,address conduitController)'])},'information');
   const versionHash=keccak256(stringToHex(version));
   const expectedDomain=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'uint256'},{type:'address'}],[keccak256(stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),keccak256(stringToHex('Seaport')),versionHash,56n,config.market]));
   if(versionHash!==config.seaportVersionHash||domain!==config.seaportDomainSeparator||domain!==expectedDomain)throw new Error('Configuration Seaport domain/version mismatch');
  }
  const calls=[['approveTemplate',[args.template,1,templateHash]],['approveConfig',[config]],['selectConfiguration',[args.template,configHash]],['resumeCreation',[]]].map(([functionName,callArgs])=>encodeFunctionData({abi:factory.abi,functionName,args:callArgs}));
  const targets=calls.map(()=>args.factory),values=calls.map(()=>0n),salt=operationSalt(args.factory,args.template,configHash,args.from);
  const batch=[targets,values,calls,zeroHash,salt];
  const operationId=await read(timelock,'hashOperationBatch',batch);
  let operationState=Number(await read(timelock,'getOperationState',[operationId]));
  report={...report,status:'PREPARED_NOT_EXECUTED',mode:execution.mode,chainId:56,checkpoint:{number:checkpoint.number,hash:checkpoint.hash},execution:target,factory:args.factory,template:args.template,timelock:args.timelock,from:args.from,guardian,configFile:path.relative(ROOT,configFile),configHash,templateCodeHash:templateHash,minimumDelay:delay,minimumDelayFloor:floor,operationId,salt,operationState,actions:['approveTemplate','approveConfig','selectConfiguration','resumeCreation'],note:'Only verified local Anvil is used. Advancing local time may expire an order; recheck the fixed order after governance. Interface checks do not certify production governance bytecode or multisig roles.'};
  const postconditions=async blockNumber=>{
   const get=(functionName,callArgs=[])=>client.readContract({...factory,functionName,args:callArgs,blockNumber});
   const [selected,selectedHash,paused,approval,stored]=await Promise.all([get('selectedTemplate'),get('selectedConfigHash'),get('creationPaused'),get('templateApproval',[args.template]),get('configuration',[configHash])]);
   if(selected.toLowerCase()!==args.template.toLowerCase()||selectedHash!==configHash||paused||!approval.approved||approval.codeHash!==templateHash||Number(approval.version)!==1||!stored[1]||await get('hashConfig',[stored[0]])!==configHash)throw new Error('Receipt configuration postconditions failed');
   return {blockNumber,selectedTemplate:selected,selectedConfigHash:selectedHash,creationPaused:paused,templateApproved:true,configurationApproved:true};
  };
  if(operationState===3){report.status='ALREADY_CONFIGURED_NO_TRANSACTION';report.after=await postconditions(checkpoint.number);await save(report);console.log(serialize(report));return 0;}
  if(operationState===0){await client.simulateContract({...timelock,functionName:'scheduleBatch',args:[...batch,delay],account:args.from});report.scheduleSimulation='PASS';}
  else if(![1,2].includes(operationState))throw new Error('Configuration unknown Timelock operation state');
  await save(report);
  if(!args.sendLocal){console.log(serialize(report));return 0;}
  const wallet=createWalletClient({transport:http(execution.executionRpcUrl,{retryCount:0,timeout:15000})});
  const transact=async(functionName,callArgs)=>{
   await verifyExecutionTarget(execution,client);
   await client.simulateContract({...timelock,functionName,args:callArgs,account:args.from});
   const estimate=await client.estimateContractGas({...timelock,functionName,args:callArgs,account:args.from});
   const gas=estimate*12n/10n+10_000n;if(gas>LOCAL_GAS_CAP)throw new Error('Budget local governance gas cap exceeded');
   const hash=await wallet.writeContract({...timelock,functionName,args:callArgs,account:args.from,chain:null,gas});
   report.transactions.push({operation:functionName,hash,status:'SUBMITTED_LOCAL'});await save(report);
   const receipt=await client.waitForTransactionReceipt({hash,timeout:60000});
   if(receipt.status!=='success'||receipt.from.toLowerCase()!==args.from.toLowerCase()||receipt.to?.toLowerCase()!==args.timelock.toLowerCase())throw new Error('Receipt local governance transaction failed or identity mismatch');
   Object.assign(report.transactions.at(-1),{status:'success',blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed});await save(report);
   return receipt;
  };
  if(operationState===0){await transact('scheduleBatch',[...batch,delay]);report.status='SCHEDULED_LOCAL';await save(report);}
  operationState=Number(await client.readContract({...timelock,functionName:'getOperationState',args:[operationId]}));
  if(![1,2].includes(operationState))throw new Error('Receipt scheduled operation state mismatch');
  if(operationState===1){
   const readyAt=await client.readContract({...timelock,functionName:'getTimestamp',args:[operationId]});
   const now=(await client.getBlock()).timestamp;
   const advance=readyAt>now?readyAt-now+1n:1n;
   if(advance>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Configuration delay exceeds local timestamp RPC bounds');
   await verifyExecutionTarget(execution,client);
   await client.request({method:'evm_increaseTime',params:[Number(advance)]});
   await client.request({method:'evm_mine'});
   report.localTimeAdvancedSeconds=advance;await save(report);
  }
  if(Number(await client.readContract({...timelock,functionName:'getOperationState',args:[operationId]}))!==2)throw new Error('Receipt Timelock not ready after local delay');
  const receipt=await transact('executeBatch',batch);
  if(Number(await client.readContract({...timelock,functionName:'getOperationState',args:[operationId],blockNumber:receipt.blockNumber}))!==3)throw new Error('Receipt operation not completed');
  report.after=await postconditions(receipt.blockNumber);report.status='LOCAL_CONFIGURED';await save(report);console.log(serialize(report));return 0;
 }catch(error){
  const diagnostic=safeDiagnostic(error);report={...report,status:'FAILED',reason:diagnostic.reason};
  try{await save(report);}catch{/* Never write beyond the fixed reports directory. */}
  console.error(serialize(report));return 1;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main();
