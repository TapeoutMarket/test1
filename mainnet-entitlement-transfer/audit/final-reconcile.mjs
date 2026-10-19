#!/usr/bin/env node
// Offline saved-evidence reconciliation. No client, env access, signing or sending.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {decodeEventLog,decodeErrorResult,encodeErrorResult,encodeFunctionData,keccak256,formatUnits,formatEther,zeroAddress} from 'viem';
import {json} from '../../live-test/preflight.mjs';
import {readConfinedJson,writeAtomic,validateBudget} from '../../live-test/deployment-io.mjs';
// Only the public-file loader is used. Events and all100 states are checked independently below.
import {loadInput} from '../entitlement.mjs';

export const SESSION_HASH='0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
export const TOOL_HASH='e5669faba9b75877600266d392ffd66a3a89313572b726ba4e894c948d34ab38';
const REWARDS_HASH='501b3ba397abf2d824216a7e246fb90a79d5f81b79046e9cd8b89ed77a5e1649';
const OLD_JOURNAL_HASH='0x34c737a318d95784b5b5b057221d9bcd83a5830754598b52210197158e40e237';
const OLD_BUDGET_HASH='0x0b1ec9f6e8df66deb71cc934e2efd039500fae934085c4e712e1feb0dff8aabd';
const HISTORICAL_GAS_REPORT_HASH='0xe65b3018fb177f44e88b0c02c3e27bf7732386dec89cb532809f3b7bb96fe21f';
const BEM_ARTIFACT_HASH='0x717f67039ec7941211cdc07c2c8739e94b8cd03515641edf2ec141923d6681a6';
const NEW_HARVEST_TX='0x0605e95651b4ffe0f5f7dba453e627fad99abb4bc15166b21dd86bd996778a0c';
const OLD_RESERVED=304303991100000000n,LIMIT=304500000000000000n,HISTORICAL_ACTUAL_GAS=1071506500000000n;
const H0=13665485n,P0=13665400n,Q0=136654n,R0=85n;
const STEPS=['new-harvest','transfer-share','buyer-b-claim'];
const NONCES=[13,14,6];
const DATA_HASHES=['0xe060bba62b44b0683c379ec71ca27d4186dc6879cdda27161f89f1f206f42aaf','0xaa5889bfdd0aade43c1a8c4aad701785d53d903a22fed40530a23c88fe209da4','0x8dc886870bbc9b0242614a04a6724f45b7fb8a12a722144324e20d3a5a848c31'];
const PREFIX='mainnet-entitlement-transfer/audit/';
const HASH=/^0x[0-9a-f]{64}$/i;
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const equal=(a,b)=>json(a)===json(b);
const digest=value=>keccak256(Buffer.from(json(value)));
const amount=value=>({raw:String(value),bem:formatUnits(BigInt(value),8),decimals:8});
const money=value=>({wei:String(value),bnb:formatEther(BigInt(value))});
const SCOPE={scope:'OFFLINE_SAVED_EVIDENCE_ONLY',rpcRequests:0,transactionsSent:0,privateKeysUsed:false,freshChainConfirmation:'NOT_RUN',freshNotHolderSimulation:'NOT_RUN',note:'Only saved raw receipts, frozen plans and saved block-state/simulation evidence are reconciled. No current RPC, canonical-chain, balance or NotHolder claim is made.'};
const baselineFor=x=>({receivedRaw:String(x),perShareIncrementRaw:String((x+R0)/100n),totalAccountedRaw:String(H0+x),totalPaidBeforeRaw:String(P0),accPerShareRaw:String(Q0+(x+R0)/100n),remainderRaw:String((x+R0)%100n),previousAccPerShareRaw:String(Q0),previousRemainderRaw:String(R0),decimals:8});
function base(b){need(b?.decimals===8&&/^(0|[1-9][0-9]*)$/.test(b.receivedRaw??''),'BASELINE_REQUIRED');const x=BigInt(b.receivedRaw);need(equal(b,baselineFor(x))&&x>0n&&(x+R0)/100n>0n,'INVALID_POSITIVE_BASELINE');return {x,d:BigInt(b.perShareIncrementRaw),q:BigInt(b.accPerShareRaw),r:BigInt(b.remainderRaw),h:BigInt(b.totalAccountedRaw)};}

