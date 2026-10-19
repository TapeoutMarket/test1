// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Types} from "../Types.sol";

interface IGroupBuyVault {
    function initialize(
        address factory,
        address creator,
        Types.Config calldata config,
        Types.Terms calldata terms,
        bytes calldata payload
    ) external;
    function factoryCancelFunding(uint8 reasonCode) external;
    function state() external view returns (Types.State);
    function implementationSelf() external view returns (address);
    function templateInitializersDisabled() external view returns (bool);
    function vaultTemplateId() external pure returns (bytes32);
}
