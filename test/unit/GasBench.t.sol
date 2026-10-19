// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {Types} from "../../src/Types.sol";

/// @notice Local operation-level measurements, not entire-test gas totals.
/// @dev Uses the real Factory ERC1967Proxy -> ERC1167 clone path from TestBase.
///      Each stateful scenario is prepared in setUp (a preceding executor call),
///      avoiding dirty-SSTORE discounts from funding earlier in the measured test.
///      All arrays, prices and cooling occur before the gasleft snapshot.
///      Values include the Solidity external-call/encoding overhead, exclude
///      transaction intrinsic/calldata gas and refunds, and use Mock protocols.
///      The 30M limit is a local regression budget, not a BSC execution guarantee.
abstract contract GasBenchBase is TestBase {
    uint256 private constant LOCAL_OPERATION_BUDGET = 30_000_000;

    function _coolScenario() internal {
        // Reset account/storage warmth left by activation or preceding assertions.
        address validator = address(template.marketValidator());
        vm.cool(address(vault));
        vm.cool(address(template));
        vm.cool(validator);
        vm.cool(address(nft));
        vm.cool(address(bem));
        vm.cool(address(mining));
        vm.cool(address(market));
        vm.cool(alice);
        vm.cool(bob);
        vm.cool(seller);
    }

    function _record(string memory label, uint256 used) internal {
        emit log_named_uint(label, used);
        assertLt(used, LOCAL_OPERATION_BUDGET, "LOCAL_30M_OPERATION_BUDGET_EXCEEDED");
    }
}

contract GasBenchContribute100Test is GasBenchBase {
    function testGasContribute100AndPurchase() public {
        uint256[] memory all = ids(1, 100);
        uint256 principal = cost(all);
        bytes memory order = payload;
        _coolScenario();
        vm.prank(alice);
        uint256 before = gasleft();
        vault.contribute{value: principal}(all, true, order);
        uint256 used = before - gasleft();
        _record("GAS_LOCAL_CONTRIBUTE_100_PURCHASE", used);
        assertEq(uint256(vault.state()), uint256(Types.State.ACTIVE));
        assertEq(vault.soldCount(), 100);
        assertEq(vault.purchaseSpent(), PRICE);
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
    }
}

contract GasBenchWithdraw99Test is GasBenchBase {
    function setUp() public override {
        super.setUp();
        contribute(alice, 1, 99, false);
    }

    function testGasWithdraw99FundingShares() public {
        // 100 funded IDs cannot persist in FUNDING: the 100th atomically buys.
        // Therefore 99 is the maximum valid pre-purchase full-batch refund.
        uint256[] memory shares = ids(1, 99);
        uint256 principal = vault.fundedWei();
        uint256 balanceBefore = alice.balance;
        _coolScenario();
        vm.prank(alice);
        uint256 before = gasleft();
        vault.withdraw(shares, payable(alice));
        uint256 used = before - gasleft();
        _record("GAS_LOCAL_WITHDRAW_99_FUNDING", used);
        assertEq(alice.balance - balanceBefore, principal);
        assertEq(vault.fundedWei(), 0);
        assertEq(vault.soldCount(), 0);
        assertEq(uint256(vault.state()), uint256(Types.State.FUNDING));
    }
}

contract GasBenchClaim45Test is GasBenchBase {
    function setUp() public override {
        super.setUp();
        activate();
        bem.mint(address(vault), 10_003);
        vault.syncRewards();
    }

    function testGasClaim45InOneCall() public {
        uint256[] memory aIds = ids(1, 45);
        _coolScenario();
        vm.prank(alice);
        uint256 before = gasleft();
        vault.claimBatch(aIds);
        uint256 used = before - gasleft();
        _record("GAS_LOCAL_CLAIM_BATCH_45", used);
        assertEq(bem.balanceOf(alice), 4500);
        assertEq(vault.totalPaid(), 4500);
    }
}

contract GasBenchClaim55Test is GasBenchBase {
    function setUp() public override {
        super.setUp();
        activate();
        bem.mint(address(vault), 10_003);
        vault.syncRewards();
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
    }

    function testGasClaim55InOneCallAfter45Paid() public {
        uint256[] memory bIds = ids(46, 100);
        _coolScenario();
        vm.prank(bob);
        uint256 before = gasleft();
        vault.claimBatch(bIds);
        uint256 used = before - gasleft();
        _record("GAS_LOCAL_CLAIM_BATCH_55_AFTER_45", used);
        assertEq(bem.balanceOf(alice), 4500);
        assertEq(bem.balanceOf(bob), 5500);
        assertEq(bem.balanceOf(address(vault)), 3);
        assertEq(vault.totalPaid(), 10_000);
    }
}

contract GasBenchClaim100Test is GasBenchBase {
    function setUp() public override {
        super.setUp();
        contribute(alice, 1, 100, true);
        bem.mint(address(vault), 10_003);
        vault.syncRewards();
    }

    function testGasClaim100InOneCall() public {
        uint256[] memory all = ids(1, 100);
        _coolScenario();
        vm.prank(alice);
        uint256 before = gasleft();
        vault.claimBatch(all);
        uint256 used = before - gasleft();
        _record("GAS_LOCAL_CLAIM_BATCH_100", used);
        assertEq(bem.balanceOf(alice), 10_000);
        assertEq(vault.totalPaid(), 10_000);
        assertEq(bem.balanceOf(address(vault)), 3);
    }
}

contract GasBenchTransfer100Test is GasBenchBase {
    function setUp() public override {
        super.setUp();
        contribute(alice, 1, 100, true);
        bem.mint(address(vault), 10_003);
        mining.setPending(address(nft), TOKEN_ID, 7009);
    }

    function testGasTransfer100ToRedeemer() public {
        uint256[] memory all = ids(1, 100);
        uint256[] memory amounts = ones(100);
        _coolScenario();
        vm.prank(alice);
        uint256 before = gasleft();
        vault.safeBatchTransferFrom(alice, bob, all, amounts, "");
        uint256 used = before - gasleft();
        _record("GAS_LOCAL_TRANSFER_BATCH_100_TO_REDEEMER", used);
        assertEq(vault.holderOf(1), bob);
        assertEq(vault.holderOf(100), bob);
        assertEq(vault.balanceOf(alice, 1), 0);
        assertEq(vault.balanceOf(bob, 100), 1);
    }
}

contract GasBenchRedeem100Test is GasBenchBase {
    function setUp() public override {
        super.setUp();
        contribute(alice, 1, 100, true);
        bem.mint(address(vault), 10_003);
        mining.setPending(address(nft), TOKEN_ID, 7009);
        vm.prank(alice);
        vault.safeBatchTransferFrom(alice, bob, ids(1, 100), ones(100), "");
    }

    function testGasRedeem100WithPositiveHarvestAndDust() public {
        _coolScenario();
        vm.prank(bob);
        uint256 before = gasleft();
        vault.redeemMiner();
        uint256 used = before - gasleft();
        _record("GAS_LOCAL_REDEEM_100_POSITIVE_HARVEST_DUST", used);
        assertEq(nft.ownerOf(TOKEN_ID), bob);
        assertEq(bem.balanceOf(bob), 17_012);
        assertEq(vault.totalPaid(), 17_012);
        assertEq(vault.remainder(), 0);
        assertEq(vault.soldCount(), 0);
        assertEq(uint256(vault.state()), uint256(Types.State.REDEEMED));
        assertEq(vault.redeemedBeneficiary(), bob);
    }
}