export function readiness(journal){const steps=STEPS.map((step,i)=>({step,status:journal?.steps?.[i]?.step===step?journal.steps[i].status:'MISSING',positiveTest:journal?.steps?.[i]?.positiveTest?.status??'NOT_RUN'}));return {ready:journal?.steps?.length===3&&steps.every(e=>e.status==='CONFIRMED'&&e.positiveTest==='PASS'),steps};}
export function outputPathFor(existingStatus){return PREFIX+(existingStatus==='PASS'?'latest-attempt.json':'final-reconciliation.json');}
export function actionFor(input,step){
  const i=STEPS.indexOf(step);need(i>=0,'UNSUPPORTED_AUDIT_STEP');const {session,manifest,vaultAbi}=input,from=i===2?session.buyerB:session.creator,functionName=i===0?'harvest':i===1?'safeTransferFrom':'claim',args=i===0?[]:i===1?[session.creator,session.buyerB,1n,1n,'0x']:[1n],data=encodeFunctionData({abi:vaultAbi,functionName,args});
  need(same(keccak256(data),DATA_HASHES[i]),'INDEPENDENT_CALLDATA_CHANGED');return {step,from,to:manifest.vault.address,pool:manifest.vault.address,valueWei:'0',nonce:NONCES[i],functionName,ids:i===0?[]:[1n],data,dataHash:DATA_HASHES[i],template:manifest.template.address,configHash:manifest.configHash,termsHash:manifest.vault.termsHash,payloadHash:manifest.vault.payloadHash};
}
export function decodeStep(receipt,{action,session,manifest,vaultAbi,bemAbi},baseline=null){
  need(receipt?.status==='success'&&Array.isArray(receipt.logs),'SUCCESS_RECEIPT_REQUIRED');const events=[],bemTransfers=[];
  for(let i=0;i<receipt.logs.length;i++){
    const log=receipt.logs[i];need(log.removed!==true&&same(log.transactionHash,receipt.transactionHash)&&same(log.blockHash,receipt.blockHash)&&String(log.blockNumber)===String(receipt.blockNumber)&&log.transactionIndex===receipt.transactionIndex&&Number.isSafeInteger(log.logIndex)&&log.logIndex>=0&&(i===0||log.logIndex>receipt.logs[i-1].logIndex),'RECEIPT_LOG_IDENTITY_CHANGED');
    need(!same(log.address,session.collection),'UNEXPECTED_MINER_EVENT');
    if(same(log.address,action.pool)){const decoded=decodeEventLog({abi:vaultAbi,data:log.data,topics:log.topics,strict:true});need(['RewardsSynced','Harvested','RewardClaimed','TransferSingle'].includes(decoded.eventName),'UNEXPECTED_VAULT_EVENT');events.push({...decoded,logIndex:log.logIndex});}
    else if(same(log.address,manifest.config.bem)){const decoded=decodeEventLog({abi:bemAbi,data:log.data,topics:log.topics,strict:true});need(decoded.eventName==='Transfer','UNEXPECTED_BEM_EVENT');bemTransfers.push({...decoded,logIndex:log.logIndex});}
  }
  const syncs=events.filter(e=>e.eventName==='RewardsSynced'),harvests=events.filter(e=>e.eventName==='Harvested'),claims=events.filter(e=>e.eventName==='RewardClaimed'),transfers=events.filter(e=>e.eventName==='TransferSingle');let b=baseline,payment=0n;
  if(action.step==='new-harvest'){
    need(baseline===null&&syncs.length===2&&harvests.length===1&&claims.length===0&&transfers.length===0&&bemTransfers.length===1,'EXACT_NEW_HARVEST_EVENTS_REQUIRED');const x=harvests[0].args.received;b=baselineFor(x);const {h,q,r}=base(b),first=syncs[0].args,last=syncs[1].args,mint=bemTransfers[0];
    need(first.received===0n&&first.totalAccounted===H0&&first.accPerShare===Q0&&first.remainder===R0,'OLD_REWARD_LEDGER_CHANGED');need(last.received===x&&last.totalAccounted===h&&last.accPerShare===q&&last.remainder===r&&same(harvests[0].args.caller,session.creator),'NEW_HARVEST_LEDGER_CHANGED');
    need(same(mint.args.from,zeroAddress)&&same(mint.args.to,action.pool)&&mint.args.value===x&&syncs[0].logIndex<mint.logIndex&&mint.logIndex<syncs[1].logIndex&&syncs[1].logIndex<harvests[0].logIndex,'ACTUAL_MINT_OR_ORDER_CHANGED');
  }else if(action.step==='transfer-share'){
    base(b);need(events.length===1&&transfers.length===1&&bemTransfers.length===0,'EXACT_SHARE_TRANSFER_ONLY_REQUIRED');const t=transfers[0].args;need(same(t.operator,session.creator)&&same(t.from,session.creator)&&same(t.to,session.buyerB)&&t.id===1n&&t.value===1n,'SHARE_ONE_TRANSFER_CHANGED');
  }else{
    need(action.step==='buyer-b-claim','UNSUPPORTED_AUDIT_STEP');const {d,h,q,r}=base(b);payment=d;need(syncs.length===1&&claims.length===1&&harvests.length===0&&transfers.length===0&&bemTransfers.length===1,'EXACT_SINGLE_ID_CLAIM_REQUIRED');const s=syncs[0].args,c=claims[0],t=bemTransfers[0];
    need(s.received===0n&&s.totalAccounted===h&&s.accPerShare===q&&s.remainder===r,'CLAIM_ACCOUNTING_POINT_CHANGED');need(c.args.id===1n&&same(c.args.holder,session.buyerB)&&c.args.amount===d&&syncs[0].logIndex<c.logIndex,'ID_ONE_DUE_CHANGED');need(same(t.args.from,action.pool)&&same(t.args.to,session.buyerB)&&t.args.value===d&&c.logIndex<t.logIndex,'B_PAYMENT_CHANGED');
  }
  return {baseline:b,paymentRaw:String(payment),events,bemTransfers};
}
export function checkSavedDenial(record,session,blockNumber){need(record?.status==='PASS'&&same(record.account,session.creator)&&record.id==='1'&&record.expectedError==='NotHolder'&&record.blockNumber===String(blockNumber)&&record.transactionsSent===0,'SAVED_NOT_HOLDER_EVIDENCE_CHANGED');return true;}
export function checkRawDenial(record,input,transfer,claim,baseline,captureScriptSha256){
  const {d,q}=base(baseline),{session,manifest,vaultAbi}=input;
  need(record?.status==='PASS'&&record.scope==='LIVE_READ_ONLY_FORMER_HOLDER_DENIAL'&&record.chainId===56&&record.sourceHash===TOOL_HASH&&record.scriptSha256===captureScriptSha256&&record.transactionsSent===0&&record.privateKeysUsed===false,'SAVED_RAW_DENIAL_SOURCE_CHANGED');
  need(same(record.vault,manifest.vault.address)&&same(record.account,session.creator)&&same(record.newHolder,session.buyerB)&&record.functionName==='claim'&&equal(record.args,['1'])&&record.callValueWei==='0'&&record.callGas==='3000000','SAVED_RAW_DENIAL_CALL_CHANGED');
  need(same(record.transferTransactionHash,transfer.transactionHash)&&same(record.transferEntryHash,digest(transfer))&&record.transferReceiptBlockNumber===String(transfer.receipt.blockNumber)&&HASH.test(record.blockHash)&&BigInt(record.blockNumber)>=BigInt(transfer.receipt.blockNumber)&&BigInt(record.blockNumber)<BigInt(claim.receipt.blockNumber),'SAVED_RAW_DENIAL_HISTORY_CHANGED');
  if(record.blockNumber===String(transfer.receipt.blockNumber))need(same(record.blockHash,transfer.receipt.blockHash),'SAVED_RAW_DENIAL_BLOCK_CHANGED');
  const state=record.state;need(same(state.holder,session.buyerB)&&state.creatorBalance==='0'&&state.buyerBBalance==='1'&&state.claimedRaw===String(Q0)&&state.claimableRaw===String(d)&&state.accPerShareRaw===String(q)&&same(state.vaultCodeHash,manifest.vault.codeHash),'SAVED_RAW_DENIAL_STATE_CHANGED');
  const expected=encodeErrorResult({abi:vaultAbi,errorName:'NotHolder'});need(record.rawRevertData===expected,'RAW_NOT_HOLDER_SELECTOR_CHANGED');const decoded=decodeErrorResult({abi:vaultAbi,data:record.rawRevertData});need(decoded.errorName==='NotHolder'&&equal(decoded.args??[],[])&&record.decodedErrorName==='NotHolder'&&equal(record.decodedArgs,[]),'RAW_NOT_HOLDER_DECODING_CHANGED');
  return {status:'PASS',scope:'INDEPENDENT_DECODE_OF_SAVED_REVERT_BYTES',blockNumber:record.blockNumber,blockHash:record.blockHash,rawRevertData:record.rawRevertData,decodedErrorName:decoded.errorName,transferEntryHash:record.transferEntryHash,freshRpcSimulation:'NOT_RUN',sourceScriptSha256:captureScriptSha256};
}
export function checkSnapshot(snapshot,{action,session,manifest},baseline=null,{after=false}={}){
  need(snapshot.state==='2'&&snapshot.soldCount==='100'&&snapshot.fundedWei==='0'&&snapshot.totalPrincipalIn==='303000000000000000'&&snapshot.totalPrincipalRefunded==='0'&&snapshot.purchaseSpent==='303000000000000000'&&snapshot.soldBitmap===String((1n<<100n)-1n)&&snapshot.vaultNativeWei==='0','ACTIVE_100_STATE_CHANGED');
  const runtime='0x363d3d373d3d3d363d73'+manifest.template.address.slice(2).toLowerCase()+'5af43d82803e903d91602b57fd5bf3';need(same(snapshot.poolCode,runtime)&&same(keccak256(snapshot.poolCode),manifest.vault.codeHash)&&snapshot.isPool===true&&same(snapshot.nftOwner,action.pool)&&snapshot.actorCode==='0x'&&snapshot.recipientCode==='0x'&&snapshot.decimals===8,'CLONE_MINER_OR_PARTICIPANT_CHANGED');
  const initial=action.step==='new-harvest'&&!after,{h,q,r,d}=initial?{h:H0,q:Q0,r:R0,d:0n}:base(baseline),transferred=action.step==='buyer-b-claim'||(action.step==='transfer-share'&&after),paid=action.step==='buyer-b-claim'&&after,totalPaid=P0+(paid?d:0n);
  need(snapshot.totalAccounted===String(h)&&snapshot.totalPaid===String(totalPaid)&&snapshot.accPerShare===String(q)&&snapshot.remainder===String(r)&&snapshot.vaultBemRaw===String(h-totalPaid)&&snapshot.bemBalances.vault===snapshot.vaultBemRaw,'SNAPSHOT_ACCOUNTING_CHANGED');
  need(snapshot.shares?.length===100&&snapshot.creatorBalances?.length===100&&snapshot.buyerBalances?.length===100,'ALL_100_ROWS_REQUIRED');
  for(let i=0;i<100;i++){const row=snapshot.shares[i],ownedByCreator=i<67&&!(i===0&&transferred),hasClaimed=i===0&&paid;need(row.id===String(i+1)&&same(row.holder,ownedByCreator?session.creator:session.buyerB)&&row.supply==='1'&&row.claimed===String(hasClaimed?q:Q0)&&row.claimable===String(hasClaimed?0n:d)&&snapshot.creatorBalances[i]===String(ownedByCreator?1:0)&&snapshot.buyerBalances[i]===String(ownedByCreator?0:1),'SHARE_ENTITLEMENT_OR_OWNER_CHANGED');}
  if(transferred)checkSavedDenial(snapshot.formerHolderDenied,session,snapshot.blockNumber);return true;
}
export function reconcileMath(baseline,paidRaw,finalVaultRaw){const {x,d,q,r}=base(baseline),paid=BigInt(paidRaw),vault=BigInt(finalVaultRaw);need(paid===d&&vault===99n*d+r&&paid+vault===x+R0,'ENTITLEMENT_CONSERVATION_FAILED');return {newMiningInflow:amount(x),priorRemainder:amount(R0),perIdIncrement:amount(d),newAccPerShare:amount(q),buyerBIdOnePayment:amount(paid),other99Claimable:amount(99n*d),newRemainder:amount(r),finalVault:amount(vault),conservedRaw:String(paid+vault)};}

