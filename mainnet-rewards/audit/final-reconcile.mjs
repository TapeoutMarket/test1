#!/usr/bin/env node
// Offline audit only: never constructs a client, reads env, signs, or sends.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {decodeEventLog,keccak256,formatUnits,formatEther,zeroAddress} from 'viem';
import {json} from '../../live-test/preflight.mjs';
import {readConfinedJson,writeAtomic,validateBudget} from '../../live-test/deployment-io.mjs';
import {loadInput,buildAction,assertRewardState,assertRewardLedger} from '../rewards.mjs';
import {assertCompletionLedger,checkCompletionEvents} from '../../mainnet-completion/buyer-b-complete.mjs';

export const SESSION_HASH='0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
export const REWARDS_HASH='501b3ba397abf2d824216a7e246fb90a79d5f81b79046e9cd8b89ed77a5e1649';
const COMPLETION_TX='0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6';
const HISTORICAL_HASH='0x0c7cd2063dcc74fae52dc95c85a9059837b908ccf93eb93f0b2a61685b1a2bf2';
const HISTORICAL_WEI=304097985200000000n,MAX_TOTAL_WEI=304500000000000000n;
const BEM_ARTIFACT_HASH='0x717f67039ec7941211cdc07c2c8739e94b8cd03515641edf2ec141923d6681a6';
const STEPS=['harvest','creator-claim','buyer-b-claim'];
const OUTPUT='mainnet-rewards/audit/final-reconciliation.json';
const JOURNAL=`mainnet-rewards/transactions/${SESSION_HASH.slice(2)}.json`;
const COMPLETION_JOURNAL=`mainnet-completion/transactions/${SESSION_HASH.slice(2)}.json`;
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const equal=(a,b)=>json(a)===json(b);
const digest=value=>keccak256(Buffer.from(json(value)));
const amount=raw=>({raw:String(raw),bem:formatUnits(BigInt(raw),8),decimals:8});
const money=wei=>({wei:String(wei),bnb:formatEther(BigInt(wei))});
const SCOPE={scope:'OFFLINE_SAVED_EVIDENCE_ONLY',rpcRequests:0,transactionsSent:0,privateKeysUsed:false,currentChainConfirmation:'NOT_RUN',confirmationEvidence:'Saved CONFIRMED journal from the frozen sender, which required at least 15 canonical confirmations. This command does not query a current chain head, verify a fresh transaction inclusion proof, or prove current wallet balances.'};

export function readiness(journal){
  const states=STEPS.map((step,i)=>({step,status:journal?.steps?.[i]?.step===step?journal.steps[i].status:'MISSING',positiveTest:journal?.steps?.[i]?.positiveTest?.status??'NOT_RUN'}));
  return {ready:journal?.steps?.length===3&&states.every(e=>e.status==='CONFIRMED'&&e.positiveTest==='PASS'),steps:states};
}

