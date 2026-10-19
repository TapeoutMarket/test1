// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Types} from "../Types.sol";

interface ISeaportSubset {
    function getOrderHash(Types.OrderComponents calldata order) external view returns (bytes32);
    function getOrderStatus(bytes32 hash)
        external
        view
        returns (bool validated, bool cancelled, uint256 filled, uint256 size);
    function getCounter(address offerer) external view returns (uint256);
    function information()
        external
        view
        returns (string memory version, bytes32 domainSeparator, address conduitController);
    function fulfillOrder(Types.Order calldata order, bytes32 fulfillerConduitKey)
        external
        payable
        returns (bool fulfilled);
}

/// @dev MOCK ONLY. This interface is intentionally not asserted to match the unknown live CircuitMarket ABI.
interface IMockCircuitMarket {
    function listingView(uint256 listingId)
        external
        view
        returns (
            address seller,
            address collection,
            uint256 tokenId,
            uint96 price,
            uint16 feeBps,
            bool active
        );
    function listingFor(address collection, uint256 tokenId)
        external
        view
        returns (uint256 listingId, address seller, uint96 price, bool active);
    function buy(uint256 listingId, uint96 expectedPrice) external payable;
}

/// @dev Candidate ABI from supplied spec; live compatibility remains unverified without pinned source/fork.
interface IMining {
    function minerKey(address collection, uint256 tokenId) external view returns (bytes32);
    function pending(bytes32 key) external view returns (uint256);
    function claim(bytes32 key) external;
}