export function checkPlan(saved,input,action,entry,baseline,prerequisite){
  const p=saved.value;need(same(saved.hash,entry.planHash)&&p.status==='FROZEN_UNSIGNED_ENTITLEMENT_PLAN'&&p.chainId===56&&same(p.sessionHash,SESSION_HASH)&&p.entitlementToolHash===TOOL_HASH&&p.rewardsToolHash===REWARDS_HASH&&p.completionToolHash===input.completionToolHash&&p.fundingToolHash===input.fundingToolHash&&p.poolToolHash===input.poolToolHash&&p.sellerRuntimeToolHash===input.sellerToolHash&&equal(p.bindings,input.bindings),'PLAN_HASH_OR_SOURCES_CHANGED');
  for(const field of ['step','nonce','functionName','valueWei','data','dataHash','from','to','pool','template','configHash','termsHash','payloadHash'])need(String(p[field])===String(action[field]),'PLAN_ACTION_CHANGED');need(equal(p.ids,action.ids)&&same(keccak256(p.data),action.dataHash)&&p.gas===entry.gas&&p.gasPrice===entry.gasPrice&&p.maxFeeWei===entry.maxFeeWei&&p.maximumSpendWei===entry.maxFeeWei,'PLAN_GAS_OR_IDS_CHANGED');
  need(equal(p.baseline,baseline)&&equal(p.prerequisite,prerequisite),'PLAN_HISTORY_PREFIX_CHANGED');return true;
}
export function checkBudget(ledger,journal,input){
  validateBudget(ledger);need(journal?.schemaVersion===1&&journal.chainId===56&&same(journal.sessionHash,SESSION_HASH)&&journal.steps.length===3,'JOURNAL_SESSION_CHANGED');const prefix=`entitlement-${SESSION_HASH.slice(2)}-`,old=ledger.reservations.filter(r=>!r.reservationId?.startsWith(prefix)),added=ledger.reservations.filter(r=>r.reservationId?.startsWith(prefix));
  need(old.length===12&&same(digest(old),OLD_BUDGET_HASH)&&old.reduce((s,r)=>s+BigInt(r.valueWei)+BigInt(r.maxFeeWei),0n)===OLD_RESERVED,'OLD_TWELVE_RESERVATIONS_CHANGED');need(added.length===3&&ledger.reservations.length===15&&BigInt(ledger.spentAndReservedWei)<=LIMIT,'FINAL_RESERVATION_COUNT_OR_CAP_CHANGED');let sum=0n;
  journal.steps.forEach((e,i)=>{const a=actionFor(input,STEPS[i]),id=prefix+a.step,matches=added.filter(r=>r.reservationId===id);need(e.status==='CONFIRMED'&&e.positiveTest?.status==='PASS'&&e.step===a.step&&e.nonce===a.nonce&&same(e.to,a.to)&&same(e.pool,a.pool)&&e.valueWei==='0'&&same(e.dataHash,a.dataHash)&&HASH.test(e.planHash)&&HASH.test(e.transactionHash)&&e.reservationId===id&&e.entitlementToolHash===TOOL_HASH&&e.rewardsToolHash===REWARDS_HASH&&e.completionToolHash===input.completionToolHash&&e.fundingToolHash===input.fundingToolHash&&e.poolToolHash===input.poolToolHash&&e.sellerRuntimeToolHash===input.sellerToolHash,'ENTRY_BINDING_CHANGED');need(BigInt(e.gas)>0n&&BigInt(e.gasPrice)>0n&&BigInt(e.gas)*BigInt(e.gasPrice)===BigInt(e.maxFeeWei)&&matches.length===1,'ENTRY_FEE_OR_RESERVATION_CHANGED');const r=matches[0];need(r.operation===a.step&&same(r.sender,a.from)&&r.nonce===String(a.nonce)&&r.valueWei==='0'&&r.maxFeeWei===e.maxFeeWei&&same(r.bundleHash,SESSION_HASH)&&same(r.initCodeHash,a.dataHash),'RESERVATION_FIELDS_CHANGED');sum+=BigInt(e.maxFeeWei);});
  need(BigInt(ledger.spentAndReservedWei)===OLD_RESERVED+sum,'BUDGET_TOTAL_CHANGED');return {historicalReserved:money(OLD_RESERVED),newReservedFees:money(sum),totalReserved:money(ledger.spentAndReservedWei),limit:money(LIMIT),historicalReservationsHash:OLD_BUDGET_HASH,reservations:ledger.reservations};
}
function receiptFee(entry,action){const r=entry.receipt;need(r?.status==='success'&&same(r.transactionHash,entry.transactionHash)&&same(r.from,action.from)&&same(r.to,action.to)&&r.contractAddress===null&&HASH.test(r.blockHash),'RECEIPT_IDENTITY_CHANGED');const fee=BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice);need(BigInt(r.gasUsed)>0n&&BigInt(r.gasUsed)<=BigInt(entry.gas)&&String(r.effectiveGasPrice)===entry.gasPrice&&fee===BigInt(entry.actualGasFeeWei)&&fee<=BigInt(entry.maxFeeWei),'ACTUAL_FEE_CHANGED');return fee;}
function oldRewardContext(saved,completion){
  need(same(saved.hash,OLD_JOURNAL_HASH)&&saved.value.steps?.length===3,'OLD_REWARD_JOURNAL_CHANGED');const c=completion.value.steps?.[0];need(c?.status==='CONFIRMED'&&same(c.transactionHash,'0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6'),'OLD_COMPLETION_CHANGED');const completionRecord={transactionHash:c.transactionHash,blockNumber:String(c.receipt.blockNumber),blockHash:c.receipt.blockHash,planHash:c.planHash,entryHash:digest(c),scope:'CANONICAL_COMPLETION_RECEIPT_AND_EVENTS_NO_HISTORICAL_STORAGE'};
  const rewardPrerequisites=saved.value.steps.map((e,i)=>{need(e.status==='CONFIRMED'&&e.positiveTest?.status==='PASS'&&e.step===['harvest','creator-claim','buyer-b-claim'][i]&&e.rewardsToolHash===REWARDS_HASH&&equal(e.baseline,{receivedRaw:String(H0),perShareRaw:String(Q0),remainderRaw:String(R0),decimals:8})&&e.paymentRaw===String(i===0?0n:i===1?67n*Q0:33n*Q0),'OLD_REWARD_ENTRY_CHANGED');return {step:e.step,transactionHash:e.transactionHash,planHash:e.planHash,entryHash:digest(e),blockNumber:String(e.receipt.blockNumber),blockHash:e.receipt.blockHash,baseline:e.baseline,paymentRaw:e.paymentRaw,scope:'CANONICAL_REWARD_RECEIPT_AND_EVENTS_NO_HISTORICAL_STORAGE'};});
  return {journalHash:saved.hash,rewardsToolHash:REWARDS_HASH,completion:completionRecord,rewardPrerequisites,initialAccountedRaw:String(H0),initialPaidRaw:String(P0),initialAccPerShareRaw:String(Q0),initialRemainderRaw:String(R0),scope:'CANONICAL_OLD_REWARD_RECEIPTS_AND_EVENTS_NO_HISTORICAL_STORAGE'};
}
export function reconcileEvidence({input,journal,plans,ledger,oldRewardJournal,completionJournal,bemAbi,historicalGasValidation,rawDenial,captureScriptSha256}){
  need(input.sessionHash===SESSION_HASH&&input.toolHash===TOOL_HASH&&input.rewardsToolHash===REWARDS_HASH,'FIXED_SOURCE_OR_SESSION_CHANGED');const ready=readiness(journal);if(!ready.ready)return {status:'NOT_READY',...ready,...SCOPE};need(plans.length===3,'THREE_RAW_PLANS_REQUIRED');const budget=checkBudget(ledger,journal,input),oldRewards=oldRewardContext(oldRewardJournal,completionJournal);
  need(historicalGasValidation.fourDeploymentsAndEightTestTransactionsActualFeeWei===String(HISTORICAL_ACTUAL_GAS),'HISTORICAL_GAS_REPORT_CHANGED');
  let baseline=null,previousBlock=BigInt(oldRewards.rewardPrerequisites[2].blockNumber),fees=0n;const entitlementPrerequisites=[],transactions=[];
  for(let i=0;i<3;i++){
    const e=journal.steps[i],p=plans[i],action=actionFor(input,STEPS[i]),context={...input,action,bemAbi};checkPlan(p,input,action,e,baseline,{oldRewards,baseline,entitlementPrerequisites});checkSnapshot(p.value.before,context,baseline);
    const fee=receiptFee(e,action),r=e.receipt;need(BigInt(r.blockNumber)>previousBlock,'RECEIPT_SEQUENCE_CHANGED');if(i===0)need(same(e.transactionHash,NEW_HARVEST_TX),'FIXED_NEW_HARVEST_HASH_CHANGED');const decoded=decodeStep(r,context,baseline);
    need(equal(e.baseline,decoded.baseline)&&e.paymentRaw===decoded.paymentRaw&&e.paymentBEM===formatUnits(BigInt(decoded.paymentRaw),8)&&e.decimals===8,'SAVED_ENTITLEMENT_SUMMARY_CHANGED');checkSnapshot(e.after,context,decoded.baseline,{after:true});need(String(e.after.blockNumber)===String(r.blockNumber)&&same(e.after.blockHash,r.blockHash),'RECEIPT_STATE_BLOCK_CHANGED');
    if(i===0)baseline=decoded.baseline;entitlementPrerequisites.push({step:e.step,transactionHash:e.transactionHash,planHash:e.planHash,entryHash:digest(e),blockNumber:String(r.blockNumber),blockHash:r.blockHash,baseline:decoded.baseline,paymentRaw:decoded.paymentRaw,scope:'CANONICAL_ENTITLEMENT_RECEIPT_AND_EVENTS_NO_HISTORICAL_STORAGE'});previousBlock=BigInt(r.blockNumber);fees+=fee;
    transactions.push({step:e.step,transactionHash:e.transactionHash,blockNumber:r.blockNumber,blockHash:r.blockHash,entryHash:digest(e),planHash:e.planHash,nonce:e.nonce,valueWei:e.valueWei,dataHash:e.dataHash,gasLimit:e.gas,gasUsed:r.gasUsed,gasPriceWei:e.gasPrice,maxFee:money(e.maxFeeWei),actualFee:money(fee),payment:amount(decoded.paymentRaw),events:decoded.events,bemTransfers:decoded.bemTransfers,savedFormerHolderDenied:e.after.formerHolderDenied??null});
  }
  const last=journal.steps[2].after,denial=checkRawDenial(rawDenial,input,journal.steps[1],journal.steps[2],baseline,captureScriptSha256);return {schemaVersion:1,status:'PASS',...SCOPE,sessionHash:SESSION_HASH,entitlementToolHash:TOOL_HASH,rewardsToolHash:REWARDS_HASH,sourceBindings:input.bindings,baseline,distribution:reconcileMath(baseline,journal.steps[2].paymentRaw,last.vaultBemRaw),transactions,budget,savedRawNotHolderProof:denial,gas:{newThreeTransactionsActualFee:money(fees),historicalFourDeploymentsAndEightTestsActualFee:money(HISTORICAL_ACTUAL_GAS),allFourDeploymentsAndElevenTestsActualFee:money(HISTORICAL_ACTUAL_GAS+fees),historicalBaselineSource:'mainnet-entitlement-transfer/audit/historical-gas-report-baseline.json fourDeploymentsAndEightTestTransactionsActualFeeWei; immutable raw-hash-bound snapshot of historical mainnet-test/validation.json. Only that historical gas field is used; other snapshot metadata is historical, not current or final. No fresh full-history RPC or receipt re-decoding.'},finalSavedState:{blockNumber:last.blockNumber,blockHash:last.blockHash,creatorShares:66,buyerBShares:34,all100Shares:last.shares,vaultBem:amount(last.vaultBemRaw)},checks:{independentCompiledAbiRawEvents:true,exactThreePlansAndHistoricalPrefix:true,all100EntitlementsAtEveryStep:true,transferRetainsAccruedIdOneRights:true,savedCreatorNotHolderEvidenceMatches:true,independentSavedRawNotHolderDecoding:true,buyerOnlyClaimsTransferredIdOne:true,other99RemainClaimable:true,conservation:true,allTwelveHistoricalReservationsPreserved:true,cumulativeBudgetWithinLimit:true},limitations:['Saved canonical confirmation status and NotHolder evidence were not re-queried.','Signed raw transactions are deliberately absent. Nonce/value/calldata are reconciled against saved approved plans and journals.','Mining pending and unrelated wallet balance changes are not payment evidence.']};
}