// Decode raw receipt bytes with the compiled artifacts, not saved decoded events.
export function decodeRewardReceipt(receipt,{action,manifest,session,vaultAbi,bemAbi},baseline=null){
  need(receipt?.status==='success'&&Array.isArray(receipt.logs),'SUCCESSFUL_SAVED_RECEIPT_REQUIRED');
  const decoded=[],transfers=[];
  for(let i=0;i<receipt.logs.length;i++){
    const log=receipt.logs[i];
    need(log.removed!==true&&same(log.transactionHash,receipt.transactionHash)&&same(log.blockHash,receipt.blockHash)&&String(log.blockNumber)===String(receipt.blockNumber)&&log.transactionIndex===receipt.transactionIndex&&Number.isSafeInteger(log.logIndex)&&log.logIndex>=0&&(i===0||log.logIndex>receipt.logs[i-1].logIndex),'MIXED_OR_UNORDERED_RECEIPT_LOGS');
    need(!same(log.address,session.collection),'UNEXPECTED_MINER_EVENT');
    if(same(log.address,action.pool)){
      const event=decodeEventLog({abi:vaultAbi,data:log.data,topics:log.topics,strict:true});
      need(['RewardsSynced','Harvested','RewardClaimed'].includes(event.eventName),'UNEXPECTED_VAULT_EVENT');decoded.push({...event,logIndex:log.logIndex});
    }else if(same(log.address,manifest.config.bem)){
      const event=decodeEventLog({abi:bemAbi,data:log.data,topics:log.topics,strict:true});need(event.eventName==='Transfer','UNEXPECTED_BEM_EVENT');transfers.push({...event,logIndex:log.logIndex});
    }
  }
  const syncs=decoded.filter(e=>e.eventName==='RewardsSynced'),harvests=decoded.filter(e=>e.eventName==='Harvested'),claims=decoded.filter(e=>e.eventName==='RewardClaimed');
  let h,q,r,payment=0n;
  if(action.step==='harvest'){
    need(baseline===null&&syncs.length===2&&harvests.length===1&&claims.length===0&&transfers.length===1,'EXACT_POSITIVE_HARVEST_EVENTS_REQUIRED');
    h=harvests[0].args.received;q=h/100n;r=h%100n;
    need(h>0n&&q>0n,'POSITIVE_SHARE_CHECKPOINT_REQUIRED');
    need(Object.values(syncs[0].args).every(v=>v===0n)&&same(harvests[0].args.caller,action.from),'INITIAL_SYNC_OR_HARVESTER_CHANGED');
    const mint=transfers[0];need(same(mint.args.from,zeroAddress)&&same(mint.args.to,action.pool)&&mint.args.value===h,'HARVEST_MINT_MISMATCH');
    need(syncs[0].logIndex<mint.logIndex&&mint.logIndex<syncs[1].logIndex&&syncs[1].logIndex<harvests[0].logIndex,'HARVEST_EVENT_ORDER_CHANGED');
  }else{
    need(baseline?.decimals===8,'FROZEN_HARVEST_BASELINE_REQUIRED');h=BigInt(baseline.receivedRaw);q=BigInt(baseline.perShareRaw);r=BigInt(baseline.remainderRaw);
    need(h>0n&&q>0n&&q===h/100n&&r===h%100n,'INVALID_HARVEST_CHECKPOINT');
    need(syncs.length===1&&harvests.length===0&&claims.length===action.ids.length&&transfers.length===1,'EXACT_CLAIM_EVENTS_REQUIRED');
    need(claims.every((event,i)=>same(event.args.holder,action.from)&&event.args.id===BigInt(action.ids[i])&&event.args.amount===q&&event.logIndex>syncs[0].logIndex),'CLAIM_IDS_HOLDER_OR_DUE_CHANGED');
    payment=BigInt(action.ids.length)*q;const transfer=transfers[0];need(same(transfer.args.from,action.pool)&&same(transfer.args.to,action.from)&&transfer.args.value===payment&&claims.every(e=>e.logIndex<transfer.logIndex),'CLAIM_PAYMENT_CHANGED');
  }
  const last=syncs.at(-1).args;need(last.received===(action.step==='harvest'?h:0n)&&last.totalAccounted===h&&last.accPerShare===q&&last.remainder===r,'REWARD_ACCOUNTING_POINT_CHANGED');
  return {baseline:{receivedRaw:String(h),perShareRaw:String(q),remainderRaw:String(r),decimals:8},paymentRaw:String(payment),claimCount:claims.length,decoded,transfers};
}

export function reconcileMath(baseline,creatorRaw,buyerRaw,finalVaultRaw){
  const h=BigInt(baseline.receivedRaw),q=BigInt(baseline.perShareRaw),r=BigInt(baseline.remainderRaw),creator=BigInt(creatorRaw),buyer=BigInt(buyerRaw),vault=BigInt(finalVaultRaw);
  need(baseline.decimals===8&&q>0n&&q===h/100n&&r===h%100n,'INVALID_FINAL_CHECKPOINT');
  need(creator===67n*q&&buyer===33n*q&&creator*33n===buyer*67n,'CLAIM_ALLOCATION_NOT_PROPORTIONAL');
  need(vault===r&&creator+buyer+vault===h,'HARVEST_DISTRIBUTION_NOT_CONSERVED');
  return {harvested:amount(h),perShare:amount(q),creator:amount(creator),buyerB:amount(buyer),vaultRemainder:amount(r),creatorTimes33:String(creator*33n),buyerTimes67:String(buyer*67n),sumPaymentsPlusRemainder:String(creator+buyer+vault)};
}

