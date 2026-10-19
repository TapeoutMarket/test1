import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createPublicClient,createWalletClient,http,encodeFunctionData,keccak256,toHex} from 'viem';
import {verificationHash} from './release-files.mjs';
const inputHash=verificationHash();
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/local-smoke.json',JSON.stringify({status:'IN_PROGRESS',verificationInputHash:inputHash,layer:'MOCK_LOCAL_ANVIL_ONLY',fork:'NOT_RUN',live:'NOT_RUN'},null,2)+'\n');
const url='http://127.0.0.1:18545';
const minimal=Object.fromEntries(['PATH','TMPDIR','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const child=spawn('anvil',['--host','127.0.0.1','--port','18545','--chain-id','56','--silent'],{env:minimal,stdio:'ignore'});
let anvilExited=false;child.on('exit',()=>{anvilExited=true;});
const client=createPublicClient({transport:http(url,{timeout:1500,retryCount:0}),pollingInterval:25});
const wallet=createWalletClient({transport:http(url,{timeout:1500,retryCount:0})});
const zero='0x0000000000000000000000000000000000000000',z32='0x'+'00'.repeat(32);
const artifact=name=>{
 const matches=fs.readdirSync('out',{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>`out/${x.name}/${name}.json`).filter(p=>fs.existsSync(p));
 if(matches.length!==1)throw new Error(`Missing or ambiguous compiled artifact: ${name}`);
 return JSON.parse(fs.readFileSync(matches[0],'utf8'));
};
const results=[];
const ser=v=>JSON.stringify(v,(_,v)=>typeof v==='bigint'?String(v):v,2);
let actor;
async function transact(to,abi,functionName,args=[],value=0n,account=actor){
 const hash=await wallet.writeContract({address:to,abi,functionName,args,value,account,chain:null,gas:15000000n});
 const r=await client.waitForTransactionReceipt({hash});if(r.status!=='success')throw new Error(`local ${functionName} reverted`);
 results.push({operation:functionName,hash,blockNumber:r.blockNumber,gasUsed:r.gasUsed});return r;
}
async function deploy(name,args=[]){const a=artifact(name);const hash=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args,account:actor,chain:null,gas:25000000n});const r=await client.waitForTransactionReceipt({hash});if(r.status!=='success'||!r.contractAddress)throw new Error(`local ${name} deploy failed`);results.push({operation:`deploy:${name}`,hash,blockNumber:r.blockNumber,gasUsed:r.gasUsed});return {address:r.contractAddress,abi:a.abi};}
try{
 let ready=false;for(let i=0;i<20;i++){if(anvilExited)throw new Error('Anvil could not start or bind loopback port');try{if(await client.getChainId()===56){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 if(!ready||anvilExited)throw new Error('Fresh loopback Anvil unavailable or port already occupied');
 const version=await client.request({method:'web3_clientVersion'});if(!version.toLowerCase().includes('anvil'))throw new Error('Not Anvil');
 const nodeInfo=await client.request({method:'anvil_nodeInfo'});
 if(anvilExited || nodeInfo.forkConfig?.forkUrl || await client.getBlockNumber()!==0n)throw new Error('Expected a fresh non-forked local chain');
 const accounts=await wallet.getAddresses();[actor]=accounts;const guardian=accounts[2],seller=accounts[3];
 const nft=await deploy('MockNFT'),bem=await deploy('MockBEM'),mining=await deploy('MockMining',[bem.address]),market=await deploy('MockCircuitMarket');
 const template=await deploy('GroupBuyVault'),timelock=await deploy('GovernanceTimelock',[1n,[actor],[actor]]),impl=await deploy('GroupBuyFactory');
 const proxy=await deploy('ERC1967Proxy',[impl.address,encodeFunctionData({abi:impl.abi,functionName:'initialize',args:[timelock.address,guardian,1n]})]);
 const factory={address:proxy.address,abi:impl.abi};
 await transact(nft.address,nft.abi,'mint',[seller,3204n]);await transact(nft.address,nft.abi,'setApprovalForAll',[market.address,true],0n,seller);
 const price=100000057n;await transact(market.address,market.abi,'list',[1n,seller,nft.address,3204n,price,100]);
 const config={chainId:56n,templateVersion:1,marketKind:2,market:market.address,collection:nft.address,mining:mining.address,bem:bem.address,marketCodeHash:keccak256(await client.getCode({address:market.address})),seaportDomainSeparator:z32,seaportVersionHash:z32,safetyMargin:60n,mockOnly:true};
 const configHash=await client.readContract({...factory,functionName:'hashConfig',args:[config]});
 fs.mkdirSync('deployments/mock/56',{recursive:true});
 fs.writeFileSync('deployments/mock/56/config.json',ser(config)+'\n');
 function configure(factoryAddress,templateAddress,timelockAddress){for(const sendArgs of [[],['--send-local']]){
  const r=spawnSync(process.execPath,['--import','tsx','scripts/configure-local.mjs','--factory',factoryAddress,'--template',templateAddress,'--timelock',timelockAddress,'--from',actor,'--config','deployments/mock/56/config.json',...sendArgs],{cwd:process.cwd(),env:{...minimal,MODE:'mock',EXECUTION_RPC_URL:url,EXPECTED_EXECUTION_CHAIN_ID:'56',SOURCE_CHAIN_ID:'56'},encoding:'utf8',maxBuffer:8000000});
  if(r.status!==0)throw new Error(`Local governance configuration failed: ${r.stderr}`);
  results.push({operation:sendArgs.length?'configure-local:send':'configure-local:dry-run',status:'PASS',output:r.stdout.trim()});
 }}
 configure(factory.address,template.address,timelock.address);
 const now=(await client.getBlock()).timestamp;
 const terms={seller,tokenId:3204n,totalPrice:price,deadline:now+86400n,orderHash:z32,counter:0n,listingId:1n,listingPrice:price,feeBps:100,executionHash:keccak256('0x'),orderStart:0n,orderEnd:0n,name:'tapeout3204',metadataURI:'ipfs://local/3204/{id}.json'};
 const address=await client.readContract({...factory,functionName:'predictPool',args:[actor,template.address,configHash,terms,'0x',1n]});
 const vault={address,abi:template.abi};
 fs.mkdirSync('deployments/mock/56',{recursive:true});
 const manifest={mode:'mock',productionReady:false,rpc:url,chainId:56,factory:factory.address,template:template.address,timelock:timelock.address,guardian,accounts:{a:actor,b:accounts[1],seller},vault:address,configHash,config,terms,localOnly:true};
 fs.writeFileSync('deployments/mock/56/local.json',ser(manifest)+'\n');
 fs.writeFileSync('deployments/mock/56/config.json',ser(config)+'\n');fs.writeFileSync('deployments/mock/56/terms.json',ser(terms)+'\n');
 fs.writeFileSync('deployments/mock/56/mock-terms.json',ser({scope:'LOCAL_MOCK_ONLY',seller,tokenId:'3204',totalPrice:String(price),deadline:String(terms.deadline),listingId:'1',feeBps:100,name:terms.name,metadataURI:terms.metadataURI})+'\n');
 const cli=(command,args=[])=>{const r=spawnSync(process.execPath,['--import','tsx','cli/index.ts',command,...args],{cwd:process.cwd(),env:{...minimal,MODE:'mock',EXECUTION_RPC_URL:url,EXPECTED_EXECUTION_CHAIN_ID:'56',SOURCE_CHAIN_ID:'56'},encoding:'utf8',maxBuffer:8000000});if(r.status!==0)throw new Error(`CLI ${command} failed: ${r.stderr}`);results.push({operation:`CLI:${command}`,status:'PASS',output:r.stdout.trim()});return r.stdout;};
 cli('create-pool',['--factory',factory.address,'--from',actor,'--expected-template',template.address,'--config','deployments/mock/56/config.json','--mock-terms','deployments/mock/56/mock-terms.json','--round','1','--send-local']);
 cli('inspect',['--vault',address]);
 const aIds=Array.from({length:45},(_,i)=>i+1).join(','),bIds=Array.from({length:55},(_,i)=>i+46).join(',');
 cli('contribute',['--vault',address,'--from',actor,'--ids',aIds]);
 cli('contribute',['--vault',address,'--from',actor,'--ids',aIds,'--send-local']);
 cli('withdraw',['--vault',address,'--from',actor,'--ids','1','--send-local']);
 cli('contribute',['--vault',address,'--from',actor,'--ids','1','--send-local']);
 cli('contribute',['--vault',address,'--from',accounts[1],'--ids',bIds,'--require-completion','--send-local']);
 await transact(mining.address,mining.abi,'setPending',[nft.address,3204n,10037n]);
 cli('harvest',['--vault',address,'--from',actor,'--send-local']);
 cli('claim-batch',['--vault',address,'--from',actor,'--ids',aIds,'--send-local']);
 cli('claim-batch',['--vault',address,'--from',accounts[1],'--ids',bIds,'--send-local']);
 cli('transfer-shares',['--vault',address,'--from',accounts[1],'--to',actor,'--ids',bIds,'--send-local']);
 cli('redeem',['--vault',address,'--from',actor,'--send-local']);
 cli('report',['--vault',address,'--out','reports/local-cli-final-state.json']);
 const state=await client.readContract({...vault,functionName:'state'}),owner=await client.readContract({...nft,functionName:'ownerOf',args:[3204n]});
 if(state!==4 || owner.toLowerCase()!==actor.toLowerCase())throw new Error('Final postcondition failed');
 // Exercise the remaining CLI paths on independent disposable local pools.
 async function extraPool(tokenId,ttl=86400n){
  await transact(nft.address,nft.abi,'mint',[seller,tokenId]);
  await transact(market.address,market.abi,'list',[tokenId,seller,nft.address,tokenId,price,100]);
  const t={...terms,tokenId,listingId:tokenId,deadline:(await client.getBlock()).timestamp+ttl,name:`tapeout${tokenId}`};
  const file=`deployments/mock/56/mock-terms-${tokenId}.json`;
  fs.writeFileSync(file,ser({scope:'LOCAL_MOCK_ONLY',seller,tokenId:String(tokenId),totalPrice:String(price),deadline:String(t.deadline),listingId:String(tokenId),feeBps:100,name:t.name,metadataURI:t.metadataURI})+'\n');
  const v=await client.readContract({...factory,functionName:'predictPool',args:[actor,template.address,configHash,t,'0x',1n]});
  cli('create-pool',['--factory',factory.address,'--from',actor,'--expected-template',template.address,'--config','deployments/mock/56/config.json','--mock-terms',file,'--round','1','--send-local']);
  return v;
 }
 const cancelled=await extraPool(3205n);
 cli('contribute',['--vault',cancelled,'--from',actor,'--ids','1','--send-local']);
 cli('guardian-cancel',['--factory',factory.address,'--vault',cancelled,'--from',guardian,'--reason','1','--send-local']);
 cli('withdraw',['--vault',cancelled,'--from',actor,'--ids','1','--send-local']);
 const expired=await extraPool(3206n,600n);
 cli('contribute',['--vault',expired,'--from',actor,'--ids','1','--send-local']);
 await client.request({method:'evm_increaseTime',params:[601]});await client.request({method:'evm_mine'});
 cli('mark-refundable',['--vault',expired,'--from',accounts[1],'--send-local']);
 cli('withdraw',['--vault',expired,'--from',actor,'--ids','1','--send-local']);
 const emergency=await extraPool(3207n);
 const allIds=Array.from({length:100},(_,i)=>i+1).join(',');
 cli('contribute',['--vault',emergency,'--from',actor,'--ids',allIds,'--require-completion','--send-local']);
 await transact(mining.address,mining.abi,'setPending',[nft.address,3207n,10007n]);
 cli('harvest-and-claim',['--vault',emergency,'--from',actor,'--ids',allIds,'--send-local']);
 await transact(bem.address,bem.abi,'mint',[emergency,103n]);
 await transact(bem.address,bem.abi,'setFaults',[true,true,false]);
 await transact(mining.address,mining.abi,'setBroken',[true]);
 cli('redeem-without-harvest',['--vault',emergency,'--from',actor,'--send-local']);
 await transact(bem.address,bem.abi,'setFaults',[false,false,false]);
 cli('claim-residual',['--vault',emergency,'--from',actor,'--send-local']);
 cli('import-order',['--order','fixtures/seaport-order.example.json']);
 cli('protocol-check',['--order','fixtures/official-order.example.json']);
 cli('deploy-local',['--from',actor]);
 const deployment=cli('deploy-local',['--from',actor,'--send-local']);
 const deployed=Object.fromEntries(['Factory','Template','Timelock'].map(label=>[label,deployment.match(new RegExp(`${label} (0x[0-9a-fA-F]{40})`))?.[1]]));
 if(Object.values(deployed).some(a=>!a))throw new Error('Local deployment public addresses missing');
 configure(deployed.Factory,deployed.Template,deployed.Timelock);
 if(verificationHash()!==inputHash)throw new Error('Source changed during local smoke; rerun when edits finish');
 fs.writeFileSync('reports/local-smoke.json',ser({status:'PASS',verificationInputHash:inputHash,layer:'MOCK_LOCAL_ANVIL_ONLY',chainId:56,usedPrivateKeys:false,transactionsAndCommands:results,final:{state,minerOwner:owner},fork:'NOT_RUN',live:'NOT_RUN'})+'\n');
 console.log(ser({status:'PASS',operations:results.length,report:'reports/local-smoke.json'}));
}catch(e){
 const reason=String(e.message).replace(/https?:\/\/[^\s]+/g,'[RPC_REDACTED]');
 fs.writeFileSync('reports/local-smoke.json',ser({status:'FAIL',verificationInputHash:inputHash,layer:'MOCK_LOCAL_ANVIL_ONLY',reason,transactionsAndCommands:results,fork:'NOT_RUN',live:'NOT_RUN'})+'\n');
 console.error(reason);process.exitCode=1;
}
finally{child.kill('SIGTERM');}
