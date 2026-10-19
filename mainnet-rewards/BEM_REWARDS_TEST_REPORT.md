# BEM 同批收益 67/33 主网测试报告

准备日期：2026-10-19；实链执行与最终更新：2026-10-20（北京时间）。**结果：PASS。harvest、creator领取67份、B领取33份均已主网确认，每笔至少15个区块确认；同一收益账点按67/33分配正确。**

## 最终结论

| 项目 | raw整数（1 BEM=10^8 raw） | BEM |
| --- | ---: | ---: |
| harvest实际收入Vault | 13,665,485 | 0.13665485 |
| creator持有67份，实际领取 | 9,155,818 | **0.09155818** |
| B持有33份，实际领取 | 4,509,582 | **0.04509582** |
| Vault留存余数 | 85 | **0.00000085** |

每份 q=136,654 raw，可分配总额=100q=13,665,400 raw。creator实收×33与B实收×67均为302,141,994；两人的实收加85raw余数精确等于本批harvest入账13,665,485raw。67/33针对相同的每份整数权益，85raw余数保留在Vault。

两笔领取均为claimBatch，各自只发一笔交易，没有再次harvest；两笔RewardsSynced.received都为0，totalAccounted/accPerShare/remainder均保持同一H/q/r。最终100个ID均claimed=136,654、claimable=0，份额仍为creator67/B33，矿机#3204仍在Vault、状态ACTIVE。

以上结论只覆盖第六笔harvest实际入账的这一批收益。Mining在交易间继续产生的待领收益未混入本轮；权益转移、归集赎回及失败退款仍未在本轮主网执行。

## 目标与固定顺序

Vault：`0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A`，BSC 主网 chainId=56，固定 ERC-1167 clone。

1. creator 调用 `harvest()`，将 Mining 实际支付的 BEM 入账。
2. creator 调用 `claimBatch([1…67])`，一次领取 67 份权益。
3. B 调用 `claimBatch([68…100])`，一次领取其余 33 份权益。

每笔 value=0，每笔签名前须分别取得用户确认。领取阶段不再 harvest。首次入账前所有收益计数字段和 100 个 ID 的 claimed/claimable 必须为 0。每笔均重新核验当前资产、身份、份额、nonce、余额及冻结报价，至少 15 个确认后核对完整回执事件与状态。

## 同批收益的判定

设 harvest 实际入账整数为 R（BEM decimals=8），每份收益 q=floor(R/100)，余数 r=R mod 100。初始所有 claimed=0 时：

- creator 应收到 67q raw。
- B 应收到 33q raw。
- 最后 Vault 应仅剩 r raw，范围为 0–99 raw。

harvest 结果必须为正数且 q>0，才能继续正数分配测试。Mining pending 只记录为观测，不作为实际 R 或上限。以真实 BEM Transfer、RewardsSynced、Harvested 及入账状态共同核对 R。

后两笔 claim 必须沿用 harvest 后的 totalAccounted、accPerShare 和 remainder；各自的 RewardsSynced.received 必须为 0。每个 ID 的 RewardClaimed 金额与 BEM Transfer 加总一致。若期间其他调用或直接 BEM 转入改变入账点，脚本停止本轮同批比较，不用变化后的金额冒充原收益批次。

## 执行前的独立只读检查

[原始检查记录](./observations/harvest-readonly-precheck-1792424751116.json)，区块 128580506，结果 PASS，无签名、无交易。

| 字段 | 观察结果 |
| --- | --- |
| 状态与资产 | ACTIVE，100 份存在，矿机 #3204 在 Vault |
| 权属 | creator 持有 ID1–67，B 持有 ID68–100 |
| creator latest/pending nonce | 11 / 11 |
| B latest/pending nonce | 5 / 5 |
| creator BNB 余额 | 0.00402984675 BNB |
| Vault BEM 与 totalAccounted/totalPaid/accPerShare/remainder | 全部为 0 |
| 全部 100 个 ID 的 claimed/claimable | 全部为 0 |
| Mining pending | 13,654,713 raw = 0.13654713 BEM，仅观测 |
| harvest 初步 gas 估算/20%余量 | 229,143 / 274,972 |
| gasPrice / 初步费用上限 | 0.05 gwei / 0.0000137486 BNB |

此处为独立准备检查，尚非最终冻结发送计划；签名前按最终计划及实时复核为准。既有共享预算最大预留 0.3040979852 BNB，已批准累计上限 0.3045 BNB，所有历史预留保留。

## 实际交易结果