function sourceBindings(plan,input){
  need(same(plan.sessionHash,SESSION_HASH)&&plan.rewardsToolHash===REWARDS_HASH&&plan.completionToolHash===input.completionToolHash&&plan.fundingToolHash===input.fundingToolHash&&plan.poolToolHash===input.poolToolHash&&plan.sellerRuntimeToolHash===input.sellerToolHash&&equal(plan.bindings,input.bindings),'FROZEN_PLAN_SOURCES_CHANGED');
}
function rewardRecord(entry,decoded){return {step:entry.step,transactionHash:entry.transactionHash,planHash:entry.planHash,entryHash:digest(entry),blockNumber:String(entry.receipt.blockNumber),blockHash:entry.receipt.blockHash,baseline:decoded.baseline,paymentRaw:decoded.paymentRaw,scope:'CANONICAL_REWARD_RECEIPT_AND_EVENTS_NO_HISTORICAL_STORAGE'};}

export function reconcileEvidence({input,journal,plans,ledger,completionJournal,completionPlan,bemAbi}){
  need(same(input.sessionHash,SESSION_HASH)&&input.toolHash===REWARDS_HASH,'FIXED_SESSION_OR_RUNTIME_CHANGED');
  const ready=readiness(journal);if(!ready.ready)return {schemaVersion:1,status:'NOT_READY',...SCOPE,...ready,reason:'ALL_THREE_CONFIRMED_POSITIVE_STEPS_REQUIRED'};
  need(plans.length===3,'THREE_FROZEN_PLANS_REQUIRED');validateBudget(ledger);assertRewardLedger(journal,ledger,input);assertCompletionLedger(completionJournal,ledger,input.completionInput);
  const historical=ledger.reservations.filter(r=>!r.reservationId?.startsWith('rewards-'));
  need(historical.length===9&&same(digest(historical),HISTORICAL_HASH),'HISTORICAL_RESERVATIONS_CHANGED');
  need(historical.reduce((sum,r)=>sum+BigInt(r.valueWei)+BigInt(r.maxFeeWei),0n)===HISTORICAL_WEI,'HISTORICAL_BUDGET_CHANGED');
  need(ledger.reservations.length===12&&BigInt(ledger.spentAndReservedWei)<=MAX_TOTAL_WEI,'FINAL_BUDGET_LIMIT_OR_RESERVATION_COUNT_CHANGED');
  const completion=completionJournal.steps[0];need(completion.status==='CONFIRMED'&&same(completion.transactionHash,COMPLETION_TX)&&same(completionPlan.hash,completion.planHash),'CONFIRMED_COMPLETION_BINDING_REQUIRED');
  const cp=completionPlan.value,ca=input.completionInput.action;
  need(cp.status==='FROZEN_UNSIGNED_BUYER_B_COMPLETION_PLAN'&&same(cp.sessionHash,SESSION_HASH)&&equal(cp.bindings,input.bindings)&&cp.completionToolHash===input.completionToolHash&&cp.fundingToolHash===input.fundingToolHash&&cp.poolToolHash===input.poolToolHash&&cp.sellerRuntimeToolHash===input.sellerToolHash&&cp.data===ca.data&&same(cp.dataHash,ca.dataHash)&&cp.nonce===ca.nonce&&cp.valueWei===ca.valueWei&&cp.gas===completion.gas&&cp.gasPrice===completion.gasPrice&&cp.maxFeeWei===completion.maxFeeWei,'COMPLETION_PLAN_CHANGED');
  need(completion.receipt?.status==='success'&&same(completion.receipt.transactionHash,COMPLETION_TX)&&same(completion.receipt.from,ca.from)&&same(completion.receipt.to,ca.to),'COMPLETION_RECEIPT_CHANGED');checkCompletionEvents(completion.receipt,input.completionInput);
  const completionRecord={transactionHash:COMPLETION_TX,blockNumber:String(completion.receipt.blockNumber),blockHash:completion.receipt.blockHash,planHash:completion.planHash,entryHash:digest(completion),scope:'CANONICAL_COMPLETION_RECEIPT_AND_EVENTS_NO_HISTORICAL_STORAGE'};
  let baseline=null,previousBlock=BigInt(completion.receipt.blockNumber),actualFees=0n,reservedFees=0n;const prior=[],transactions=[];
  for(let i=0;i<3;i++){
    const entry=journal.steps[i],saved=plans[i],plan=saved.value,action=buildAction(input.session,input.manifest,input.vaultAbi,STEPS[i]),local={...input,action};sourceBindings(plan,input);
    need(same(saved.hash,entry.planHash)&&plan.status==='FROZEN_UNSIGNED_REWARD_PLAN'&&plan.chainId===56&&plan.step===action.step&&same(plan.from,action.from)&&same(plan.to,action.to)&&same(plan.pool,action.pool)&&plan.valueWei==='0'&&plan.nonce===action.nonce&&plan.functionName===action.functionName&&equal(plan.ids,action.ids)&&plan.data===action.data&&same(plan.dataHash,keccak256(plan.data))&&same(plan.dataHash,action.dataHash)&&plan.gas===entry.gas&&plan.gasPrice===entry.gasPrice&&plan.maxFeeWei===entry.maxFeeWei&&plan.maximumSpendWei===plan.maxFeeWei,'REWARD_PLAN_OR_TRANSACTION_FIELDS_CHANGED');
    need(equal(plan.baseline,baseline)&&equal(plan.prerequisite,{completion:completionRecord,baseline,rewardPrerequisites:prior}),'HISTORICAL_ENTRY_HASH_PREFIX_CHANGED');
    assertRewardState(plan.before,local,baseline);
    const receipt=entry.receipt;need(receipt?.status==='success'&&same(receipt.transactionHash,entry.transactionHash)&&same(receipt.from,action.from)&&same(receipt.to,action.to)&&receipt.contractAddress===null&&BigInt(receipt.blockNumber)>previousBlock,'REWARD_RECEIPT_OR_SEQUENCE_CHANGED');
    const fee=BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice);need(BigInt(receipt.gasUsed)>0n&&BigInt(receipt.gasUsed)<=BigInt(entry.gas)&&String(receipt.effectiveGasPrice)===entry.gasPrice&&fee===BigInt(entry.actualGasFeeWei)&&fee<=BigInt(entry.maxFeeWei),'ACTUAL_GAS_EVIDENCE_CHANGED');
    const decoded=decodeRewardReceipt(receipt,{...local,bemAbi},baseline);need(equal(entry.baseline,decoded.baseline)&&entry.paymentRaw===decoded.paymentRaw&&entry.paymentBEM===formatUnits(BigInt(decoded.paymentRaw),8)&&entry.decimals===8,'SAVED_REWARD_SUMMARY_CHANGED');
    assertRewardState(entry.after,local,decoded.baseline,{after:true});need(String(entry.after.blockNumber)===String(receipt.blockNumber)&&same(entry.after.blockHash,receipt.blockHash)&&entry.after.bemBalances.vault===entry.after.vaultBemRaw,'RECEIPT_BLOCK_SNAPSHOT_CHANGED');
    if(i===0)baseline=decoded.baseline;prior.push(rewardRecord(entry,decoded));previousBlock=BigInt(receipt.blockNumber);actualFees+=fee;reservedFees+=BigInt(entry.maxFeeWei);
    transactions.push({step:entry.step,transactionHash:entry.transactionHash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,planHash:entry.planHash,entryHash:digest(entry),nonce:entry.nonce,dataHash:entry.dataHash,gasLimit:entry.gas,gasUsed:receipt.gasUsed,gasPriceWei:entry.gasPrice,reservedMaximumFee:money(entry.maxFeeWei),actualFee:money(fee),payment:amount(decoded.paymentRaw),claimCount:decoded.claimCount,decodedEvents:decoded.decoded,bemTransfers:decoded.transfers});
  }
  need(BigInt(ledger.spentAndReservedWei)===HISTORICAL_WEI+reservedFees,'HISTORICAL_PLUS_REWARDS_BUDGET_MISMATCH');
  return {schemaVersion:1,status:'PASS',...SCOPE,sessionHash:SESSION_HASH,rewardsToolHash:REWARDS_HASH,sourceBindings:input.bindings,baseline,distribution:reconcileMath(baseline,journal.steps[1].paymentRaw,journal.steps[2].paymentRaw,journal.steps[2].after.vaultBemRaw),transactions,budget:{limit:money(MAX_TOTAL_WEI),historicalReserved:money(HISTORICAL_WEI),historicalReservationsHash:HISTORICAL_HASH,rewardsReservedMaximumFees:money(reservedFees),rewardsActualFees:money(actualFees),totalReserved:money(ledger.spentAndReservedWei),reservations:ledger.reservations},finalSavedState:{blockNumber:journal.steps[2].after.blockNumber,blockHash:journal.steps[2].after.blockHash,claimedPerIdRaw:baseline.perShareRaw,claimablePerIdRaw:'0',creatorShares:67,buyerBShares:33,vaultBem:amount(baseline.remainderRaw),all100Shares:journal.steps[2].after.shares},checks:{independentRawEventDecoding:true,threeFrozenPlansAndHistoricalPrefix:true,sameHarvestCheckpoint:true,all100FinalIdsAndOwners:true,proportional67To33:true,paymentsAndRemainderConserved:true,allHistoricalReservationsPreserved:true,withinCumulativeBudget:true},limitations:['Current canonical confirmations and current balances were not queried.','Transaction nonce, value and calldata are checked against saved frozen plans/journals; raw signed transactions are intentionally not stored.','Mining pending and unrelated wallet balance changes are not treated as actual harvest or payment evidence.']};
}

