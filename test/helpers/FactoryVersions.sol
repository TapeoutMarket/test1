// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GroupBuyFactory} from "../../src/GroupBuyFactory.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract FactoryV2 is GroupBuyFactory {
    uint256 public addedValue;

    function setAddedValue(uint256 value) external {
        addedValue = value;
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}

/// @dev Deliberately hostile implementation used only to prove old Vault boundaries.
contract FactoryMaliciousV2 is UUPSUpgradeable {
    function attack(address target, bytes calldata data)
        external
        returns (bool success, bytes memory result)
    {
        return target.call(data);
    }

    function _authorizeUpgrade(address) internal pure override {
        revert("MALICIOUS_FACTORY_UNAVAILABLE");
    }

    fallback() external {
        revert("MALICIOUS_FACTORY_UNAVAILABLE");
    }
}

contract FactoryUnlockedTemplate {
    function implementationSelf() external view returns (address) {
        return address(this);
    }

    function vaultTemplateId() external pure returns (bytes32) {
        return keccak256("TapeOut.GroupBuyVault.v1");
    }

    function templateInitializersDisabled() external pure returns (bool) {
        return false;
    }
}