| 步骤 | 状态 | 交易 | 实际 BEM | 实际 gas |
| --- | --- | --- | --- | --- |
| harvest | CONFIRMED（至少15确认） | `0xb3af0c8a9cc570826a4782fd3b09f9d306fdd5d7dd89c7b10c0985899f5a03ea` | 入账 0.13665485 BEM | 0.00001102315 BNB |
| creator claim 67 | CONFIRMED（至少15确认） | `0x5a7426b05a54f8bfbf6a9012a5094110689dde36910048f63736d9db0c9767bd` | 实收0.09155818 BEM | 0.0001044409 BNB |
| B claim 33 | CONFIRMED（至少15确认） | `0x09bad685e01819a520fa4120c5c6023c12768a6171846df73862614939785105` | 实收0.04509582 BEM | 0.0000527602 BNB |

最终67/33分配结论：**PASS**，两笔实收、同批账点及余数守恒均已验证。

## 脚本、离线验证与第六笔已执行计划

[三步脚本](./rewards.mjs)、[操作说明](./README.md)、[验证摘要](./validation.json) 已完成。新模块 **30/30** 离线测试通过；完整相关回归 **693/693** 通过（原发送与回执工具631、只读观察32、新收益工具30）。经独立源码审阅，未发现阻断项。

测试覆盖固定调用者/nonce/完整ID集合、harvest真实mint与两次入账、q/r整数分配、全部100个ID前后权益、零或不足100raw的测试失败状态、后两笔保持同一收益账点、规范回执15确认、历史记录哈希链、累计预算和禁止重复发送。测试中发现的模拟计划与输入共享对象问题已通过复制独立计划修正，确保篡改负例有效；未修改已部署合约。

新工具 hash：`501b3ba397abf2d824216a7e246fb90a79d5f81b79046e9cd8b89ed77a5e1649`。主代理已重新核对三步完整调用、原始计划文件哈希、当前工具哈希及累计费用算术。

| 第六笔字段 | 已获批准并执行的冻结计划 |
| --- | --- |
| 计划文件 | [harvest冻结计划](./plans/harvest-1a048e74fb5a3d9cc42b496479bffca3958d632017f51bad9b3439beb2339bec.json) |
| planHash | `0x1a048e74fb5a3d9cc42b496479bffca3958d632017f51bad9b3439beb2339bec` |
| 网络 / actor / nonce | BSC主网56 / creator / 11 |
| 目标 | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| 调用 / value | `harvest()` / 0 BNB |
| gas估算 / 上限 | 229,143 / 274,972 |
| gasPrice / 最大费用 | 0.05 gwei / **0.0000137486 BNB** |
| 本笔后累计最大预留 | **0.3041117338 BNB** |
| 沿用的累计批准上限 | **0.3045 BNB**，本次不提高 |
| calldataHash | `0xe060bba62b44b0683c379ec71ca27d4186dc6879cdda27161f89f1f206f42aaf` |

正式预览观察区块 **128581971**，hash `0x6fd5683a8961c35190a39145bd43dc36e4d21e7d559ce59676a447573856a032`；creator nonce 11，余额0.00402984675 BNB；Vault ACTIVE、完整100份仍为67/33，收益计数字段、Vault BEM及所有ID claimed/claimable均为0。Mining pending为 **13,659,838 raw = 0.13659838 BEM**，仅观测，不能当作实际到账保证。五笔前置交易的规范回执/精确事件、当前clone/依赖代码、gas估算与有界调用均通过。

本次harvest只把Mining实际收益计入Vault，不向creator或B支付。用户分别确认后才签名；两笔领取计划待harvest实际回执确定H/q/r后生成。上述为执行前的准备状态；本笔随后已单独获批并执行，该第六笔后的累计预留为0.3041117338 BNB；最终值见费用收尾章节。

## 第六笔harvest实际结果（该回执时的历史状态）

