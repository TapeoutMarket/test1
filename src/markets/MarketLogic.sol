// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Types} from "../Types.sol";
import {ISeaportSubset, IMockCircuitMarket} from "../interfaces/IProtocols.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Fixed internal purchase logic: no adapter changes the Vault's caller identity.
library MarketLogic {
    error UnsupportedOrder();
    error InvalidSignature();
    error IdentityMismatch();
    error PurchaseFailed();

    function validate(Types.Config memory c, Types.Terms memory t, bytes memory payload) internal view {
        if (c.market.codehash != c.marketCodeHash || c.market.code.length == 0) revert IdentityMismatch();
        if (c.marketKind == Types.MarketKind.CIRCUIT_RESERVED) revert UnsupportedOrder();
        if (keccak256(payload) != t.executionHash) revert UnsupportedOrder();
        if (c.marketKind == Types.MarketKind.MOCK_CIRCUIT) {
            if (!c.mockOnly || payload.length != 0 || t.listingPrice != t.totalPrice || t.feeBps > 10_000) {
                revert UnsupportedOrder();
            }
            return;
        }
        Types.Order memory o = abi.decode(payload, (Types.Order));
        // Canonical encoding also prevents accepted trailing calldata from becoming ambiguous.
        if (keccak256(abi.encode(o)) != t.executionHash) revert UnsupportedOrder();
        Types.OrderParameters memory p = o.parameters;
        if (
            p.offerer != t.seller || p.zone != address(0) || p.zoneHash != bytes32(0)
                || p.conduitKey != bytes32(0) || p.orderType != Types.OrderType.FULL_OPEN
                || p.offer.length != 1 || p.consideration.length != 2
                || p.totalOriginalConsiderationItems != 2 || p.startTime != t.orderStart
                || p.endTime != t.orderEnd || p.endTime <= p.startTime || c.safetyMargin == 0
                || t.deadline <= p.startTime || p.endTime < c.safetyMargin
                || t.deadline > p.endTime - c.safetyMargin
        ) revert UnsupportedOrder();
        Types.OfferItem memory offer = p.offer[0];
        if (
            offer.itemType != Types.ItemType.ERC721 || offer.token != c.collection
                || offer.identifierOrCriteria != t.tokenId || offer.startAmount != 1 || offer.endAmount != 1
        ) revert UnsupportedOrder();
        uint256 sum;
        for (uint256 i; i < 2; ++i) {
            Types.ConsiderationItem memory item = p.consideration[i];
            if (
                item.itemType != Types.ItemType.NATIVE || item.token != address(0)
                    || item.identifierOrCriteria != 0 || item.startAmount != item.endAmount
                    || item.recipient == address(0)
            ) revert UnsupportedOrder();
            sum += item.startAmount;
        }
        if (
            p.consideration[0].recipient != t.seller || p.consideration[0].startAmount == 0
                || p.consideration[1].startAmount != p.consideration[0].startAmount / 100
                || sum != t.totalPrice || t.feeBps != 100
        ) revert UnsupportedOrder();
        ISeaportSubset market = ISeaportSubset(c.market);
        (string memory version, bytes32 domain,) = market.information();
        bytes32 expectedDomain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Seaport"),
                keccak256(bytes(version)),
                c.chainId,
                c.market
            )
        );
        if (
            domain != c.seaportDomainSeparator || domain != expectedDomain
                || keccak256(bytes(version)) != c.seaportVersionHash
        ) revert IdentityMismatch();
        Types.OrderComponents memory components = Types.OrderComponents(
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
            t.counter
        );
        if (market.getOrderHash(components) != t.orderHash) revert UnsupportedOrder();
    }

    function _validSignature(address seller, bytes32 digest, bytes memory sig) private view returns (bool) {
        if (seller.code.length == 0 && sig.length == 64) {
            bytes32 r;
            bytes32 vs;
            assembly {
                r := mload(add(sig, 32))
                vs := mload(add(sig, 64))
            }
            (address compactRecovered, ECDSA.RecoverError compactErr,) = ECDSA.tryRecover(digest, r, vs);
            return compactErr == ECDSA.RecoverError.NoError && compactRecovered == seller;
        }
        if (seller.code.length != 0) {
            (bool ok, bytes memory result) =
                seller.staticcall(abi.encodeCall(IERC1271.isValidSignature, (digest, sig)));
            return
                ok && result.length >= 32
                    && abi.decode(result, (bytes4)) == IERC1271.isValidSignature.selector;
        }
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        return err == ECDSA.RecoverError.NoError && recovered == seller;
    }

    function status(Types.Config memory c, Types.Terms memory t, bytes memory payload)
        internal
        view
        returns (Types.MarketStatus)
    {
        validate(c, t, payload);
        if (block.timestamp >= t.deadline) return Types.MarketStatus.EXPIRED;
        if (c.marketKind == Types.MarketKind.SEAPORT) {
            ISeaportSubset market = ISeaportSubset(c.market);
            (bool validated, bool cancelled, uint256 filled, uint256 size) =
                market.getOrderStatus(t.orderHash);
            if (cancelled) return Types.MarketStatus.CANCELLED;
            if (market.getCounter(t.seller) != t.counter) return Types.MarketStatus.COUNTER_CHANGED;
            if (size != 0 && filled >= size) return Types.MarketStatus.FILLED;
            if (block.timestamp >= t.orderEnd) return Types.MarketStatus.EXPIRED;
            // Bound on-chain terminal facts remain observable even if an ERC-1271
            // seller later revokes its signature or stops answering signature queries.
            if (
                !validated
                    && !_validSignature(
                        t.seller,
                        keccak256(abi.encodePacked(bytes2(0x1901), c.seaportDomainSeparator, t.orderHash)),
                        abi.decode(payload, (Types.Order)).signature
                    )
            ) revert InvalidSignature();
            if (block.timestamp < t.orderStart) return Types.MarketStatus.NOT_STARTED;
        } else {
            (address seller, address collection, uint256 tokenId, uint96 price, uint16 feeBps, bool active) =
                IMockCircuitMarket(c.market).listingView(t.listingId);
            (uint256 currentId, address currentSeller, uint96 currentPrice, bool currentActive) =
                IMockCircuitMarket(c.market).listingFor(c.collection, t.tokenId);
            if (!active || !currentActive || currentId != t.listingId) {
                return Types.MarketStatus.LISTING_ENDED;
            }
            if (
                seller != t.seller || currentSeller != t.seller || collection != c.collection
                    || tokenId != t.tokenId
            ) return Types.MarketStatus.UNKNOWN;
            if (price != t.listingPrice || currentPrice != t.listingPrice || feeBps != t.feeBps) {
                return Types.MarketStatus.PRICE_CHANGED;
            }
        }
        IERC721 nft = IERC721(c.collection);
        if (nft.ownerOf(t.tokenId) != t.seller) return Types.MarketStatus.OWNER_CHANGED;
        if (nft.getApproved(t.tokenId) != c.market && !nft.isApprovedForAll(t.seller, c.market)) {
            return Types.MarketStatus.APPROVAL_MISSING;
        }
        return Types.MarketStatus.EXECUTABLE;
    }

    function purchase(Types.Config memory c, Types.Terms memory t, bytes memory payload) internal {
        if (c.marketKind == Types.MarketKind.SEAPORT) {
            if (!ISeaportSubset(c.market).fulfillOrder{value: t.totalPrice}(
                    abi.decode(payload, (Types.Order)), bytes32(0)
                )) revert PurchaseFailed();
            (, bool cancelled, uint256 filled, uint256 size) =
                ISeaportSubset(c.market).getOrderStatus(t.orderHash);
            if (cancelled || size == 0 || filled != size) revert PurchaseFailed();
        } else if (c.marketKind == Types.MarketKind.MOCK_CIRCUIT && c.mockOnly) {
            IMockCircuitMarket(c.market).buy{value: t.totalPrice}(t.listingId, t.listingPrice);
        } else {
            revert UnsupportedOrder();
        }
        if (IERC721(c.collection).ownerOf(t.tokenId) != address(this)) revert PurchaseFailed();
    }
}
