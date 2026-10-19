# 真实 BSC 状态本机 fork：修复后证据复核

最终修复后运行的 **23 项场景检查均为 PASS，25 笔交易均在本机 fork 执行成功**。本次独立复核重新解码保存的原始回执，核对两次正 BEM 收获、批量领取、正未领权益转移及两个退出分支；金额和事件一致。此文档以本次最终报告为准，替代先前仅覆盖余数赎回的旧轮记录。

复核是同一工程内对运行证据的交叉检查，不构成独立第三方安全审计；没有主网部署或主网交易。读取报告和执行断言的复核过程没有发交易。

## 最终证据身份

| 项目 | 绑定值 |
| --- | --- |
| 最终完成时间（UTC） | 2026-10-19T12:47:20.106Z |
| 固定源链 | BSC，chainId 56，块 128554249 |
| 固定块 hash | `0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d` |
| 本机 hostInstanceId | `f2b486c2-14e2-4034-a43a-e80c61b40974` |
| fork Vault | `0x3059065Fc566A17d80AdDFcc2BD5f677AF300Acb` |
| 订单 hash | `0x157965afaffa5c5949ab133f9da4054d7607201aad675c29b81fc0f6370c3f2a` |
| 运行前后相同的代码指纹 | `7a48ebd4fbddff6974cb83b2609ed2693ff022611c64da814a0f61bc5661b7fa` |
| 最终执行报告 SHA-256 | `8762427a6054472f7d064e708eeda3997aaf625f45d21cc41c56b945d594131e` |
| 后置源链只读报告 SHA-256 | `9c84820da42fe0c78fcf538ce43d3378bcea7d6dfd39f89d3f279a5f64c09678` |
| Mining 诊断归档 SHA-256 | `da262b505e7c19424cbab897f5af215d66455cb0daec81c67f88853e36402345` |

原始证据：[最终执行报告](../reports/real-bsc-fork-tests.json)、[源链后置只读报告](../reports/real-source-postcheck.json)、[真实 Mining 诊断归档](../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json)。执行器为 [run-authorized-fork-tests.mjs](../scripts/run-authorized-fork-tests.mjs)。每笔 fork 回执在收取时核验该分支实际块 hash；报告中的 fork 交易 hash 不能作为主网回执使用。

矿机为 collection `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` 的 #3204。真实依赖：Seaport `0x0000000000000068F116a894984e2DB1123eB395`、Mining `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46`、BEM `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a`。订单只在 fork 内通过 A impersonation、单 NFT approve 和真实 Seaport.validate 创建；signature=`0x`，没有生成公开卖单签名。卖家价 0.3 BNB，测试手续费 0.003 BNB，合计 0.303 BNB；creator 是本次测试指定的手续费接收者，不代表已核验正式市场收费配置。

账户本地 BNB 通过 Anvil 配置；未修改 NFT、Mining、BEM 的代码或存储。初始 tip 必须等于固定源块。测试治理使用 EOA 和 1 秒 Timelock，不代表生产治理。

## 真实发现与修复核验

原先 Vault 根据 pending()!=0 决定是否调用 claim。独立诊断在真实 Mining 上观察到：第一次领取后 pending=0，增加 3,600 秒后 pending 仍为 0，但第二次 claim 的 BEM Transfer 和账户余额增量均为 **37,601 raw（0.00037601 BEM）**。第一次领取所在的同一区块再执行 eth_call 也成功返回；它是零笔交易的模拟证据，不能写成另一笔已挖交易。

诊断源码指纹前后相同、真实依赖 source/fork codehash 一致；诊断结束后停止 impersonation 并恢复快照，新 fork 初始状态恢复。诊断的两笔交易随后被回滚，不计入下面 25 笔主流程交易或主流程 BEM 收支。

修复后的 _harvest 始终调用 Mining.claim，并以 Vault 实际 BEM 余额增量记账；不吞掉外部错误。定向 FundingRewards 测试 **24/24 PASS**，其中新增回归覆盖 cached pending 为零时的 harvest、harvestAndClaim、普通赎回，以及零收益/Mining 错误传播、claimBatch 不依赖 Mining。三个修改文件 fmt --check 通过。主流程随后从新鲜源块状态重新运行，第二次 harvest 在 pending=0 时实际收到了同样的 37,601 raw，证明修复在真实依赖 fork 上生效。

## 两次收获与领取数额

