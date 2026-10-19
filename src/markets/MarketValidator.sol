// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Types} from "../Types.sol";
import {MarketLogic} from "./MarketLogic.sol";

/// @notice Stateless, immutable read-only code helper created by each template constructor.
/// @dev Cannot receive assets or execute purchases. Vault calls use STATICCALL, never delegatecall.
contract MarketValidator {
    function status(Types.Config calldata config, Types.Terms calldata terms, bytes calldata payload)
        external
        view
        returns (Types.MarketStatus)
    {
        return MarketLogic.status(config, terms, payload);
    }
}