用户已单独批准上述harvest计划。执行时间：**2026-10-20T00:00:16+08:00**。脚本按冻结nonce11、value0、gas/price复核后只发送一次，没有重发或恢复。交易[查看回执](https://bscscan.com/tx/0xb3af0c8a9cc570826a4782fd3b09f9d306fdd5d7dd89c7b10c0985899f5a03ea)，区块 **128582473**，hash `0x6cb9440dac9faa6e74407bed3727b2d532cbec87de84627f251901ff37f69f7a`，至少15确认，journal=CONFIRMED。

| 字段 | 实际结果 |
| --- | --- |
| gasUsed / gasPrice / 实际gas费用 | 220,463 / 0.05 gwei / **0.00001102315 BNB** |
| Mining实际入账H | **13,665,485 raw = 0.13665485 BEM** |
| 每份收益q | **136,654 raw = 0.00136654 BEM** |
| 余数r | **85 raw = 0.00000085 BEM** |
| creator 67份应付 | **9,155,818 raw = 0.09155818 BEM**，该harvest回执时尚未领取（后续已领取） |
| B 33份应付 | **4,509,582 raw = 0.04509582 BEM**，该harvest回执时尚未领取（后续已领取） |
| Vault入账后账本 | balance=totalAccounted=13,665,485；totalPaid=0；accPerShare=136,654；remainder=85 |
| 100个ID | 权属67/33未变，supply均1，claimed均0、claimable均136,654 |

精确事件：首RewardsSynced四字段全0；唯一BEM Transfer为zero→Vault铸币13,665,485 raw；第二RewardsSynced与Harvested.received均为13,665,485，q/r一致。没有RewardClaimed、份额或矿机转移。完整[原始回执与业务记录](./transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json)已保存。该次只是收入Vault，creator和B本笔实际收益支付均为0。

后续两笔只用claimBatch领取这一个已确认账点：creator应收0.09155818 BEM，B应收0.04509582 BEM，最终Vault剩0.00000085 BEM。此为已确认账点下的应付值，最终实收仍须逐笔回执验证。

累计最大预留0.3041117338 BNB，沿用0.3045 BNB上限；四部署加六笔测试实际gas累计0.0009143054 BNB（Safe外层执行费单列），未释放任何历史gas预留。

## 第七笔creator领取67份：已主网确认

harvest另经[独立保存证据审计](./harvest-independent-audit.json)通过，未发现差错。该审计只交叉核对本地保存证据，不冒充新增RPC观察。

第七笔[冻结计划](./plans/creator-claim-d2fccac1bc6993e56054022ac3d573058569eb2da68d43c3803392c644737cd0.json)，hash `0xd2fccac1bc6993e56054022ac3d573058569eb2da68d43c3803392c644737cd0`。creator nonce12，目标为同一Vault，调用 `claimBatch([1…67])`、value0；应付 **9,155,818 raw = 0.09155818 BEM**，不再次harvest。

正式观察区块128582687，hash `0x026b04e5592a458fe15f51266e3caae6553fd75ade2ef0f1cbc8846a673abe05`。原harvest规范回执及历史记录hash、当前100份权属/claimed、Vault账本及余额仍匹配原H/q/r；gas估算与有界调用通过，未混入其他收益账点。

gas估算2,127,154，上限2,552,585，gasPrice0.05gwei，本笔费用上限 **0.00012762925 BNB**；批准执行后累计最大预留 **0.30423936305 BNB**，沿用 **0.3045 BNB** 上限。该只读准备阶段未签名/广播/增加预留；随后用户批准并执行，见下段。B对应 **0.04509582 BEM** 权益继续保留，B的领取另行确认。

### 第七笔实际回执

执行时间 **2026-10-20T00:17:14+08:00**，交易[查看回执](https://bscscan.com/tx/0x5a7426b05a54f8bfbf6a9012a5094110689dde36910048f63736d9db0c9767bd)，区块 **128584733**，hash `0x7c1eb093baa4043f871e954aebc049cabe04c8faf28bc27179c0f4feb005c388`，至少15确认，journal=CONFIRMED。按用户批准的nonce12与冻结参数发送一次，无重发或恢复。

| 核验项 | 实际结果 |
| --- | --- |
| creator实收 | **9,155,818 raw = 0.09155818 BEM**，与67×136,654完全一致 |
| 精确付款证据 | ID1–67共67条RewardClaimed，每条136,654 raw；唯一BEM Transfer为Vault→creator 9,155,818 raw |
| 同批入账点 | 恰一条RewardsSynced.received=0；无Harvested；H/q/r仍为13,665,485/136,654/85 |
| creator领取历史 | 1–67的claimed均136,654，claimable均0 |
| B保留权益 | 68–100的claimed均0，claimable每个136,654，总计 **4,509,582 raw = 0.04509582 BEM** |
| Vault余额 | **4,509,667 raw = 0.04509667 BEM**，等于B权益加85raw余数 |
| totalAccounted / totalPaid | 13,665,485 / 9,155,818 |
| gasUsed / price / 实际费用 | 2088818 / 0.05 gwei / **0.0001044409 BNB** |

完整100个ID的权属、supply与收益历史均核对，矿机仍在Vault；未调用Mining、未转移份额或矿机。钱包区块末余额只作快照，实际领取金额按本笔精确BEM Transfer、RewardClaimed和Vault支付校验归因。

累计最大预留 **0.30423936305 BNB**，低于0.3045 BNB批准上限；四部署加七笔测试实际gas合计 **0.0010187463 BNB**。该第七笔回执时B尚未领取；第八笔随后完成，最终结论见开头与下节。

## 第八笔B领取33份：已主网确认

creator实际领取另经[独立保存证据审计](./creator-claim-independent-audit.json)通过，无差错。本审计未进行新的RPC观察。

第八笔[冻结计划](./plans/buyer-b-claim-5200423939663e694c2f7997950cbfefcc74bf0d0346b99f3f0977528f61ec61.json)，hash `0x5200423939663e694c2f7997950cbfefcc74bf0d0346b99f3f0977528f61ec61`。B nonce5，目标为同一Vault，调用 `claimBatch([68…100])`、value0；应付 **4,509,582 raw = 0.04509582 BEM**，不再次harvest。

正式观察区块128584887，hash `0x12f069e1698fc701e362a213a1fd34929f882cac5a97b23a11663067ed108670`。harvest/creator两笔规范回执及完整历史hash前缀、当前100份权属与领取历史、H/q/r和totalPaid全部匹配；Vault余额4,509,667 raw，B领取后预期只剩85raw余数。gas估算与有界模拟均通过。

gas估算1,077,134，上限1,292,561，gasPrice0.05gwei，费用上限 **0.00006462805 BNB**；执行后累计最大预留 **0.3043039911 BNB**，沿用 **0.3045 BNB** 上限。上述为只读准备阶段；用户随后单独批准并执行，实际结果如下。

### 第八笔实际回执

执行时间 **2026-10-20T00:24:28+08:00**，交易[查看回执](https://bscscan.com/tx/0x09bad685e01819a520fa4120c5c6023c12768a6171846df73862614939785105)，区块 **128585699**，hash `0xf74d7978513b1afc5ae06fbd24d5e93e9746e588282b8a92b4d554e3e2e10586`，至少15确认，journal=CONFIRMED。按用户批准的nonce5与冻结参数发送一次，没有重发或恢复。

| 核验项 | 实际结果 |
| --- | --- |
| B实收 | **4,509,582 raw = 0.04509582 BEM**，与33×136,654完全一致 |
| 精确付款证据 | ID68–100共33条RewardClaimed，每条136,654raw；唯一BEM Transfer为Vault→B 4,509,582raw |
| 同批账点 | 1条RewardsSynced.received=0，无Harvested，H/q/r未变 |
| 最终Vault账本 | totalAccounted=13,665,485；totalPaid=13,665,400；accPerShare=136,654；remainder=85 |
| Vault余额 | **85raw = 0.00000085 BEM** |
| 全部100个ID | claimed均136,654、claimable均0；holder/supply/钱包batch余额均匹配原67/33分配 |
| 矿机与状态 | owner=Vault，ACTIVE，未转移矿机或份额 |
| gasUsed / gasPrice / 实际费用 | 1,055,204 / 0.05gwei / **0.0000527602 BNB** |

### 最终费用与可复跑对账

三笔收益测试实际gas分别为harvest **0.00001102315 BNB**、creator **0.0001044409 BNB**、B **0.0000527602 BNB**，合计 **0.00016822425 BNB**。四笔部署加八笔测试实际gas累计 **0.0010715065 BNB**；两笔认购本金共0.303 BNB，毛转出本金加gas为 **0.3040715065 BNB**，不抵扣creator收到的0.003 BNB费用，Safe外层执行费用继续单列。

共享预算保留全部12项历史预留，累计最大预留 **0.3043039911 BNB**，低于已批准上限 **0.3045 BNB**，剩余可预留空间 **0.0001960089 BNB**；预留与实际支出之差0.0002324846 BNB没有释放。

[最终机器对账结果](./audit/final-reconciliation.json)为 **PASS、exit0**。该命令独立解码原始回执、检查3份冻结计划与历史entryHash链、逐步100份账本、67/33比例、收支守恒及所有历史预算。新增离线对账测试 **6/6 PASS**，与发送/观察工具的 **693/693** 回归分别记录。对账仅复核保存证据，没有新增RPC、签名或广播；三笔真实主网确认由发送器分别完成。

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-rewards/audit/final-reconcile.test.mjs
node --import tsx mainnet-rewards/audit/final-reconcile.mjs
```

[验证摘要](./validation.json)、[完整原始journal](./transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json)、三份冻结计划和每笔完整状态均已保存。最终结果经独立本地证据审计复核，具体边界为保存证据交叉核对，不将离线命令冒充新的实时链证明。
