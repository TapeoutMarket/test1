// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {FactoryV2, FactoryMaliciousV2} from "../helpers/FactoryVersions.sol";
import {GroupBuyFactory} from "../../src/GroupBuyFactory.sol";
import {GroupBuyVault} from "../../src/GroupBuyVault.sol";
import {Types} from "../../src/Types.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract FactoryClonesTest is TestBase {
    uint256 private operation;

    function _govern(bytes memory data) internal {
        bytes32 salt = bytes32(++operation);
        timelock.schedule(address(factory), 0, data, bytes32(0), salt, 1);
        vm.warp(block.timestamp + 1);
        timelock.execute(address(factory), 0, data, bytes32(0), salt);
    }

    function testStandardCloneRuntimeAndAtomicInitialization() public {
        bytes memory expected = abi.encodePacked(
            hex"363d3d373d3d3d363d73", address(template), hex"5af43d82803e903d91602b57fd5bf3"
        );
        assertEq(address(vault).code, expected);
        assertEq(address(vault).code.length, 45);
        assertEq(vault.factory(), address(factory));
        assertEq(vault.creator(), address(this));
        assertEq(vault.implementationSelf(), address(template));
        assertTrue(template.templateInitializersDisabled());
        assertFalse(vault.templateInitializersDisabled());
        assertEq(vault.configHash(), configHash);
        assertEq(vault.termsHash(), keccak256(abi.encode(terms)));
        assertEq(vault.soldCount(), 0);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        vault.initialize(address(factory), alice, config, terms, payload);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        template.initialize(address(factory), alice, config, terms, payload);
    }

    function testInitializationFailureRollsBackCloneRegistrationAndSalt() public {
        address predicted =
            factory.predictPool(address(this), address(template), configHash, terms, payload, 2);
        uint256 count = factory.poolCount();
        market.setFaults(true, 0, false);
        vm.expectRevert(bytes("READ_FAILED"));
        factory.createPool(address(template), configHash, terms, payload, 2);
        assertEq(predicted.code.length, 0);
        assertEq(factory.poolCount(), count);
        assertFalse(factory.isPool(predicted));
        market.setFaults(false, 0, false);
        address created = factory.createPool(address(template), configHash, terms, payload, 2);
        assertEq(created, predicted);
        assertEq(factory.poolCount(), count + 1);
    }

    function testPredictionBindsCallerTermsPayloadTemplateConfigurationAndRound() public {
        address predicted = factory.predictPool(alice, address(template), configHash, terms, payload, 11);
        assertTrue(predicted != factory.predictPool(bob, address(template), configHash, terms, payload, 11));
        assertTrue(predicted != factory.predictPool(alice, address(template), configHash, terms, payload, 12));
        assertTrue(predicted != factory.predictPool(alice, address(template), configHash, terms, hex"01", 11));
        assertTrue(predicted != factory.predictPool(alice, address(0x1234), configHash, terms, payload, 11));
        assertTrue(
            predicted
                != factory.predictPool(alice, address(template), bytes32(uint256(99)), terms, payload, 11)
        );
        Types.Terms memory changed = terms;
        changed.name = "different-description";
        assertTrue(
            predicted != factory.predictPool(alice, address(template), configHash, changed, payload, 11)
        );
        vm.prank(bob);
        address frontRunner = factory.createPool(address(template), configHash, terms, payload, 11);
        assertTrue(frontRunner != predicted);
        vm.prank(alice);
        address created = factory.createPool(address(template), configHash, terms, payload, 11);
        assertEq(created, predicted);
        vm.prank(alice);
        vm.expectRevert(GroupBuyFactory.PoolAlreadyExists.selector);
        factory.createPool(address(template), configHash, terms, payload, 11);
        vm.prank(alice);
        assertTrue(factory.createPool(address(template), configHash, terms, payload, 12) != created);
    }

    function testExpectedTemplateAndConfigurationPreventQueuedSubstitution() public {
        GroupBuyVault next = new GroupBuyVault();
        _govern(abi.encodeCall(GroupBuyFactory.approveTemplate, (address(next), 1, address(next).codehash)));
        _govern(abi.encodeCall(GroupBuyFactory.selectConfiguration, (address(next), configHash)));
        vm.expectRevert(GroupBuyFactory.ConfigurationChanged.selector);
        factory.createPool(address(template), configHash, terms, payload, 20);
        assertEq(vault.implementationSelf(), address(template));
        Types.Config memory changed = config;
        changed.safetyMargin = 61;
        bytes32 changedHash = keccak256(abi.encode(changed));
        _govern(abi.encodeCall(GroupBuyFactory.approveConfig, (changed)));
        _govern(abi.encodeCall(GroupBuyFactory.selectConfiguration, (address(next), changedHash)));
        vm.expectRevert(GroupBuyFactory.ConfigurationChanged.selector);
        factory.createPool(address(next), configHash, terms, payload, 20);
        address fresh = factory.createPool(address(next), changedHash, terms, payload, 20);
        assertEq(GroupBuyVault(payable(fresh)).configHash(), changedHash);
        assertEq(vault.configHash(), configHash);
    }

    function testInvalidLiveOfficialAndWrongCodeConfigurationRejected() public {
        Types.Config memory changed = config;
        changed.marketKind = Types.MarketKind.CIRCUIT_RESERVED;
        _expectConfigRejected(changed);
        changed = config;
        changed.mockOnly = false;
        _expectConfigRejected(changed);
        changed = config;
        changed.chainId = 31337;
        _expectConfigRejected(changed);
        changed = config;
        changed.marketCodeHash = bytes32(uint256(1));
        _expectConfigRejected(changed);
        changed = config;
        changed.collection = address(0);
        _expectConfigRejected(changed);
    }

    function _expectConfigRejected(Types.Config memory changed) private {
        bytes memory data = abi.encodeCall(GroupBuyFactory.approveConfig, (changed));
        bytes32 salt = bytes32(++operation);
        timelock.schedule(address(factory), 0, data, bytes32(0), salt, 1);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(GroupBuyFactory.InvalidConfiguration.selector);
        timelock.execute(address(factory), 0, data, bytes32(0), salt);
    }

    function testGuardianCancelOnlyFundingAndRefundBeneficiaryIsHolder() public {
        contribute(alice, 1, 45, false);
        uint256 principal = vault.fundedWei();
        vm.prank(alice);
        vm.expectRevert(GroupBuyFactory.Unauthorized.selector);
        factory.guardianCancel(address(vault), 1);
        vm.prank(guardian);
        factory.guardianCancel(address(vault), 7);
        assertEq(uint256(vault.state()), uint256(Types.State.REFUNDABLE));
        assertEq(vault.terminationReason(), 7);
        assertEq(address(vault).balance, principal);
        assertEq(vault.fundedWei(), principal);
        vm.prank(guardian);
        vm.expectRevert(GroupBuyVault.NotHolder.selector);
        vault.withdraw(ids(1, 45), payable(guardian));
        uint256 before = alice.balance;
        vm.prank(alice);
        vault.withdraw(ids(1, 45), payable(alice));
        assertEq(alice.balance - before, principal);
        assertEq(vault.totalPrincipalRefunded(), principal);
        vm.prank(alice);
        vm.expectRevert(GroupBuyVault.InvalidState.selector);
        vault.contribute{value: principal}(ids(1, 45), false, payload);
    }

    function testPaginationAndBoundedBatchCancellation() public {
        address second = factory.createPool(address(template), configHash, terms, payload, 2);
        address third = factory.createPool(address(template), configHash, terms, payload, 3);
        address[] memory page = factory.getPools(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0], address(vault));
        assertEq(page[1], second);
        page = factory.getPools(2, 100);
        assertEq(page.length, 1);
        assertEq(page[0], third);
        page = factory.getPools(3, 1);
        assertEq(page.length, 0);
        address[] memory batch = new address[](2);
        batch[0] = second;
        batch[1] = third;
        vm.prank(guardian);
        factory.guardianCancelBatch(batch, 42);
        assertEq(uint256(GroupBuyVault(payable(second)).state()), uint256(Types.State.REFUNDABLE));
        assertEq(uint256(GroupBuyVault(payable(third)).state()), uint256(Types.State.REFUNDABLE));
        assertEq(uint256(vault.state()), uint256(Types.State.FUNDING));
    }

    function testHonestV2UpgradePreservesPoolIndexParametersAndRewardLedger() public {
        activate();
        bem.mint(address(vault), 1003);
        vault.syncRewards();
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        bytes32 cloneHash = address(vault).codehash;
        bytes32 termsHash = vault.termsHash();
        FactoryV2 next = new FactoryV2();
        _govern(abi.encodeCall(factory.upgradeToAndCall, (address(next), "")));
        assertEq(FactoryV2(address(factory)).version(), 2);
        assertEq(factory.poolCount(), 1);
        assertTrue(factory.isPool(address(vault)));
        assertEq(factory.selectedTemplate(), address(template));
        assertEq(factory.selectedConfigHash(), configHash);
        assertEq(address(vault).codehash, cloneHash);
        assertEq(vault.termsHash(), termsHash);
        assertEq(vault.accPerShare(), 10);
        assertEq(vault.claimed(1), 10);
        assertEq(vault.claimed(46), 0);
        assertEq(vault.totalAccounted(), 1003);
        assertEq(vault.totalPaid(), 450);
        assertEq(vault.remainder(), 3);
        vm.prank(bob);
        vault.claimBatch(ids(46, 100));
        assertEq(bem.balanceOf(bob), 550);
    }

    function testMaliciousV2CanOnlyMakeFundingRefundableNotStealOrFreezeRefunds() public {
        contribute(alice, 1, 45, false);
        uint256 principal = vault.fundedWei();
        FactoryMaliciousV2 evil = new FactoryMaliciousV2();
        _govern(abi.encodeCall(factory.upgradeToAndCall, (address(evil), "")));
        FactoryMaliciousV2 proxy = FactoryMaliciousV2(address(factory));
        (bool ok,) =
            proxy.attack(address(vault), abi.encodeCall(GroupBuyVault.withdraw, (ids(1, 45), payable(bob))));
        assertFalse(ok);
        (ok,) = proxy.attack(
            address(vault),
            abi.encodeWithSignature("execute(address,uint256,bytes)", bob, principal, bytes(""))
        );
        assertFalse(ok);
        (ok,) = proxy.attack(address(vault), abi.encodeCall(GroupBuyVault.factoryCancelFunding, (222)));
        assertTrue(ok);
        assertEq(uint256(vault.state()), uint256(Types.State.REFUNDABLE));
        assertEq(address(vault).balance, principal);
        assertEq(vault.holderOf(1), alice);
        (ok,) = proxy.attack(address(vault), abi.encodeCall(GroupBuyVault.factoryCancelFunding, (0)));
        assertFalse(ok);
        vm.expectRevert(bytes("MALICIOUS_FACTORY_UNAVAILABLE"));
        factory.poolCount();
        uint256 before = alice.balance;
        vm.prank(alice);
        vault.withdraw(ids(1, 45), payable(alice));
        assertEq(alice.balance - before, principal);
        assertEq(vault.fundedWei(), 0);
    }

    function testMaliciousFactoryCannotChangeActiveVaultOrBlockDirectLifecycle() public {
        activate();
        bem.mint(address(vault), 1003);
        vault.syncRewards();
        bytes32 cloneHash = address(vault).codehash;
        FactoryMaliciousV2 evil = new FactoryMaliciousV2();
        _govern(abi.encodeCall(factory.upgradeToAndCall, (address(evil), "")));
        FactoryMaliciousV2 proxy = FactoryMaliciousV2(address(factory));
        (bool ok,) = proxy.attack(address(vault), abi.encodeCall(GroupBuyVault.factoryCancelFunding, (7)));
        assertFalse(ok);
        (ok,) = proxy.attack(
            address(vault),
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(evil), bytes(""))
        );
        assertFalse(ok);
        (ok,) = proxy.attack(address(vault), abi.encodeWithSignature("setFactory(address)", bob));
        assertFalse(ok);
        (ok,) = proxy.attack(address(vault), abi.encodeWithSignature("transferOwnership(address)", bob));
        assertFalse(ok);
        (ok,) = proxy.attack(address(vault), abi.encodeCall(GroupBuyVault.claimBatch, (ids(1, 100))));
        assertFalse(ok);
        (ok,) = proxy.attack(address(vault), abi.encodeCall(GroupBuyVault.redeemWithoutHarvest, ()));
        assertFalse(ok);
        (ok,) =
            proxy.attack(address(nft), abi.encodeCall(IERC721.transferFrom, (address(vault), bob, TOKEN_ID)));
        assertFalse(ok);
        assertEq(address(vault).codehash, cloneHash);
        assertEq(vault.configHash(), configHash);
        assertEq(vault.totalAccounted(), 1003);
        assertEq(vault.totalPaid(), 0);
        assertEq(vault.accPerShare(), 10);
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        consolidate();
        vm.prank(alice);
        vault.redeemMiner();
        assertEq(nft.ownerOf(TOKEN_ID), alice);
        assertEq(bem.balanceOf(alice), 1003);
        assertEq(uint256(vault.state()), uint256(Types.State.REDEEMED));
        assertEq(vault.redeemedBeneficiary(), alice);
        (ok,) = proxy.attack(address(vault), abi.encodeCall(GroupBuyVault.factoryCancelFunding, (7)));
        assertFalse(ok);
    }

    function testPauseDoesNotBlockExistingFundingExitOrActiveClaimsAndRedemption() public {
        contribute(alice, 1, 45, false);
        vm.prank(guardian);
        factory.pauseCreation();
        vm.expectRevert(GroupBuyFactory.CreationPaused.selector);
        factory.createPool(address(template), configHash, terms, payload, 2);
        vm.prank(alice);
        vault.withdraw(ids(1, 45), payable(alice));
        activate();
        bem.mint(address(vault), 100);
        vm.prank(alice);
        vault.claimBatch(ids(1, 45));
        consolidate();
        vm.prank(alice);
        vault.redeemWithoutHarvest();
        vm.prank(alice);
        vault.claimResidual(alice);
        assertEq(nft.ownerOf(TOKEN_ID), alice);
        assertEq(bem.balanceOf(alice), 100);
    }
}
