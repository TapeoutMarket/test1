// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {TestBase} from "../helpers/TestBase.sol";
import {GroupBuyVault} from "../../src/GroupBuyVault.sol";
import {Types} from "../../src/Types.sol";
import {MarketLogic} from "../../src/markets/MarketLogic.sol";
import {ISeaportSubset} from "../../src/interfaces/IProtocols.sol";

interface RealSeaport is ISeaportSubset {
    function cancel(Types.OrderComponents[] calldata orders) external returns (bool);
    function validate(Types.Order[] calldata orders) external returns (bool);
    function incrementCounter() external returns (uint256);
}

/// @notice Real pinned Seaport 1.5 Solidity execution, local mock assets, NOT a BSC state fork.
contract RealSeaportTest is TestBase {
    RealSeaport internal seaport;
    Types.Order internal order;
    uint256 internal constant SELLER_KEY = 0x534541504F5254;
    address internal feeRecipient = address(0xFEE);

    function setUp() public override {
        super.setUp();
        address originalSeller = seller;
        seller = vm.addr(SELLER_KEY);
        vm.prank(originalSeller);
        nft.transferFrom(originalSeller, seller, TOKEN_ID);
        address controller = deployCode("fixtures/seaport/ConduitController.json");
        seaport = RealSeaport(deployCode("fixtures/seaport/Seaport.json", abi.encode(controller)));
        vm.prank(seller);
        nft.setApprovalForAll(address(seaport), true);
        (string memory version, bytes32 domain,) = seaport.information();
        config.marketKind = Types.MarketKind.SEAPORT;
        config.market = address(seaport);
        config.marketCodeHash = address(seaport).codehash;
        config.seaportDomainSeparator = domain;
        config.seaportVersionHash = keccak256(bytes(version));
        config.mockOnly = false;
        Types.OfferItem[] memory offers = new Types.OfferItem[](1);
        offers[0] = Types.OfferItem(Types.ItemType.ERC721, address(nft), TOKEN_ID, 1, 1);
        Types.ConsiderationItem[] memory considerations = new Types.ConsiderationItem[](2);
        considerations[0] =
            Types.ConsiderationItem(Types.ItemType.NATIVE, address(0), 0, 1 ether, 1 ether, payable(seller));
        considerations[1] = Types.ConsiderationItem(
            Types.ItemType.NATIVE, address(0), 0, 0.01 ether, 0.01 ether, payable(feeRecipient)
        );
        order.parameters = Types.OrderParameters(
            seller,
            address(0),
            offers,
            considerations,
            Types.OrderType.FULL_OPEN,
            block.timestamp - 1,
            block.timestamp + 2 days,
            0,
            12345,
            0,
            2
        );
        terms.seller = seller;
        terms.totalPrice = 1.01 ether;
        terms.listingId = 0;
        terms.listingPrice = 0;
        terms.orderStart = uint64(order.parameters.startTime);
        terms.orderEnd = uint64(order.parameters.endTime);
        terms.counter = 0;
        _sign();
        vm.startPrank(address(timelock));
        configHash = factory.approveConfig(config);
        factory.selectConfiguration(address(template), configHash);
        vm.stopPrank();
        vault = _create(2);
    }

    function _components() internal view returns (Types.OrderComponents memory) {
        Types.OrderParameters memory p = order.parameters;
        return Types.OrderComponents(
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
            terms.counter
        );
    }

    function _sign() internal {
        terms.orderHash = ISeaportSubset(address(seaport)).getOrderHash(_components());
        bytes32 digest =
            keccak256(abi.encodePacked(bytes2(0x1901), config.seaportDomainSeparator, terms.orderHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SELLER_KEY, digest);
        order.signature = abi.encodePacked(r, s, v);
        payload = abi.encode(order);
        terms.executionHash = keccak256(payload);
    }

    function _create(uint256 round) internal returns (GroupBuyVault) {
        return
            GroupBuyVault(payable(factory.createPool(address(template), configHash, terms, payload, round)));
    }

    function testRealSignatureCreateContributeFulfillAndRevenue() public {
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.EXECUTABLE));
        (,, uint256 filled, uint256 size) = seaport.getOrderStatus(terms.orderHash);
        assertEq(filled, 0);
        assertEq(size, 0);
        activate();
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
        assertEq(seller.balance, 1 ether);
        assertEq(feeRecipient.balance, 0.01 ether);
        (,, filled, size) = seaport.getOrderStatus(terms.orderHash);
        assertGt(size, 0);
        assertEq(filled, size);
        mining.setPending(address(nft), TOKEN_ID, 10001);
        vm.prank(alice);
        vault.harvestAndClaim(ids(1, 45));
        vm.prank(bob);
        vault.claimBatch(ids(46, 100));
        assertEq(bem.balanceOf(alice), 4500);
        assertEq(bem.balanceOf(bob), 5500);
        consolidate();
        vm.prank(alice);
        vault.redeemMiner();
        assertEq(nft.ownerOf(TOKEN_ID), alice);
    }

    function testRealCancelOpensOriginalRefundOnly() public {
        contribute(alice, 1, 45, false);
        Types.OrderComponents[] memory cs = new Types.OrderComponents[](1);
        cs[0] = _components();
        vm.prank(seller);
        seaport.cancel(cs);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.CANCELLED));
        vault.markRefundable();
        vm.prank(alice);
        vault.withdraw(ids(1, 45), payable(alice));
        assertEq(vault.fundedWei(), 0);
    }

    function testRealCounterInvalidation() public {
        vm.prank(seller);
        seaport.incrementCounter();
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.COUNTER_CHANGED));
        vault.markRefundable();
    }

    function testRealApprovalRevokedAndRestoredIsNotPermanentCancellation() public {
        vm.prank(seller);
        nft.setApprovalForAll(address(seaport), false);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.APPROVAL_MISSING));
        vm.expectRevert();
        vault.markRefundable();
        vm.prank(seller);
        nft.approve(address(seaport), TOKEN_ID);
        activate();
        assertEq(nft.ownerOf(TOKEN_ID), address(vault));
    }

    function testRealOrderBoughtElsewhereBeforeFinalContributionRollsBackLastAndKeepsExits() public {
        contribute(alice, 1, 45, false);
        Types.Order memory real = abi.decode(payload, (Types.Order));
        vm.prank(carol);
        seaport.fulfillOrder{value: terms.totalPrice}(real, 0);
        uint256 amount = cost(ids(46, 100));
        vm.prank(bob);
        vm.expectRevert();
        vault.contribute{value: amount}(ids(46, 100), true, payload);
        assertEq(vault.soldCount(), 45);
        assertEq(vault.holderOf(46), address(0));
        assertEq(nft.ownerOf(TOKEN_ID), carol);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.FILLED));
        vm.prank(alice);
        vault.withdraw(ids(1, 45), payable(alice));
    }

    function testRealNotStartedDeadlineAndSafetyMargin() public {
        order.parameters.startTime = block.timestamp + 100;
        terms.orderStart = uint64(order.parameters.startTime);
        _sign();
        vault = _create(3);
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.NOT_STARTED));
        vm.prank(alice);
        vm.expectRevert();
        vault.contribute(ids(1, 1), false, payload);
        vm.warp(terms.deadline);
        vault.markRefundable();
        assertEq(uint256(vault.state()), uint256(Types.State.REFUNDABLE));
    }

    function testWrongSignatureAndWrongDomainRejected() public {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SELLER_KEY, keccak256("WRONG_CHAIN_OR_DOMAIN"));
        order.signature = abi.encodePacked(r, s, v);
        payload = abi.encode(order);
        terms.executionHash = keccak256(payload);
        vm.expectRevert(MarketLogic.InvalidSignature.selector);
        _create(4);
    }

    function testRealTipsAndExecutionPayloadTamperingRejected() public {
        bytes memory original = payload;
        Types.ConsiderationItem[] memory tips = new Types.ConsiderationItem[](3);
        tips[0] = order.parameters.consideration[0];
        tips[1] = order.parameters.consideration[1];
        tips[2] = Types.ConsiderationItem(Types.ItemType.NATIVE, address(0), 0, 1, 1, payable(carol));
        order.parameters.consideration = tips;
        payload = abi.encode(order);
        terms.executionHash = keccak256(payload);
        vm.expectRevert(MarketLogic.UnsupportedOrder.selector);
        _create(5);
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.InvalidTerms.selector);
        vault.contribute(ids(1, 1), false, payload);
        assertEq(vault.purchasePayload(), original);
        vm.expectRevert();
        vault.markRefundable();
        assertEq(uint256(vault.state()), uint256(Types.State.FUNDING));
    }

    function testRealValidatedOrderAllowsEmptySignatureButDoesNotSkipCounter() public {
        Types.Order[] memory os = new Types.Order[](1);
        os[0] = abi.decode(payload, (Types.Order));
        seaport.validate(os);
        order.signature = "";
        payload = abi.encode(order);
        terms.executionHash = keccak256(payload);
        vault = _create(6);
        vm.prank(seller);
        seaport.incrementCounter();
        assertEq(uint256(vault.marketStatus()), uint256(Types.MarketStatus.COUNTER_CHANGED));
    }

    function testWrongConduitCriteriaAndTokenTermsFailClosed() public {
        order.parameters.conduitKey = bytes32(uint256(1));
        _sign();
        vm.expectRevert(MarketLogic.UnsupportedOrder.selector);
        _create(7);
        order.parameters.conduitKey = 0;
        order.parameters.offer[0].itemType = Types.ItemType.ERC721_WITH_CRITERIA;
        _sign();
        vm.expectRevert(MarketLogic.UnsupportedOrder.selector);
        _create(8);
    }
}
