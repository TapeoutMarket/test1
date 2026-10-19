// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {GroupBuyFactory} from "../../src/GroupBuyFactory.sol";
import {GroupBuyVault} from "../../src/GroupBuyVault.sol";
import {GovernanceTimelock} from "../../src/GovernanceTimelock.sol";
import {FactoryV2, FactoryUnlockedTemplate} from "../helpers/FactoryVersions.sol";

contract FactoryGovernanceTest is Test {
    GroupBuyFactory factory;
    GroupBuyFactory logic;
    GroupBuyVault template;
    GovernanceTimelock timelock;
    address guardian = address(0x1234);
    uint256 nonce;

    function setUp() public {
        vm.chainId(56);
        address[] memory roles = new address[](1);
        roles[0] = address(this);
        timelock = new GovernanceTimelock(10, roles, roles);
        logic = new GroupBuyFactory();
        factory = GroupBuyFactory(
            address(
                new ERC1967Proxy(
                    address(logic),
                    abi.encodeCall(GroupBuyFactory.initialize, (address(timelock), guardian, 10))
                )
            )
        );
        template = new GroupBuyVault();
    }

    function _queue(address target, bytes memory data) internal returns (bytes32 salt) {
        salt = bytes32(++nonce);
        timelock.schedule(target, 0, data, bytes32(0), salt, timelock.getMinDelay());
    }

    function _govern(bytes memory data) internal {
        bytes32 salt = _queue(address(factory), data);
        vm.warp(block.timestamp + timelock.getMinDelay());
        timelock.execute(address(factory), 0, data, bytes32(0), salt);
    }

    function testImplementationAndProxyInitializersLocked() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        logic.initialize(address(timelock), guardian, 10);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        factory.initialize(address(timelock), guardian, 10);
        assertEq(factory.upgradeAdmin(), address(timelock));
        assertEq(factory.guardian(), guardian);
        assertTrue(factory.creationPaused());
    }

    function testEOAAndZeroDelayAndSharedGuardianRejected() public {
        vm.expectRevert(GroupBuyFactory.InvalidGovernance.selector);
        new ERC1967Proxy(
            address(logic), abi.encodeCall(GroupBuyFactory.initialize, (address(0xAA12), guardian, 10))
        );
        vm.expectRevert(GroupBuyFactory.InvalidGovernance.selector);
        new ERC1967Proxy(
            address(logic), abi.encodeCall(GroupBuyFactory.initialize, (address(timelock), guardian, 0))
        );
        vm.expectRevert(GroupBuyFactory.InvalidGovernance.selector);
        new ERC1967Proxy(
            address(logic),
            abi.encodeCall(GroupBuyFactory.initialize, (address(timelock), address(timelock), 10))
        );
        vm.expectRevert(GroupBuyFactory.InvalidGovernance.selector);
        new ERC1967Proxy(
            address(logic), abi.encodeCall(GroupBuyFactory.initialize, (address(timelock), guardian, 11))
        );
        vm.expectRevert(GroupBuyFactory.InvalidGovernance.selector);
        new ERC1967Proxy(
            address(logic), abi.encodeCall(GroupBuyFactory.initialize, (address(timelock), address(this), 10))
        );
    }

    function testDirectEOAAndGuardianCannotUpgrade() public {
        FactoryV2 next = new FactoryV2();
        vm.expectRevert(GroupBuyFactory.Unauthorized.selector);
        factory.upgradeToAndCall(address(next), "");
        vm.prank(guardian);
        vm.expectRevert(GroupBuyFactory.Unauthorized.selector);
        factory.upgradeToAndCall(address(next), "");
    }

    function testTimelockMustElapseAndUpgradePreservesStorage() public {
        FactoryV2 next = new FactoryV2();
        bytes memory data = abi.encodeCall(factory.upgradeToAndCall, (address(next), ""));
        bytes32 salt = _queue(address(factory), data);
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnexpectedOperationState.selector,
                timelock.hashOperation(address(factory), 0, data, bytes32(0), salt),
                bytes32(uint256(1) << uint8(TimelockController.OperationState.Ready))
            )
        );
        timelock.execute(address(factory), 0, data, bytes32(0), salt);
        vm.warp(block.timestamp + 10);
        timelock.execute(address(factory), 0, data, bytes32(0), salt);
        FactoryV2 upgraded = FactoryV2(address(factory));
        assertEq(upgraded.version(), 2);
        assertEq(upgraded.upgradeAdmin(), address(timelock));
        assertEq(upgraded.guardian(), guardian);
        assertEq(upgraded.requiredMinDelay(), 10);
        assertTrue(upgraded.creationPaused());
        upgraded.setAddedValue(71);
        assertEq(upgraded.addedValue(), 71);
        assertEq(upgraded.guardian(), guardian);
    }

    function testTimelockCannotBypassFloorViaDelayedUpdate() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (0));
        bytes32 salt = _queue(address(timelock), data);
        vm.warp(block.timestamp + 10);
        timelock.execute(address(timelock), 0, data, bytes32(0), salt);
        assertEq(timelock.getMinDelay(), 10);
        vm.expectRevert(abi.encodeWithSelector(TimelockController.TimelockInsufficientDelay.selector, 0, 10));
        timelock.schedule(address(factory), 0, "", bytes32(0), bytes32(uint256(999)), 0);
        assertTrue(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(this)));
    }

    function testGuardianCanPauseOnlyAdminCanResumeOrApprove() public {
        vm.expectRevert(GroupBuyFactory.Unauthorized.selector);
        factory.pauseCreation();
        vm.prank(guardian);
        factory.pauseCreation();
        vm.prank(guardian);
        vm.expectRevert(GroupBuyFactory.Unauthorized.selector);
        factory.resumeCreation();
        bytes32 codeHash = address(template).codehash;
        vm.prank(guardian);
        vm.expectRevert(GroupBuyFactory.Unauthorized.selector);
        factory.approveTemplate(address(template), 1, codeHash);
        _govern(abi.encodeCall(GroupBuyFactory.approveTemplate, (address(template), 1, codeHash)));
        GroupBuyFactory.TemplateApproval memory approval = factory.templateApproval(address(template));
        assertTrue(approval.approved);
        assertEq(approval.version, 1);
        assertEq(approval.codeHash, codeHash);
    }

    function testTemplateZeroCodeWrongHashProxyAndUnlockedRejected() public {
        _expectGovernRevert(abi.encodeCall(GroupBuyFactory.approveTemplate, (address(0x9876), 1, bytes32(0))));
        _expectGovernRevert(
            abi.encodeCall(GroupBuyFactory.approveTemplate, (address(template), 1, bytes32(uint256(1))))
        );
        _expectGovernRevert(
            abi.encodeCall(
                GroupBuyFactory.approveTemplate, (address(template), 0, address(template).codehash)
            )
        );
        address fake = address(new ERC1967Proxy(address(template), ""));
        _expectGovernRevert(abi.encodeCall(GroupBuyFactory.approveTemplate, (fake, 1, fake.codehash)));
        address unlocked = address(new FactoryUnlockedTemplate());
        _expectGovernRevert(abi.encodeCall(GroupBuyFactory.approveTemplate, (unlocked, 1, unlocked.codehash)));
    }

    function _expectGovernRevert(bytes memory data) internal {
        bytes32 salt = _queue(address(factory), data);
        vm.warp(block.timestamp + timelock.getMinDelay());
        vm.expectRevert(GroupBuyFactory.InvalidTemplate.selector);
        timelock.execute(address(factory), 0, data, bytes32(0), salt);
    }

    function testGuardianBatchBoundAndUnknownPoolsAndPagination() public {
        vm.startPrank(guardian);
        vm.expectRevert(GroupBuyFactory.UnknownPool.selector);
        factory.guardianCancel(address(999), 1);
        address[] memory list = new address[](33);
        vm.expectRevert(GroupBuyFactory.BatchTooLarge.selector);
        factory.guardianCancelBatch(list, 1);
        list = new address[](0);
        vm.expectRevert(GroupBuyFactory.BatchTooLarge.selector);
        factory.guardianCancelBatch(list, 1);
        vm.stopPrank();
        assertEq(factory.getPools(0, 10).length, 0);
        vm.expectRevert(GroupBuyFactory.InvalidPage.selector);
        factory.getPools(0, 101);
        vm.expectRevert(GroupBuyFactory.InvalidPage.selector);
        factory.getPools(1, 1);
    }
}
