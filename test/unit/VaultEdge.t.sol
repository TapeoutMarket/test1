// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TestBase} from "../helpers/TestBase.sol";
import {GroupBuyVault} from "../../src/GroupBuyVault.sol";
import {Types} from "../../src/Types.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract EdgeReceiver is IERC1155Receiver, IERC721Receiver {
    GroupBuyVault public target;
    bool public rejectBNB;
    bool public rejectNFT;
    bool public inspectReentry;
    uint256 public blocked;
    uint256 public checked;

    constructor(GroupBuyVault target_) {
        target = target_;
    }

    function setTarget(GroupBuyVault target_) external {
        target = target_;
    }

    function approveNFT(address nft, address operator) external {
        IERC721(nft).setApprovalForAll(operator, true);
    }

    function setModes(bool bnb, bool nft, bool reentry) external {
        rejectBNB = bnb;
        rejectNFT = nft;
        inspectReentry = reentry;
    }

    function join(uint256[] calldata ids, bool complete, bytes calldata payload) external payable {
        target.contribute{value: msg.value}(ids, complete, payload);
    }

    function exit(uint256[] calldata ids, address payable recipient) external {
        target.withdraw(ids, recipient);
    }

    function redeem() external {
        target.redeemMiner();
    }

    function runChecks() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory values = new uint256[](1);
        values[0] = 1;
        _try(abi.encodeCall(target.contribute, (ids, false, bytes(""))));
        _try(abi.encodeCall(target.withdraw, (ids, payable(address(this)))));
        _try(abi.encodeCall(target.factoryCancelFunding, (uint8(1))));
        _try(abi.encodeCall(target.markRefundable, ()));
        _try(abi.encodeCall(target.syncRewards, ()));
        _try(abi.encodeCall(target.harvest, ()));
        _try(abi.encodeCall(target.claim, (uint256(1))));
        _try(abi.encodeCall(target.claimBatch, (ids)));
        _try(abi.encodeCall(target.harvestAndClaim, (ids)));
        _try(abi.encodeCall(target.redeemMiner, ()));
        _try(abi.encodeCall(target.redeemWithoutHarvest, ()));
        _try(abi.encodeCall(target.claimResidual, (address(this))));
        _try(abi.encodeCall(target.safeTransferFrom, (address(this), address(99), 1, 1, bytes(""))));
        _try(
            abi.encodeCall(target.safeBatchTransferFrom, (address(this), address(99), ids, values, bytes("")))
        );
    }

    function _try(bytes memory data) internal {
        checked++;
        (bool ok, bytes memory reason) = address(target).call(data);
        if (
            !ok && reason.length >= 4
                && bytes4(reason) == ReentrancyGuardUpgradeable.ReentrancyGuardReentrantCall.selector
        ) blocked++;
    }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == type(IERC1155Receiver).interfaceId || iid == 0x01ffc9a7;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        if (inspectReentry) runChecks();
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        returns (bytes4)
    {
        if (inspectReentry) runChecks();
        return this.onERC1155BatchReceived.selector;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        require(!rejectNFT, "NFT_REJECTED");
        if (inspectReentry) runChecks();
        return this.onERC721Received.selector;
    }

    receive() external payable {
        require(!rejectBNB, "BNB_REJECTED");
        if (inspectReentry) runChecks();
    }
}

contract EdgeHookBEM is ERC20 {
    EdgeReceiver public probe;
    constructor() ERC20("Hook BEM", "BEM") {}

    function mint(address who, uint256 amount) external {
        _mint(who, amount);
    }

    function setProbe(EdgeReceiver who) external {
        probe = who;
    }

    function transfer(address who, uint256 amount) public override returns (bool) {
        if (address(probe) != address(0)) probe.runChecks();
        return super.transfer(who, amount);
    }
}

/// @dev Signature/status classification model only; never used as proof of Seaport fulfillment.
contract EdgeSignatureSeller {
    bool public enabled = true;

    function revoke() external {
        enabled = false;
    }

    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        return enabled ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    function approveNFT(address token, address operator) external {
        IERC721(token).setApprovalForAll(operator, true);
    }
}

