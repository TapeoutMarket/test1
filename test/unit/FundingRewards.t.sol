// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TestBase} from "../helpers/TestBase.sol";
import {Types} from "../../src/Types.sol";
import {GroupBuyVault} from "../../src/GroupBuyVault.sol";
import {ForceBNB} from "../helpers/Mocks.sol";

contract FundingRewardsTest is TestBase {
    function testCostsExactlySumToPriceAndOneWeiDifference() public view {
        uint256 total;
        for (uint256 i = 1; i <= 100; i++) {
            total += vault.costOf(i);
        }
        assertEq(total, PRICE);
        assertEq(vault.costOf(1), vault.costOf(100) + 1);
    }

    function testOne45And55SharesFundingThroughFactoryClone() public {
        contribute(alice, 1, 1, false);
        contribute(alice, 2, 45, false);
        contribute(bob, 46, 100, true);
        assertEq(uint256(vault.state()), uint256(Types.State.ACTIVE));
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
        assertEq(market.lastBuyer(), address(vault));
        assertEq(market.lastValue(), PRICE);
        assertEq(vault.fundedWei(), 0);
        for (uint256 i = 1; i <= 100; i++) {
            assertEq(vault.totalSupply(i), 1);
        }
    }

    function testCreator50B20CreatorExitC50D30Completes() public {
        contribute(alice, 1, 50, false);
        contribute(bob, 51, 70, false);
        uint256 returned = cost(ids(1, 50));
        uint256 before = alice.balance;
        vm.prank(alice);
        vault.withdraw(ids(1, 50), payable(alice));
        assertEq(alice.balance - before, returned);
        contribute(carol, 1, 50, false);
        contribute(dave, 71, 100, true);
        assertEq(vault.holderOf(1), carol);
        assertEq(vault.holderOf(51), bob);
        assertEq(vault.holderOf(100), dave);
        assertEq(vault.totalPrincipalIn(), vault.totalPrincipalRefunded() + vault.purchaseSpent());
    }

    function testReleasedIdsReusedAndAllExitDoesNotExtendDeadline() public {
        uint64 deadline = vault.getTerms().deadline;
        for (uint256 i; i < 4; i++) {
            contribute(alice, 1, 45, false);
            vm.prank(alice);
            vault.withdraw(ids(1, 45), payable(alice));
        }
        assertEq(vault.soldCount(), 0);
        assertEq(vault.availableIds().length, 100);
        assertEq(vault.getTerms().deadline, deadline);
        activate();
        assertEq(vault.soldCount(), 100);
    }

    function testExactValueEmptyDuplicateOutOfRangeAndSoldRejected() public {
        uint256 exact = cost(ids(1, 1));
        vm.startPrank(alice);
        vm.expectRevert(GroupBuyVault.WrongValue.selector);
        vault.contribute{value: exact + 1}(ids(1, 1), false, payload);
        vm.expectRevert(GroupBuyVault.WrongValue.selector);
        vault.contribute{value: exact - 1}(ids(1, 1), false, payload);
        vm.expectRevert(GroupBuyVault.InvalidIds.selector);
        vault.contribute(new uint256[](0), false, payload);
        vm.expectRevert(GroupBuyVault.InvalidIds.selector);
        vault.contribute(ids(0, 0), false, payload);
        vm.expectRevert(GroupBuyVault.InvalidIds.selector);
        vault.contribute(ids(101, 101), false, payload);
        uint256[] memory dup = new uint256[](2);
        dup[0] = 1;
        dup[1] = 1;
        vm.expectRevert(GroupBuyVault.InvalidIds.selector);
        vault.contribute(dup, false, payload);
        vm.stopPrank();
        contribute(alice, 1, 1, false);
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.InvalidIds.selector);
        vault.contribute{value: exact}(ids(1, 1), false, payload);
    }

    function testCompletionProtectsAgainstPriorExitButOrdinaryJoinCanContinue() public {
        contribute(alice, 1, 99, false);
        vm.prank(alice);
        vault.withdraw(ids(1, 1), payable(alice));
        uint256 last = cost(ids(100, 100));
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.CompletionRequired.selector);
        vault.contribute{value: last}(ids(100, 100), true, payload);
        assertEq(vault.holderOf(100), address(0));
        contribute(bob, 100, 100, false);
        contribute(carol, 1, 1, true);
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.withdraw(ids(2, 2), payable(alice));
    }

    function testFundingTransferOperatorWithdrawalAndArbitraryBurnDenied() public {
        contribute(alice, 1, 45, false);
        vm.prank(alice);
        vault.setApprovalForAll(bob, true);
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.NotHolder.selector);
        vault.withdraw(ids(1, 1), payable(bob));
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.safeTransferFrom(alice, bob, 1, 1, "");
        vm.prank(alice);
        (bool ok,) =
            address(vault).call(abi.encodeWithSignature("burn(address,uint256,uint256)", alice, 1, 1));
        assertFalse(ok);
    }

    function testDonationAndHistoricalDepositsCannotCompleteFunding() public {
        new ForceBNB{value: 2 ether}(payable(address(vault)));
        contribute(alice, 1, 99, false);
        vm.prank(alice);
        vault.withdraw(ids(1, 99), payable(alice));
        contribute(bob, 100, 100, false);
        assertEq(vault.soldCount(), 1);
        assertEq(vault.fundedWei(), cost(ids(100, 100)));
        assertEq(uint256(vault.state()), uint256(Types.State.FUNDING));
        assertEq(vault.totalPrincipalIn(), vault.totalPrincipalRefunded() + vault.fundedWei());
    }

    function testDeadlineStopsFundingAndRefundDoesNotNeedExternalProtocols() public {
        contribute(alice, 1, 45, false);
        vm.warp(terms.deadline);
        market.setFaults(true, 0, false);
        mining.setBroken(true);
        bem.setFaults(true, true, false);
        vault.markRefundable();
        vm.prank(alice);
        vault.withdraw(ids(1, 45), payable(alice));
        assertEq(vault.fundedWei(), 0);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.markRefundable();
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.contribute(ids(1, 1), false, payload);
    }

    function testZeroInitialAndZeroSyncPreserveHistory() public {
        activate();
        assertEq(vault.totalAccounted(), 0);
        vault.harvest();
        assertEq(mining.claims(), 1);
        assertEq(vault.totalAccounted(), 0);
        bem.mint(address(vault), 10000);
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        uint256 old = vault.claimed(1);
        vault.syncRewards();
        assertEq(vault.claimed(1), old);
        assertEq(vault.claimable(46), 100);
    }

    function testHarvestSettlesNewRewardsWhenCachedPendingIsZero() public {
        activate();
        mining.setPending(address(nft), TOKEN_ID, 10000);
        vault.harvest();
        bytes32 key = mining.minerKey(address(nft), TOKEN_ID);
        assertEq(mining.pending(key), 0);
        vm.warp(block.timestamp + 1 hours);
        mining.setUnsettledRewards(address(nft), TOKEN_ID, 10007);
        assertEq(mining.pending(key), 0);
        vault.harvest();
        assertEq(mining.claims(), 2);
        assertEq(mining.unsettledRewards(key), 0);
        assertEq(bem.balanceOf(address(vault)), 20007);
        assertEq(vault.totalAccounted(), 20007);
        assertEq(vault.accPerShare(), 200);
        assertEq(vault.remainder(), 7);
        assertEq(vault.claimable(1), 200);
        assertEq(vault.claimable(100), 200);
    }

    function testHarvestAndClaimPaysRewardsNotReportedByPending() public {
        activate();
        mining.setUnsettledRewards(address(nft), TOKEN_ID, 10007);
        assertEq(mining.pending(mining.minerKey(address(nft), TOKEN_ID)), 0);
        vm.prank(alice);
        vault.harvestAndClaim(ids(1, 45));
        assertEq(mining.claims(), 1);
        assertEq(bem.balanceOf(alice), 4500);
        assertEq(bem.balanceOf(address(vault)), 5507);
        assertEq(vault.totalAccounted(), 10007);
        assertEq(vault.totalPaid(), 4500);
        assertEq(vault.claimable(46), 100);
        assertEq(vault.remainder(), 7);
    }

    function testNormalRedeemSettlesRewardsNotReportedByPending() public {
        contribute(alice, 1, 100, true);
        mining.setUnsettledRewards(address(nft), TOKEN_ID, 10037);
        assertEq(mining.pending(mining.minerKey(address(nft), TOKEN_ID)), 0);
        vm.prank(alice);
        vault.redeemMiner();
        assertEq(mining.claims(), 1);
        assertEq(bem.balanceOf(alice), 10037);
        assertEq(bem.balanceOf(address(vault)), 0);
        assertEq(vault.totalAccounted(), 10037);
        assertEq(vault.totalPaid(), 10037);
        assertEq(vault.remainder(), 0);
        assertEq(nft.ownerOf(TOKEN_ID), alice);
        assertEq(vault.totalSupply(1), 0);
        assertEq(vault.totalSupply(100), 0);
    }

    function testHarvestPropagatesZeroRewardAndMiningFailures() public {
        activate();
        bem.mint(address(vault), 10000);
        mining.setZeroReverts(true);
        vm.expectRevert("ZERO_REWARDS");
        vault.harvest();
        assertEq(vault.totalAccounted(), 0);
        assertEq(mining.claims(), 0);
        mining.setZeroReverts(false);
        mining.setBroken(true);
        vm.expectRevert("MINING_BROKEN");
        vault.harvest();
        assertEq(vault.totalAccounted(), 0);
        assertEq(mining.claims(), 0);
    }

    function testClaimBatchDoesNotDependOnMiningOrSettleItsRewards() public {
        activate();
        bem.mint(address(vault), 10000);
        mining.setUnsettledRewards(address(nft), TOKEN_ID, 20000);
        mining.setBroken(true);
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        assertEq(bem.balanceOf(alice), 4500);
        assertEq(vault.totalAccounted(), 10000);
        assertEq(vault.totalPaid(), 4500);
        assertEq(mining.claims(), 0);
        assertEq(mining.unsettledRewards(mining.minerKey(address(nft), TOKEN_ID)), 20000);
        assertEq(vault.claimable(46), 100);
    }

    function test45And55EachOneBatchOrderIndependentConservation() public {
        activate();
        mining.setPending(address(nft), TOKEN_ID, 10007);
        vm.prank(alice);
        vault.harvestAndClaim(ids(1, 45));
        assertEq(bem.balanceOf(alice), 4500);
        assertEq(vault.remainder(), 7);
        assertEq(mining.lastCaller(), address(vault));
        vm.prank(bob);
        vault.claimBatch(ids(46, 100));
        assertEq(bem.balanceOf(bob), 5500);
        bem.mint(address(vault), 93);
        vm.prank(bob);
        vault.claimBatch(ids(46, 100));
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        assertEq(bem.balanceOf(alice), 4545);
        assertEq(bem.balanceOf(bob), 5555);
        assertEq(bem.balanceOf(address(vault)), 0);
        assertEq(vault.totalPaid(), 10100);
        assertEq(vault.remainder(), 0);
    }

    function testDifferentClaimHistoryAndPositiveRightsFollowId() public {
        activate();
        bem.mint(address(vault), 10000);
        vm.prank(alice);
        vault.claim(1);
        bem.mint(address(vault), 10000);
        vm.prank(alice);
        vault.safeBatchTransferFrom(alice, bob, ids(1, 2), ones(2), "");
        assertEq(vault.claimable(1), 100);
        assertEq(vault.claimable(2), 200);
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.NotHolder.selector);
        vault.claim(1);
        vm.prank(bob);
        vault.claimBatch(ids(1, 2));
        assertEq(bem.balanceOf(bob), 300);
        vm.prank(bob);
        vault.claimBatch(ids(1, 2));
        assertEq(bem.balanceOf(bob), 300);
    }

    function testDirectDonationsThirdPartyMiningClaimAndOldPending() public {
        bem.mint(address(vault), 99);
        mining.setPending(address(nft), TOKEN_ID, 10001);
        activate();
        assertEq(vault.remainder(), 99);
        vm.prank(dave);
        mining.claim(mining.minerKey(address(nft), TOKEN_ID));
        vault.harvest();
        assertEq(vault.totalAccounted(), 10100);
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        vm.prank(bob);
        vault.claimBatch(ids(46, 100));
        assertEq(vault.totalPaid(), 10100);
    }

    function testAll100SingleBatchClaimAndNormalRedeemDust() public {
        contribute(alice, 1, 100, true);
        bem.mint(address(vault), 10037);
        vm.prank(alice);
        vault.claimBatch(ids(1, 100));
        assertEq(bem.balanceOf(alice), 10000);
        vm.prank(alice);
        vault.redeemMiner();
        assertEq(bem.balanceOf(alice), 10037);
        assertEq(nft.ownerOf(TOKEN_ID), alice);
        assertEq(vault.totalPaid(), 10037);
        assertEq(vault.remainder(), 0);
        assertEq(vault.soldBitmap(), 0);
        for (uint256 i = 1; i <= 100; i++) {
            assertEq(vault.totalSupply(i), 0);
        }
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.redeemMiner();
    }

    function testMissingOneAndOperatorCannotRedeem() public {
        activate();
        vm.prank(alice);
        vault.safeBatchTransferFrom(alice, bob, ids(1, 44), ones(44), "");
        vm.prank(alice);
        vault.setApprovalForAll(bob, true);
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.NotHolder.selector);
        vault.redeemMiner();
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.NotHolder.selector);
        vault.redeemWithoutHarvest();
    }

    function testWithoutHarvestIgnoresMiningAndBEMFailureThenRecoversResidual() public {
        activate();
        consolidate();
        bem.mint(address(vault), 10037);
        mining.setPending(address(nft), TOKEN_ID, 100);
        mining.setBroken(true);
        bem.setFaults(true, true, false);
        vm.prank(alice);
        vault.redeemWithoutHarvest();
        assertEq(nft.ownerOf(TOKEN_ID), alice);
        assertEq(vault.totalPaid(), 0);
        bem.setFaults(false, false, false);
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.Unauthorized.selector);
        vault.claimResidual(bob);
        vm.prank(alice);
        vault.claimResidual(alice);
        assertEq(bem.balanceOf(alice), 10037);
        assertEq(vault.totalPaid(), 10037);
        bem.mint(address(vault), 3);
        vm.prank(alice);
        vault.claimResidual(alice);
        vm.prank(alice);
        vault.claimResidual(alice);
        assertEq(bem.balanceOf(alice), 10040);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.harvest();
    }

    function testNormalRedeemPaymentAndNFTFailureRollBack() public {
        activate();
        consolidate();
        bem.mint(address(vault), 10000);
        bem.setFaults(false, true, false);
        vm.prank(alice);
        vm.expectRevert("BEM_TRANSFER_BROKEN");
        vault.redeemMiner();
        assertEq(vault.totalSupply(1), 1);
        assertEq(vault.totalPaid(), 0);
        bem.setFaults(false, false, false);
        nft.setBroken(true);
        vm.prank(alice);
        vm.expectRevert("NFT_BROKEN");
        vault.redeemMiner();
        assertEq(vault.totalSupply(100), 1);
        assertEq(bem.balanceOf(alice), 0);
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
    }

    function testActiveTransfersZeroSelfAndDuplicateBatchKeepHolderIndex() public {
        activate();
        vm.startPrank(alice);
        vault.safeTransferFrom(alice, bob, 1, 0, "");
        assertEq(vault.holderOf(1), alice);
        vault.safeTransferFrom(alice, alice, 1, 1, "");
        assertEq(vault.holderOf(1), alice);
        uint256[] memory duplicate = new uint256[](2);
        duplicate[0] = 1;
        duplicate[1] = 1;
        vm.expectRevert(GroupBuyVault.InvalidIds.selector);
        vault.safeBatchTransferFrom(alice, bob, duplicate, ones(2), "");
        vm.stopPrank();
    }

    function testFuzzCostRule(uint96 input) public {
        uint256 price = bound(input, 100, 100 ether);
        terms.totalPrice = price;
        terms.listingPrice = uint96(price);
        market.setPrice(1, uint96(price));
        vault = GroupBuyVault(payable(factory.createPool(address(template), configHash, terms, payload, 2)));
        uint256 sum;
        for (uint256 i = 1; i <= 100; i++) {
            uint256 c = vault.costOf(i);
            assertGt(c, 0);
            sum += c;
        }
        assertEq(sum, price);
    }
}