export async function main(argv=process.argv.slice(2)){
  if(argv.length){if(argv.length===1&&argv[0]==='--help'){console.log('Offline only: node --import tsx mainnet-rewards/audit/final-reconcile.mjs\nWrites mainnet-rewards/audit/final-reconciliation.json. No parameters, env, RPC, signing, or broadcast. Exit 0=PASS, 2=NOT_READY, 1=FAIL.');return 0;}throw new Error('NO_ARGUMENTS_SUPPORTED');}
  const evidence=[];
  const read=async(file,expected)=>{const result=await readConfinedJson(file),hash=keccak256(result.raw);need(!expected||same(hash,expected),'RAW_EVIDENCE_HASH_CHANGED');evidence.push({file,hash});return {...result,hash};};
  let result;
  try{
    const input=await loadInput({sessionFile:'mainnet-test/session.json',step:'harvest',publicRpcFallback:true});need(input.sessionHash===SESSION_HASH&&input.toolHash===REWARDS_HASH,'FIXED_SESSION_OR_RUNTIME_CHANGED');
    const journal=await read(JOURNAL);const ready=readiness(journal.value);
    if(!ready.ready)result={schemaVersion:1,status:'NOT_READY',...SCOPE,...ready,sessionHash:SESSION_HASH,rewardsToolHash:REWARDS_HASH,reason:'ALL_THREE_CONFIRMED_POSITIVE_STEPS_REQUIRED'};
    else{
      const plans=[];for(const entry of journal.value.steps)plans.push(await read(`mainnet-rewards/plans/${entry.step}-${entry.planHash.slice(2)}.json`,entry.planHash));
      const completion=await read(COMPLETION_JOURNAL),ce=completion.value.steps[0],completionPlan=await read(`mainnet-completion/plans/buyer-b-complete-${ce.planHash.slice(2)}.json`,ce.planHash),ledger=await read('deployments/live-budget.json'),bem=await read('out/IERC20.sol/IERC20.json',BEM_ARTIFACT_HASH);
      result=reconcileEvidence({input,journal:journal.value,plans,ledger:ledger.value,completionJournal:completion.value,completionPlan,bemAbi:bem.value.abi});
      const fresh=await loadInput({sessionFile:'mainnet-test/session.json',step:'harvest',publicRpcFallback:true});need(fresh.toolHash===REWARDS_HASH&&fresh.sessionHash===SESSION_HASH&&equal(fresh.bindings,input.bindings),'SOURCES_CHANGED_DURING_AUDIT');
    }
    for(const item of evidence)need(same(keccak256((await readConfinedJson(item.file)).raw),item.hash),'EVIDENCE_CHANGED_DURING_AUDIT');
  }catch(error){result={schemaVersion:1,status:'FAIL',...SCOPE,reason:typeof error.message==='string'&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'OFFLINE_EVIDENCE_INVALID'};}
  result.auditedAt=new Date().toISOString();result.evidenceFiles=evidence;result.auditScriptSha256=createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex');await writeAtomic(OUTPUT,result);console.log(json({status:result.status,reason:result.reason??null,output:OUTPUT,...SCOPE,distribution:result.distribution,budget:result.budget?{totalReserved:result.budget.totalReserved,rewardsActualFees:result.budget.rewardsActualFees}:undefined}));return result.status==='PASS'?0:result.status==='NOT_READY'?2:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(()=>{console.error(json({status:'FAIL',reason:'OFFLINE_AUDIT_OUTPUT_OR_ARGUMENT_ERROR',...SCOPE}));process.exitCode=1;});