BEM decimals 为 8，核算使用原始整数。

| 项目 | raw 最小单位 | BEM |
| --- | ---: | ---: |
| 首次 harvest 前观察到的 Mining pending | 13,532,613 | 0.13532613 |
| 首次 harvest 实际进入 Vault | 13,533,093 | 0.13533093 |
| 首次每份累计收益 | 135,330 | 0.00135330 |
| 首次除以 100 后余数 | 93 | 0.00000093 |
| A 一笔领取 #2–#45，44 份 | 5,954,520 | 0.05954520 |
| B 一笔领取 #46–#100，55 份 | 7,443,150 | 0.07443150 |
| #1 从 A 转给 B 后由 B 领取 | 135,330 | 0.00135330 |
| 第二次 harvest 前 pending | 0 | 0 |
| 第二次 harvest 实际进入 Vault | 37,601 | 0.00037601 |
| 第二次后 Vault 余额，含原余数 93 | 37,694 | 0.00037694 |
| 第二次后每份新增应领 | 376 | 0.00000376 |
| 第二次后余数 | 94 | 0.00000094 |
| 两次总入账 | 13,570,694 | 0.13570694 |

两笔 harvest 的 BEM Transfer 均为零地址向 Vault 转入，金额分别为 13,533,093、37,601，与 RewardsSynced、Harvested 和 Vault 余额差一致。首次实际到账比先前 pending 观察多 480 raw；记录两个不同观察点，不把 pending 当成精确执行到账金额，也不推断尚未核实的外部计算公式。

A 原持有 45 份，本轮为测试权益转移而故意只领 44 份。其回执有 44 个唯一 ID 的 RewardClaimed；B 第一笔有 55 个；每份均为 135,330 raw，BEM Transfer 等于求和。#1 在转移前后 claimed 都为 0、claimable 都为 135,330，转移交易无 BEM Transfer。旧 A 领取模拟返回 NotHolder，新 B 的真实 fork 交易随后收到 135,330 raw。这直接证明已入 Vault 的正未领权益随 NFT 转移。

B 再把 #1 和 #46–#100 共 56 个 ID 转给 A，归集后 A 对 #1–#100 各持有 1。后续新增收益归 A 持有的所有份额；因此本轮不能用最初 A45/B55 的比例解释整个生命周期最终收入。

## 普通赎回与直接取出矿机

两个退出分支共用同一快照：块 128554271、hash `0x26da406cd5b56ff6dbaa352a1b3257ec77354ed8154a9b189c77599c57f79506`。基线 pending=0、Vault BEM=37,694；每个 ID 尚可领取 376 raw，余数 94。此轮已覆盖正未领份额收益，不再只是余数赎回。

| 分支 | 回执及余额证据 | 结果 |
| --- | --- | --- |
| 普通 redeem | 内部 Harvested.received=0；100 个 RewardClaimed 各 376；100 个 ID 各销毁 1；BEM 支付 37,694；#3204 从 Vault 转给 A | A 在一笔交易内取得矿机和全部现有 BEM；随后为测试另一分支而回滚 |
| redeemWithoutHarvest | 从相同快照恢复；100 个 ID 各销毁 1；#3204 转给 A；没有 Harvested、RewardClaimed 或 BEM Transfer；A BEM 不变，Vault 仍为 37,694 | 直接取出矿机成功；此笔没有领取 BEM |
| claimResidual | A 在下一笔收到 37,694 raw；Vault 余额清零 | 最终保留分支完成剩余款领取 |

普通赎回支付计算为 **100 × 376 + 94 = 37,694 raw**。普通赎回时的 Mining claim 实际新增 0；本轮没有证明“在 redeem 这一笔内部又新增正 Mining 收益”的特定时间点，但先前第二次真实 harvest 已证明 cached pending=0 下可结算正收益，单元回归也覆盖相同 _harvest 逻辑在 redeem 中的路径。

最终保留分支中 A 总收入为 **5,954,520 + 37,694 = 5,992,214 raw（0.05992214 BEM）**；B 总收入为 **7,443,150 + 135,330 = 7,578,480 raw（0.07578480 BEM）**。两者相加为 **13,570,694 raw**，等于两次真实总入账，且 final totalPaid = totalAccounted = 13,570,694、Vault BEM=0。钱包初末余额差也与这两个总数一致。

