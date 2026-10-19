// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Governance executes every Factory administration action through a real delay.
/// @dev There is deliberately no external bootstrap administrator. The proposer should
///      be the verified governance multisig in a production deployment.
contract GovernanceTimelock is TimelockController {
    error InvalidMinimumDelay();

    uint256 public immutable minimumDelayFloor;
    address public immutable deploymentAddress;

    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors)
        TimelockController(minDelay, proposers, executors, address(0))
    {
        if (minDelay == 0 || proposers.length == 0 || executors.length == 0) revert InvalidMinimumDelay();
        for (uint256 i; i < proposers.length; ++i) {
            if (proposers[i] == address(0)) revert InvalidMinimumDelay();
        }
        minimumDelayFloor = minDelay;
        deploymentAddress = address(this);
    }

    /// @notice Scheduling always observes the floor, including after updateDelay.
    function getMinDelay() public view override returns (uint256) {
        uint256 configured = super.getMinDelay();
        return configured < minimumDelayFloor ? minimumDelayFloor : configured;
    }
}
