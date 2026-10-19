// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TestBase} from "../helpers/TestBase.sol";
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {GroupBuyVault} from "../../src/GroupBuyVault.sol";
import {Types} from "../../src/Types.sol";
import {MockBEM} from "../helpers/Mocks.sol";

contract AccountingHandler is Test {
    GroupBuyVault public vault;
    MockBEM public bem;
    address public a;
    address public b;
    uint256 public donated;
    bool public terminalSeen;

    constructor(GroupBuyVault v, MockBEM token, address aa, address bb) {
        vault = v;
        bem = token;
        a = aa;
        b = bb;
    }

    function one(uint256 id) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = id;
    }

    function join(uint256 seed, bool useB) external {
        if (vault.state() != Types.State.FUNDING) return;
        uint256 id = bound(seed, 1, 100);
        if (vault.holderOf(id) != address(0)) return;
        address who = useB ? b : a;
        uint256 price = vault.costOf(id);
        vm.prank(who);
        vault.contribute{value: price}(one(id), false, "");
    }

    function exit(uint256 seed) external {
        if (vault.state() != Types.State.FUNDING && vault.state() != Types.State.REFUNDABLE) return;
        uint256 id = bound(seed, 1, 100);
        address holder = vault.holderOf(id);
        if (holder == address(0)) return;
        vm.prank(holder);
        vault.withdraw(one(id), payable(holder));
    }

    function complete() external {
        if (vault.state() != Types.State.FUNDING) return;
        uint256[] memory all = vault.availableIds();
        uint256 value;
        for (uint256 i; i < all.length; i++) {
            value += vault.costOf(all[i]);
        }
        vm.prank(a);
        vault.contribute{value: value}(all, true, "");
    }

    function donate(uint96 seed) external {
        uint256 value = bound(seed, 0, 1e12);
        donated += value;
        bem.mint(address(vault), value);
    }

    function claim(uint256 seed) external {
        if (vault.state() != Types.State.ACTIVE) return;
        uint256 id = bound(seed, 1, 100);
        address holder = vault.holderOf(id);
        vm.prank(holder);
        vault.claim(id);
    }

    function move(uint256 seed) external {
        if (vault.state() != Types.State.ACTIVE) return;
        uint256 id = bound(seed, 1, 100);
        address holder = vault.holderOf(id);
        vm.prank(holder);
        vault.safeTransferFrom(holder, holder == a ? b : a, id, 1, "");
    }

    function consolidateAndRedeem(bool emergency) external {
        if (vault.state() != Types.State.ACTIVE) return;
        for (uint256 id = 1; id <= 100; id++) {
            if (vault.holderOf(id) == b) {
                vm.prank(b);
                vault.safeTransferFrom(b, a, id, 1, "");
            }
        }
        vm.prank(a);
        if (emergency) vault.redeemWithoutHarvest();
        else vault.redeemMiner();
        terminalSeen = true;
    }

    function residual() external {
        if (vault.state() != Types.State.REDEEMED) return;
        vm.prank(a);
        vault.claimResidual(a);
    }

    function expire() external {
        if (vault.state() != Types.State.FUNDING) return;
        vm.warp(vault.getTerms().deadline);
        vault.markRefundable();
        terminalSeen = true;
    }
}

contract AccountingInvariantTest is TestBase {
    AccountingHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new AccountingHandler(vault, bem, alice, bob);
        targetContract(address(handler));
    }

    function invariantPrincipalConservationAndSupplyBitmap() public view {
        uint256 total;
        uint256 count;
        uint256 bitmap;
        for (uint256 id = 1; id <= 100; id++) {
            address holder = vault.holderOf(id);
            uint256 supply = vault.totalSupply(id);
            assertLe(supply, 1);
            if (holder != address(0)) {
                count++;
                total += vault.costOf(id);
                bitmap |= 1 << (id - 1);
                assertEq(vault.balanceOf(holder, id), 1);
            }
            assertEq(vault.balanceOf(alice, id) + vault.balanceOf(bob, id), supply);
        }
        assertEq(vault.soldCount(), count);
        assertEq(vault.soldBitmap(), bitmap);
        Types.State state = vault.state();
        if (state == Types.State.ACTIVE) assertEq(count, 100);
        if (state == Types.State.REDEEMED) assertEq(count, 0);
        if (state == Types.State.FUNDING || state == Types.State.REFUNDABLE) {
            assertEq(vault.fundedWei(), total);
        }
        assertEq(
            vault.totalPrincipalIn(),
            vault.totalPrincipalRefunded() + vault.purchaseSpent() + vault.fundedWei()
        );
        assertGe(address(vault).balance, vault.fundedWei());
    }

    function invariantRewardsNeverOverpaidAndAssetsHaveRightOwner() public view {
        assertEq(bem.balanceOf(address(vault)) + vault.totalPaid(), handler.donated());
        assertLe(vault.totalPaid(), vault.totalAccounted());
        assertLe(vault.totalAccounted(), handler.donated());
        assertEq(bem.balanceOf(alice) + bem.balanceOf(bob), vault.totalPaid());
        Types.State state = vault.state();
        if (state == Types.State.ACTIVE) assertEq(nft.ownerOf(TOKEN_ID), address(vault));
        if (state == Types.State.REDEEMED) {
            assertEq(nft.ownerOf(TOKEN_ID), alice);
            assertEq(vault.redeemedBeneficiary(), alice);
        }
        if (handler.terminalSeen()) {
            assertTrue(state == Types.State.REFUNDABLE || state == Types.State.REDEEMED);
        }
    }
}

/// @notice Separate long-lived ACTIVE campaign; terminal no-ops cannot hide reward/transfer sequences.
contract ActiveAccountingInvariantTest is TestBase {
    AccountingHandler internal handler;

    function setUp() public override {
        super.setUp();
        activate();
        handler = new AccountingHandler(vault, bem, alice, bob);
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = AccountingHandler.donate.selector;
        selectors[1] = AccountingHandler.claim.selector;
        selectors[2] = AccountingHandler.move.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariantEveryIdDebtPlusDustPlusUnrecognizedEqualsBalance() public view {
        uint256 claimedSum;
        uint256 due;
        uint256 acc = vault.accPerShare();
        for (uint256 id = 1; id <= 100; id++) {
            assertEq(vault.totalSupply(id), 1);
            address holder = vault.holderOf(id);
            assertEq(vault.balanceOf(holder, id), 1);
            assertLe(vault.claimed(id), acc);
            claimedSum += vault.claimed(id);
            due += acc - vault.claimed(id);
        }
        uint256 balance = bem.balanceOf(address(vault));
        uint256 unrecognized = balance + vault.totalPaid() - vault.totalAccounted();
        assertEq(claimedSum, vault.totalPaid());
        assertEq(acc * 100 + vault.remainder(), vault.totalAccounted());
        assertEq(due + vault.remainder() + unrecognized, balance);
        assertEq(balance + vault.totalPaid(), handler.donated());
        assertEq(bem.balanceOf(alice) + bem.balanceOf(bob), vault.totalPaid());
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
    }
}
