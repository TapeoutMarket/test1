// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library Types {
    enum MarketKind {
        SEAPORT,
        CIRCUIT_RESERVED,
        MOCK_CIRCUIT
    }
    enum State {
        FUNDING,
        PURCHASING,
        ACTIVE,
        REFUNDABLE,
        REDEEMED
    }
    enum MarketStatus {
        EXECUTABLE,
        NOT_STARTED,
        EXPIRED,
        CANCELLED,
        FILLED,
        COUNTER_CHANGED,
        OWNER_CHANGED,
        APPROVAL_MISSING,
        PRICE_CHANGED,
        LISTING_ENDED,
        UNKNOWN
    }

    struct Config {
        uint256 chainId;
        uint32 templateVersion;
        MarketKind marketKind;
        address market;
        address collection;
        address mining;
        address bem;
        bytes32 marketCodeHash;
        bytes32 seaportDomainSeparator;
        bytes32 seaportVersionHash;
        uint64 safetyMargin;
        bool mockOnly;
    }

    struct Terms {
        address seller;
        uint256 tokenId;
        uint256 totalPrice;
        uint64 deadline;
        bytes32 orderHash;
        uint256 counter;
        uint256 listingId;
        uint96 listingPrice;
        uint16 feeBps;
        bytes32 executionHash;
        uint64 orderStart;
        uint64 orderEnd;
        string name;
        string metadataURI;
    }
    enum ItemType {
        NATIVE,
        ERC20,
        ERC721,
        ERC1155,
        ERC721_WITH_CRITERIA,
        ERC1155_WITH_CRITERIA
    }
    enum OrderType {
        FULL_OPEN,
        PARTIAL_OPEN,
        FULL_RESTRICTED,
        PARTIAL_RESTRICTED,
        CONTRACT
    }

    struct OfferItem {
        ItemType itemType;
        address token;
        uint256 identifierOrCriteria;
        uint256 startAmount;
        uint256 endAmount;
    }

    struct ConsiderationItem {
        ItemType itemType;
        address token;
        uint256 identifierOrCriteria;
        uint256 startAmount;
        uint256 endAmount;
        address payable recipient;
    }

    struct OrderParameters {
        address offerer;
        address zone;
        OfferItem[] offer;
        ConsiderationItem[] consideration;
        OrderType orderType;
        uint256 startTime;
        uint256 endTime;
        bytes32 zoneHash;
        uint256 salt;
        bytes32 conduitKey;
        uint256 totalOriginalConsiderationItems;
    }

    struct OrderComponents {
        address offerer;
        address zone;
        OfferItem[] offer;
        ConsiderationItem[] consideration;
        OrderType orderType;
        uint256 startTime;
        uint256 endTime;
        bytes32 zoneHash;
        uint256 salt;
        bytes32 conduitKey;
        uint256 counter;
    }

    struct Order {
        OrderParameters parameters;
        bytes signature;
    }
}