contract EdgeSeaportStatusModel {
    bool public cancelled;
    uint256 public counter;

    function information() external view returns (string memory, bytes32, address) {
        return (
            "1.5",
            keccak256(
                abi.encode(
                    keccak256(
                        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                    ),
                    keccak256("Seaport"),
                    keccak256("1.5"),
                    block.chainid,
                    address(this)
                )
            ),
            address(0)
        );
    }

    function getOrderHash(Types.OrderComponents calldata c) external pure returns (bytes32) {
        return keccak256(abi.encode(c));
    }

    function getOrderStatus(bytes32) external view returns (bool, bool, uint256, uint256) {
        return (false, cancelled, 0, 0);
    }

    function getCounter(address) external view returns (uint256) {
        return counter;
    }

    function setStatus(bool cancelled_, uint256 counter_) external {
        cancelled = cancelled_;
        counter = counter_;
    }
}

contract VaultEdgeTest is TestBase {
    function statusPool() internal returns (EdgeSignatureSeller offerer, EdgeSeaportStatusModel model) {
        offerer = new EdgeSignatureSeller();
        model = new EdgeSeaportStatusModel();
        vm.prank(seller);
        nft.transferFrom(seller, address(offerer), TOKEN_ID);
        offerer.approveNFT(address(nft), address(model));
        Types.OfferItem[] memory offer = new Types.OfferItem[](1);
        offer[0] = Types.OfferItem(Types.ItemType.ERC721, address(nft), TOKEN_ID, 1, 1);
        Types.ConsiderationItem[] memory consideration = new Types.ConsiderationItem[](2);
        consideration[0] = Types.ConsiderationItem(
            Types.ItemType.NATIVE, address(0), 0, 10000, 10000, payable(address(offerer))
        );
        consideration[1] =
            Types.ConsiderationItem(Types.ItemType.NATIVE, address(0), 0, 100, 100, payable(carol));
        Types.OrderParameters memory p = Types.OrderParameters(
            address(offerer),
            address(0),
            offer,
            consideration,
            Types.OrderType.FULL_OPEN,
            block.timestamp - 1,
            block.timestamp + 2 days,
            0,
            17,
            0,
            2
        );
        payload = abi.encode(Types.Order(p, hex"aabb"));
        config.marketKind = Types.MarketKind.SEAPORT;
        config.market = address(model);
        config.marketCodeHash = address(model).codehash;
        (, config.seaportDomainSeparator,) = model.information();
        config.seaportVersionHash = keccak256("1.5");
        terms.seller = address(offerer);
        terms.totalPrice = 10100;
        terms.orderStart = uint64(p.startTime);
        terms.orderEnd = uint64(p.endTime);
        terms.executionHash = keccak256(payload);
        terms.orderHash = model.getOrderHash(
            Types.OrderComponents(
                p.offerer,
                p.zone,
                p.offer,
                p.consideration,
                p.orderType,
                p.startTime,
                p.endTime,
                p.zoneHash,
                p.salt,
                p.conduitKey,
                0
            )
        );
        vm.startPrank(address(timelock));
        bytes32 hash = factory.approveConfig(config);
        factory.selectConfiguration(address(template), hash);
        vm.stopPrank();
        vault = GroupBuyVault(payable(factory.createPool(address(template), hash, terms, payload, 12)));
    }

    function testBoundCancellationStillVisibleAfterERC1271SignatureRevocation() public {
        (EdgeSignatureSeller offerer, EdgeSeaportStatusModel model) = statusPool();
        contribute(alice, 1, 1, false);
        offerer.revoke();
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.UNKNOWN));
        vm.expectRevert();
        vault.markRefundable();
        model.setStatus(true, 0);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.CANCELLED));
        vault.markRefundable();
        assertEq(uint256(vault.state()), uint256(Types.State.REFUNDABLE));
        vm.prank(alice);
        vault.withdraw(ids(1, 1), payable(alice));
        assertEq(vault.fundedWei(), 0);
    }

    function testBoundCounterInvalidationStillVisibleAfterERC1271Revocation() public {
        (EdgeSignatureSeller offerer, EdgeSeaportStatusModel model) = statusPool();
        offerer.revoke();
        model.setStatus(false, 1);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.COUNTER_CHANGED));
        vault.markRefundable();
        assertEq(uint256(vault.state()), uint256(Types.State.REFUNDABLE));
    }

    function testFundingCallbackCrossEntryGuard() public {
        EdgeReceiver receiver = new EdgeReceiver(vault);
        receiver.setModes(false, false, true);
        uint256[] memory shares = ids(1, 45);
        uint256 value = cost(shares);
        vm.deal(address(this), value);
        receiver.join{value: value}(shares, false, payload);
        assertEq(receiver.checked(), 14);
        assertEq(receiver.blocked(), 14);
        assertEq(vault.holderOf(1), address(receiver));
        assertEq(uint256(vault.state()), uint256(Types.State.FUNDING));
    }

    function testBNBRefundCallbackGuardAndFailureRollbackIsolation() public {
        EdgeReceiver receiver = new EdgeReceiver(vault);
        uint256[] memory shares = ids(1, 10);
        uint256 value = cost(shares);
        vm.deal(address(this), value);
        receiver.join{value: value}(shares, false, payload);
        contribute(bob, 11, 20, false);
        receiver.setModes(true, false, false);
        vm.expectRevert(GroupBuyVault.NativePaymentFailed.selector);
        receiver.exit(shares, payable(address(receiver)));
        assertEq(vault.holderOf(1), address(receiver));
        assertEq(vault.soldCount(), 20);
        uint256 bobRefund = cost(ids(11, 20));
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        vault.withdraw(ids(11, 20), payable(bob));
        assertEq(bob.balance - bobBefore, bobRefund);
        receiver.setModes(false, false, true);
        receiver.exit(shares, payable(address(receiver)));
        assertEq(receiver.blocked(), 14);
        assertEq(receiver.checked(), 14);
        assertEq(vault.soldCount(), 0);
    }

    function testActiveSingleAndBatchCallbacksShareGuard() public {
        activate();
        EdgeReceiver receiver = new EdgeReceiver(vault);
        receiver.setModes(false, false, true);
        vm.prank(alice);
        vault.safeTransferFrom(alice, address(receiver), 1, 1, "");
        vm.prank(alice);
        vault.safeBatchTransferFrom(alice, address(receiver), ids(2, 10), ones(9), "");
        assertEq(receiver.blocked(), 28);
        assertEq(receiver.checked(), 28);
        assertEq(vault.holderOf(1), address(receiver));
    }

    function testNFTRecipientCallbackGuardAndRejectionRollsBackClosure() public {
        activate();
        consolidate();
        EdgeReceiver receiver = new EdgeReceiver(vault);
        vm.prank(alice);
        vault.safeBatchTransferFrom(alice, address(receiver), ids(1, 100), ones(100), "");
        receiver.setModes(false, true, false);
        vm.expectRevert();
        receiver.redeem();
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
        assertEq(vault.soldCount(), 100);
        assertEq(vault.redeemedBeneficiary(), address(0));
        receiver.setModes(false, false, true);
        receiver.redeem();
        assertEq(receiver.blocked(), 14);
        assertEq(receiver.checked(), 14);
        assertEq(nft.ownerOf(TOKEN_ID), address(receiver));
    }

    function testBEMPaymentCallbackCrossEntryGuard() public {
        EdgeHookBEM token = new EdgeHookBEM();
        config.bem = address(token);
        vm.startPrank(address(timelock));
        bytes32 hash = factory.approveConfig(config);
        factory.selectConfiguration(address(template), hash);
        vm.stopPrank();
        vault = GroupBuyVault(payable(factory.createPool(address(template), hash, terms, payload, 2)));
        activate();
        EdgeReceiver probe = new EdgeReceiver(vault);
        token.setProbe(probe);
        token.mint(address(vault), 10000);
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        assertEq(probe.checked(), 14);
        assertEq(probe.blocked(), 14);
        assertEq(token.balanceOf(alice), 4500);
    }

    function testMarketSellerPaymentCallbackWhilePurchasingSharesGuard() public {
        EdgeReceiver receiver = new EdgeReceiver(vault);
        vm.prank(seller);
        nft.transferFrom(seller, address(receiver), TOKEN_ID);
        receiver.approveNFT(address(nft), address(market));
        terms.seller = address(receiver);
        market.list(1, address(receiver), address(nft), TOKEN_ID, uint96(PRICE), 100);
        vault = GroupBuyVault(payable(factory.createPool(address(template), configHash, terms, payload, 2)));
        receiver.setTarget(vault);
        receiver.setModes(false, false, true);
        activate();
        assertEq(receiver.checked(), 14);
        assertEq(receiver.blocked(), 14);
        assertEq(address(receiver).balance, PRICE);
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
        assertEq(uint256(vault.state()), uint256(Types.State.ACTIVE));
    }

    function testLateBEMAfterNormalRedemptionBelongsOnlyToFixedBeneficiary() public {
        activate();
        consolidate();
        bem.mint(address(vault), 101);
        vm.prank(alice);
        vault.redeemMiner();
        assertEq(bem.balanceOf(alice), 101);
        uint256 accounted = vault.totalAccounted();
        bem.mint(address(vault), 37);
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.Unauthorized.selector);
        vault.claimResidual(bob);
        vm.prank(alice);
        vault.claimResidual(alice);
        assertEq(bem.balanceOf(alice), 138);
        assertEq(vault.totalAccounted(), accounted + 37);
        assertEq(vault.totalPaid(), 138);
        assertEq(vault.remainder(), 0);
        assertEq(vault.claimed(1), 1);
    }

    function testBadMarketplacePostconditionRollsBackLastContribution() public {
        contribute(alice, 1, 45, false);
        uint256 prior = vault.fundedWei();
        uint256 balance = bob.balance;
        for (uint8 mode = 1; mode <= 3; mode++) {
            market.setFaults(false, mode, false);
            uint256[] memory shares = ids(46, 100);
            uint256 value = cost(shares);
            vm.prank(bob);
            vm.expectRevert();
            vault.contribute{value: value}(shares, true, payload);
            assertEq(vault.fundedWei(), prior);
            assertEq(vault.soldCount(), 45);
            assertEq(bob.balance, balance);
            assertEq(nft.ownerOf(TOKEN_ID), seller);
            assertEq(vault.holderOf(46), address(0));
            assertEq(vault.purchaseSpent(), 0);
        }
        market.setFaults(false, 0, true);
        contribute(bob, 46, 100, true);
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
    }

    function testUnsolicitedTargetNFTAndWrongCallbacksCannotActivateOrSpend() public {
        vm.expectRevert(GroupBuyVault.UnexpectedNFT.selector);
        vault.onERC721Received(address(market), seller, TOKEN_ID, "");
        vm.prank(address(nft));
        vm.expectRevert(GroupBuyVault.UnexpectedNFT.selector);
        vault.onERC721Received(address(market), seller, TOKEN_ID, "");
        vm.prank(seller);
        nft.transferFrom(seller, address(vault), TOKEN_ID);
        assertEq(uint256(vault.state()), uint256(Types.State.FUNDING));
        assertEq(vault.purchaseSpent(), 0);
        uint256[] memory shares = ids(1, 100);
        uint256 value = cost(shares);
        vm.prank(alice);
        vm.expectRevert();
        vault.contribute{value: value}(shares, true, payload);
        assertEq(vault.soldCount(), 0);
        assertEq(vault.purchaseSpent(), 0);
    }

    function testApprovalRevocationIsTemporaryAndUnknownReadCannotTerminate() public {
        contribute(alice, 1, 45, false);
        vm.prank(seller);
        nft.setApprovalForAll(address(market), false);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.APPROVAL_MISSING));
        vm.expectRevert();
        vault.markRefundable();
        vm.prank(seller);
        nft.approve(address(market), TOKEN_ID);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.EXECUTABLE));
        market.setFaults(true, 0, false);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.UNKNOWN));
        vm.expectRevert();
        vault.markRefundable();
        vm.prank(alice);
        vault.withdraw(ids(1, 45), payable(alice));
        assertEq(vault.soldCount(), 0);
        vm.warp(terms.deadline);
        vault.markRefundable();
        assertEq(uint256(vault.state()), uint256(Types.State.REFUNDABLE));
    }

    function testPriceUpAndDownAndNewListingNeverRetargetOrder() public {
        market.setPrice(1, uint96(PRICE + 1));
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.PRICE_CHANGED));
        market.setPrice(1, uint96(PRICE - 1));
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.PRICE_CHANGED));
        market.setPrice(1, uint96(PRICE));
        market.list(2, seller, address(nft), TOKEN_ID, uint96(PRICE), 100);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.LISTING_ENDED));
        vault.markRefundable();
        market.list(1, seller, address(nft), TOKEN_ID, uint96(PRICE), 100);
        uint256[] memory shares = ids(1, 1);
        uint256 value = cost(shares);
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.contribute{value: value}(shares, false, payload);
    }

    function testTaxTokenAndBalanceDecreaseNeverRewriteOrOverpayHistory() public {
        activate();
        bem.mint(address(vault), 10000);
        vault.syncRewards();
        bem.setFaults(false, false, true);
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.RewardBalanceDecreased.selector);
        vault.claim(1);
        assertEq(vault.claimed(1), 0);
        assertEq(vault.totalPaid(), 0);
        assertEq(bem.balanceOf(alice), 0);
        bem.setFaults(false, false, false);
        bem.burn(address(vault), 1);
        vm.expectRevert(GroupBuyVault.RewardBalanceDecreased.selector);
        vault.syncRewards();
        assertEq(vault.totalAccounted(), 10000);
        assertEq(vault.accPerShare(), 100);
    }

    function testWithoutHarvestSkipsBothBrokenBalanceAndMiningThenResidualBeneficiaryOnly() public {
        activate();
        consolidate();
        bem.mint(address(vault), 10057);
        vault.syncRewards();
        bem.setFaults(true, true, false);
        mining.setBroken(true);
        vm.prank(alice);
        vault.redeemWithoutHarvest();
        assertEq(nft.ownerOf(TOKEN_ID), alice);
        assertEq(vault.redeemedBeneficiary(), alice);
        assertEq(vault.totalPaid(), 0);
        assertEq(vault.totalAccounted(), 10057);
        bem.setFaults(false, false, false);
        vm.prank(bob);
        vm.expectRevert(GroupBuyVault.Unauthorized.selector);
        vault.claimResidual(bob);
        vm.prank(alice);
        vault.claimResidual(carol);
        assertEq(bem.balanceOf(carol), 10057);
        assertEq(vault.totalPaid(), 10057);
        vm.prank(alice);
        vault.claimResidual(carol);
        assertEq(bem.balanceOf(carol), 10057);
        bem.mint(address(vault), 99);
        vm.prank(alice);
        vault.claimResidual(alice);
        assertEq(bem.balanceOf(alice), 99);
        assertEq(vault.totalAccounted(), 10156);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.harvest();
    }

    function testZeroSelfAndDuplicateTransfersKeepHolderIndexConsistent() public {
        activate();
        vm.prank(alice);
        vault.safeTransferFrom(alice, bob, 1, 0, "");
        assertEq(vault.holderOf(1), alice);
        vm.prank(alice);
        vault.safeTransferFrom(alice, alice, 1, 1, "");
        assertEq(vault.holderOf(1), alice);
        assertEq(vault.balanceOf(alice, 1), 1);
        uint256[] memory duplicate = new uint256[](2);
        duplicate[0] = 1;
        duplicate[1] = 1;
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.InvalidIds.selector);
        vault.safeBatchTransferFrom(alice, bob, duplicate, ones(2), "");
        assertEq(vault.holderOf(1), alice);
        assertEq(vault.totalSupply(1), 1);
    }
}