export async function main(argv=process.argv.slice(2)){
  if(argv.length){if(argv.length===1&&argv[0]==='--help'){console.log('Offline: node --import tsx mainnet-entitlement-transfer/audit/final-reconcile.mjs. No arguments/env/RPC/signing. Exit0 PASS,2 NOT_READY,1 FAIL. Existing final PASS is preserved; later attempts go to latest-attempt.json.');return 0;}throw new Error('NO_ARGUMENTS_SUPPORTED');}
  const evidence=[];const read=async(file,expected)=>{const record=await readConfinedJson(file),hash=keccak256(record.raw);need(!expected||same(hash,expected),'RAW_FILE_HASH_CHANGED');evidence.push({file,hash});return {...record,hash};};let report;
  try{
    const input=await loadInput({sessionFile:'mainnet-test/session.json',step:'new-harvest',publicRpcFallback:true});need(input.sessionHash===SESSION_HASH&&input.toolHash===TOOL_HASH,'FROZEN_RUNTIME_OR_SESSION_CHANGED');
    const saved=await read(`mainnet-entitlement-transfer/transactions/${SESSION_HASH.slice(2)}.json`),ready=readiness(saved.value);
    if(!ready.ready)report={schemaVersion:1,status:'NOT_READY',...SCOPE,...ready,reason:'THREE_CONFIRMED_POSITIVE_STEPS_REQUIRED'};
    else{
      const plans=[];for(const e of saved.value.steps)plans.push(await read(`mainnet-entitlement-transfer/plans/${e.step}-${e.planHash.slice(2)}.json`,e.planHash));
      const oldRewardJournal=await read(`mainnet-rewards/transactions/${SESSION_HASH.slice(2)}.json`,OLD_JOURNAL_HASH),completionJournal=await read(`mainnet-completion/transactions/${SESSION_HASH.slice(2)}.json`),ledger=await read('deployments/live-budget.json'),bem=await read('out/IERC20.sol/IERC20.json',BEM_ARTIFACT_HASH),gas=await read(PREFIX+'historical-gas-report-baseline.json',HISTORICAL_GAS_REPORT_HASH),rawDenial=await read(PREFIX+'former-holder-denial-live.json');
      const capturePath=fileURLToPath(new URL('./capture-former-holder-denial.mjs',import.meta.url)),captureStat=await fs.lstat(capturePath);need(captureStat.isFile()&&!captureStat.isSymbolicLink()&&await fs.realpath(capturePath)===capturePath,'CAPTURE_SOURCE_SYMLINK_REFUSED');const captureBytes=await fs.readFile(capturePath),captureScriptSha256=createHash('sha256').update(captureBytes).digest('hex');
      report=reconcileEvidence({input,journal:saved.value,plans,ledger:ledger.value,oldRewardJournal,completionJournal,bemAbi:bem.value.abi,historicalGasValidation:gas.value,rawDenial:rawDenial.value,captureScriptSha256});
      need(createHash('sha256').update(await fs.readFile(capturePath)).digest('hex')===captureScriptSha256,'CAPTURE_SOURCE_CHANGED_DURING_AUDIT');report.captureScript={file:PREFIX+'capture-former-holder-denial.mjs',sha256:captureScriptSha256};
      const fresh=await loadInput({sessionFile:'mainnet-test/session.json',step:'new-harvest',publicRpcFallback:true});need(fresh.sessionHash===SESSION_HASH&&fresh.toolHash===TOOL_HASH&&equal(fresh.bindings,input.bindings),'SOURCE_CHANGED_DURING_AUDIT');
    }
    for(const file of evidence)need(same(keccak256((await readConfinedJson(file.file)).raw),file.hash),'EVIDENCE_CHANGED_DURING_AUDIT');
  }catch(error){report={schemaVersion:1,status:'FAIL',...SCOPE,reason:typeof error.message==='string'&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'OFFLINE_EVIDENCE_INVALID'};}
  report.auditedAt=new Date().toISOString();report.evidenceFiles=evidence;report.auditScriptSha256=createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex');let existingStatus;try{existingStatus=(await readConfinedJson(PREFIX+'final-reconciliation.json')).value.status;}catch(error){if(error.code!=='ENOENT')throw error;}
  const output=outputPathFor(existingStatus);report.existingFinalPassPreserved=existingStatus==='PASS';await writeAtomic(output,report);console.log(json({status:report.status,reason:report.reason??null,output,existingFinalPassPreserved:report.existingFinalPassPreserved,...SCOPE,distribution:report.distribution,gas:report.gas}));return report.status==='PASS'?0:report.status==='NOT_READY'?2:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(()=>{console.error(json({status:'FAIL',reason:'AUDIT_ARGUMENT_OR_OUTPUT_ERROR',...SCOPE}));process.exitCode=1;});