25 笔成功交易中，guardian 可退款分支 2 笔、普通赎回分支 1 笔后来回滚；22 笔属于最终保留路径。普通和直接退出分支不能重复累计收入。相同高度上的分支块 hash 不同是快照回滚后的正常结果。

## 关键 fork 回执索引

| 操作 | 交易 hash |
| --- | --- |
| 第一次 harvest | `0x85f2e4a2c0aa5c921f1bfd85180b4b49a3e6d4470c5385bc1fca392537594c6c` |
| A 领取 44 份 | `0xb6c58ebbca2b03782a59ea2dd885384b72fd7bf490522984debe25d7c0ec2f42` |
| B 领取 55 份 | `0x592d7ce0831adf8d987f920233dbe343d2b9369ffd4061bc3681a9c4ef56eb2b` |
| A→B 转移 #1 | `0x7976d4c98aa3b22d13a0a6efc21a0c07df7ddbe8ce617396c41b7a53b23c3bc7` |
| B 领取 #1 | `0x1e8a1b56675240f0895d4f90af6b86309665f029c2b2d9737ef5a288ec66039b` |
| B→A 归集 56 份 | `0x59863ebe0f87a33dba1b09607c5c6bfbfca28370c44b923e4156b84fd215659b` |
| 第二次 harvest，pending=0 但正到账 | `0xbb4c0e08ec3731f159bdaaa59d89723df909e16290cb8ac35aedfe04aaef3d79` |
| 普通赎回，后来回滚 | `0xa96014430ee6fc2409608c33cad436942eba3b0b60865ea077e2311afd58229d` |
| 直接取出矿机，最终分支 | `0xf81843fb715873347e6af2662d72e3386f84341e69ea5c59d78a489640abcd3b` |
| 最终剩余款领取 | `0x2d64f08bb92b27907d42187bc073c33afa112ccae34331f225d474e1426f2a02` |

## 主链后置只读核验

主运行器的 source-read-only-check 检查固定源块，后置脚本 [check-authorized-source.mjs](../scripts/check-authorized-source.mjs) 补充最终运行后的最新主链观察。该脚本只读取公共输入及源只读代理，无 .env、无私钥、无交易发送；报告已绑定本次最终执行报告 SHA-256。

后置报告生成于 2026-10-19T12:47:38.007Z。先选择最新观察块 **128556806**，再把 owner、approval、orderStatus 的读取全部固定在该块号，读取后复核固定源块及最新观察块 hash。最新观察块 hash 为 `0x45507aece822a5e9cc1e788f72e4a02f0b67939c4c021fc07bb5fe07784b86a8`。固定源块和该最新观察块均为：#3204 owner=A；单 NFT approved=零地址；A 对 Seaport 的 approvedForAll=false；本轮精确 orderHash 的 isValidated=false、isCancelled=false、totalFilled=0、totalSize=0。六项检查全为 true，PASS。

这证明两个指定检查点的状态，没有穷尽主链全部历史；相同 owner/approval 不能证明期间从无任何其他交易，当前订单未验证或成交也不能推广到其他订单。无主网广播的边界同时依赖源代理只读方法白名单、写请求固定到本机 Anvil，以及执行流程没有加载私钥或生成公开签名。

## 仍需区分的覆盖范围

- 已覆盖该真实固定 BSC 状态的购买、两次正收获、批量领取、正权益转移、100 份归集、正未领份额收益下的普通赎回和直接退出后取回剩余 BEM；不意味着所有链状态或协议版本都兼容。
- 订单是本机 fork 创建并预验证，未覆盖导入已有公开签名卖单、正式市场 API/前端/数据库、发布订单、签名采集和生产收费配置。
- cached pending 不能用于预测“当前最多可领多少”。第二次正收益已在真实 fork 证实；其他长期生产阶段、经济规则和外部合约全量行为未穷尽。
- 本轮没有向真实 Mining/BEM 注入故障。直接退出回执无 BEM 转移已经验证，但未采集完整调用轨迹作为“不调用任何收益依赖”的运行时证明；源码控制流和 mock 故障测试应分别列证据。
- ACTIVE guardian 拒绝、旧持有人领取拒绝、非持有人退款拒绝为模拟回退证据，不能列为已广播的失败交易。
- 23 项包括身份、配置、部署和只读检查，不能写成 23 个独立财务边界用例。主网部署与广播、生产治理及独立第三方安全审计未执行。
