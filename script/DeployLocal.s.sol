// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {GroupBuyFactory} from "../src/GroupBuyFactory.sol";
import {GroupBuyVault} from "../src/GroupBuyVault.sol";
import {GovernanceTimelock} from "../src/GovernanceTimelock.sol";

/// @notice Local-only deployment. Factory starts paused and no assets are purchased.
/// @dev CLI verifies loopback Anvil before executing; no private keys are read.
contract DeployLocal is Script {
    function run() external {
        require(block.chainid == 56, "LOCAL_ANVIL_CHAIN_56_REQUIRED");
        address actor = msg.sender;
        address[] memory roles = new address[](1);
        roles[0] = actor;
        vm.startBroadcast();
        GovernanceTimelock timelock = new GovernanceTimelock(60, roles, roles);
        GroupBuyVault template = new GroupBuyVault();
        GroupBuyFactory implementation = new GroupBuyFactory();
        // Local guardian is a separate unlocked Anvil account; production checklist rejects this fixture.
        address guardian = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        require(actor != guardian, "DISTINCT_LOCAL_GUARDIAN_REQUIRED");
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(GroupBuyFactory.initialize, (address(timelock), guardian, 60))
        );
        vm.stopBroadcast();
        console2.log("LOCAL_ONLY_NOT_PRODUCTION");
        console2.log("Factory", address(proxy));
        console2.log("Template", address(template));
        console2.log("Timelock", address(timelock));
        console2.log("Guardian", guardian);
        console2.log("Creation paused: configure through scheduleBatch and executeBatch after delay.");
    }
}
