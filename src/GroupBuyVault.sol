// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC1155Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Types} from "./Types.sol";
import {IMining} from "./interfaces/IProtocols.sol";
import {MarketLogic} from "./markets/MarketLogic.sol";
import {MarketValidator} from "./markets/MarketValidator.sol";

/// @notice Immutable ERC-1167 implementation. No owner, upgrade, arbitrary execution or asset manager.
contract GroupBuyVault is ERC1155Upgradeable, ReentrancyGuardUpgradeable, IERC721Receiver {
    using SafeERC20 for IERC20;
    address private immutable SELF = address(this);
    MarketValidator public immutable marketValidator;
    uint256 public constant SHARE_COUNT = 100;
    address public factory;
    address public creator;
    Types.State public state;
    Types.Config private _config;
    Types.Terms private _terms;
    bytes private _payload;
    bytes32 public configHash;
    bytes32 public termsHash;
    uint8 public terminationReason;
    uint256 public soldCount;
    uint256 public fundedWei;
    uint256 public totalPrincipalIn;
    uint256 public totalPrincipalRefunded;
    uint256 public purchaseSpent;
    uint256 public soldBitmap;
    mapping(uint256 => address) private _holders;
    mapping(uint256 => uint256) public claimed;
    uint256 public accPerShare;
    uint256 public totalAccounted;
    uint256 public totalPaid;
    uint256 public remainder;
    address public redeemedBeneficiary;

    error InvalidConfig();
    error InvalidTerms();
    error InvalidState();
    error InvalidIds();
    error NotHolder();
    error WrongValue();
    error CompletionRequired();
    error UnavailableMarket(Types.MarketStatus status);
    error Unauthorized();
    error NativePaymentFailed();
    error RewardBalanceDecreased();
    error UnexpectedNFT();

    event VaultInitialized(
        address indexed factory, address indexed creator, bytes32 configHash, bytes32 termsHash, bytes payload
    );
    event Contributed(address indexed participant, uint256[] ids, uint256 principal, uint256 soldCount);
    event Withdrawn(address indexed participant, address indexed recipient, uint256[] ids, uint256 principal);
    event IdReleased(uint256 indexed id, address indexed participant);
    event Purchased(
        address indexed market,
        address indexed collection,
        uint256 indexed tokenId,
        uint256 paid,
        bytes32 orderHash,
        uint256 listingId
    );
    event FundingTerminated(uint8 reason, address indexed caller);
    event RewardsSynced(uint256 received, uint256 totalAccounted, uint256 accPerShare, uint256 remainder);
    event Harvested(address indexed caller, uint256 received);
    event RewardClaimed(address indexed holder, uint256 indexed id, uint256 amount);
    event Redeemed(address indexed beneficiary, bool harvested, uint256 paid, uint256 dust);
    event ResidualClaimed(address indexed beneficiary, address indexed recipient, uint256 amount);
    event UnexpectedNativeReceived(address indexed sender, uint256 value);

    constructor() {
        _disableInitializers();
        marketValidator = new MarketValidator();
    }

    function implementationSelf() external view returns (address) {
        return SELF;
    }

    function templateInitializersDisabled() external view returns (bool) {
        return _getInitializedVersion() == type(uint64).max;
    }

    function vaultTemplateId() external pure returns (bytes32) {
        return keccak256("TapeOut.GroupBuyVault.v1");
    }

    function initialize(
        address factory_,
        address creator_,
        Types.Config calldata c,
        Types.Terms calldata t,
        bytes calldata payload
    ) external initializer {
        if (
            factory_ != msg.sender || factory_.code.length == 0 || creator_ == address(0) || c.chainId != 56
                || block.chainid != 56 || c.templateVersion != 1 || c.market.code.length == 0
                || c.collection.code.length == 0 || c.mining.code.length == 0 || c.bem.code.length == 0
        ) revert InvalidConfig();
        if (
            t.seller == address(0) || t.seller == address(this) || t.totalPrice < SHARE_COUNT
                || t.deadline <= block.timestamp || bytes(t.name).length == 0 || bytes(t.name).length > 64
                || bytes(t.metadataURI).length > 2048 || payload.length > 16384
        ) revert InvalidTerms();
        __ERC1155_init(t.metadataURI);
        __ReentrancyGuard_init();
        factory = factory_;
        creator = creator_;
        _config = c;
        _terms = t;
        _payload = payload;
        configHash = keccak256(abi.encode(c));
        termsHash = keccak256(abi.encode(t));
        Types.MarketStatus s = marketValidator.status(c, t, payload);
        if (s != Types.MarketStatus.EXECUTABLE && s != Types.MarketStatus.NOT_STARTED) {
            revert UnavailableMarket(s);
        }
        emit VaultInitialized(factory_, creator_, configHash, termsHash, payload);
    }

    function getConfig() external view returns (Types.Config memory) {
        return _config;
    }

    function getTerms() external view returns (Types.Terms memory) {
        return _terms;
    }

    function name() external view returns (string memory) {
        return _terms.name;
    }

    function purchasePayload() external view returns (bytes memory) {
        return _payload;
    }

    function holderOf(uint256 id) external view returns (address) {
        _checkId(id);
        return _holders[id];
    }

    function totalSupply(uint256 id) external view returns (uint256) {
        _checkId(id);
        return _holders[id] == address(0) ? 0 : 1;
    }

    function costOf(uint256 id) public view returns (uint256) {
        _checkId(id);
        return _terms.totalPrice / SHARE_COUNT + (id <= _terms.totalPrice % SHARE_COUNT ? 1 : 0);
    }

    function availableIds() external view returns (uint256[] memory ids) {
        if (state != Types.State.FUNDING) return new uint256[](0);
        ids = new uint256[](SHARE_COUNT - soldCount);
        uint256 j;
        for (uint256 id = 1; id <= SHARE_COUNT; ++id) {
            if (_holders[id] == address(0)) ids[j++] = id;
        }
    }

    function marketStatusStrict() external view returns (Types.MarketStatus) {
        return marketValidator.status(_config, _terms, _payload);
    }

    function marketStatus() public view returns (Types.MarketStatus) {
        try this.marketStatusStrict() returns (Types.MarketStatus s) {
            return s;
        } catch {
            return Types.MarketStatus.UNKNOWN;
        }
    }

    function contribute(uint256[] calldata ids, bool requireCompletion, bytes calldata payload)
        external
        payable
        nonReentrant
    {
        if (state != Types.State.FUNDING) revert InvalidState();
        if (keccak256(payload) != _terms.executionHash) revert InvalidTerms();
        Types.MarketStatus s = marketStatus();
        if (s != Types.MarketStatus.EXECUTABLE) revert UnavailableMarket(s);
        _checkIds(ids);
        uint256 amount;
        for (uint256 i; i < ids.length; ++i) {
            if (_holders[ids[i]] != address(0)) revert InvalidIds();
            amount += costOf(ids[i]);
        }
        if (msg.value != amount) revert WrongValue();
        if (requireCompletion && soldCount + ids.length != SHARE_COUNT) revert CompletionRequired();
        fundedWei += amount;
        totalPrincipalIn += amount;
        soldCount += ids.length;
        _mintBatch(msg.sender, ids, _ones(ids.length), "");
        emit Contributed(msg.sender, ids, amount, soldCount);
        if (soldCount == SHARE_COUNT) _purchase();
    }

    function withdraw(uint256[] calldata ids, address payable recipient) external nonReentrant {
        if (state != Types.State.FUNDING && state != Types.State.REFUNDABLE) revert InvalidState();
        if (recipient == address(0) || recipient == address(this)) revert InvalidTerms();
        _checkOwned(ids);
        uint256 amount;
        for (uint256 i; i < ids.length; ++i) {
            amount += costOf(ids[i]);
            emit IdReleased(ids[i], msg.sender);
        }
        fundedWei -= amount;
        totalPrincipalRefunded += amount;
        soldCount -= ids.length;
        _burnBatch(msg.sender, ids, _ones(ids.length));
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert NativePaymentFailed();
        emit Withdrawn(msg.sender, recipient, ids, amount);
    }

    function factoryCancelFunding(uint8 reasonCode) external nonReentrant {
        if (msg.sender != factory) revert Unauthorized();
        _terminate(reasonCode);
    }

    function markRefundable() external nonReentrant {
        if (state != Types.State.FUNDING) revert InvalidState();
        if (block.timestamp >= _terms.deadline) {
            _terminate(uint8(Types.MarketStatus.EXPIRED));
            return;
        }
        Types.MarketStatus s = marketStatus();
        if (
            s != Types.MarketStatus.CANCELLED && s != Types.MarketStatus.COUNTER_CHANGED
                && s != Types.MarketStatus.FILLED && s != Types.MarketStatus.EXPIRED
                && s != Types.MarketStatus.LISTING_ENDED && s != Types.MarketStatus.PRICE_CHANGED
        ) revert UnavailableMarket(s);
        _terminate(uint8(s));
    }

    function _terminate(uint8 reason) internal {
        if (state != Types.State.FUNDING) revert InvalidState();
        state = Types.State.REFUNDABLE;
        terminationReason = reason;
        emit FundingTerminated(reason, msg.sender);
    }

    function _purchase() internal {
        if (fundedWei != _terms.totalPrice) revert WrongValue();
        Types.MarketStatus s = marketStatus();
        if (s != Types.MarketStatus.EXECUTABLE) revert UnavailableMarket(s);
        state = Types.State.PURCHASING;
        fundedWei = 0;
        purchaseSpent = _terms.totalPrice;
        MarketLogic.purchase(_config, _terms, _payload);
        state = Types.State.ACTIVE;
        _sync();
        emit Purchased(
            _config.market,
            _config.collection,
            _terms.tokenId,
            purchaseSpent,
            _terms.orderHash,
            _terms.listingId
        );
    }

    function syncRewards() external nonReentrant {
        _requireActive();
        _sync();
    }

    function harvest() external nonReentrant {
        _requireActive();
        _harvest();
    }

    function claim(uint256 id) external nonReentrant {
        _requireActive();
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        _claim(ids);
    }

    function claimBatch(uint256[] calldata ids) external nonReentrant {
        _requireActive();
        _claim(ids);
    }

    function harvestAndClaim(uint256[] calldata ids) external nonReentrant {
        _requireActive();
        _checkOwned(ids);
        _harvest();
        _claim(ids);
    }

    function claimable(uint256 id) external view returns (uint256) {
        _checkId(id);
        if (state != Types.State.ACTIVE) return 0;
        uint256 balance = IERC20(_config.bem).balanceOf(address(this));
        if (balance + totalPaid < totalAccounted) revert RewardBalanceDecreased();
        return accPerShare + (balance + totalPaid - totalAccounted + remainder) / SHARE_COUNT - claimed[id];
    }

    function _sync() internal returns (uint256 received) {
        uint256 balance = IERC20(_config.bem).balanceOf(address(this));
        if (balance + totalPaid < totalAccounted) revert RewardBalanceDecreased();
        received = balance + totalPaid - totalAccounted;
        totalAccounted += received;
        uint256 distributable = received + remainder;
        accPerShare += distributable / SHARE_COUNT;
        remainder = distributable % SHARE_COUNT;
        emit RewardsSynced(received, totalAccounted, accPerShare, remainder);
    }

    function _harvest() internal {
        // Account direct donations separately before measuring Mining inflow.
        _sync();
        IMining mining = IMining(_config.mining);
        bytes32 key = mining.minerKey(_config.collection, _terms.tokenId);
        // Mining may settle new rewards inside claim even when cached pending is zero.
        // Propagate claim failures; account only the BEM actually received below.
        mining.claim(key);
        uint256 received = _sync();
        emit Harvested(msg.sender, received);
    }

    function _claim(uint256[] memory ids) internal {
        _checkOwned(ids);
        _sync();
        uint256 amount;
        for (uint256 i; i < ids.length; ++i) {
            uint256 due = accPerShare - claimed[ids[i]];
            claimed[ids[i]] = accPerShare;
            amount += due;
            emit RewardClaimed(msg.sender, ids[i], due);
        }
        _pay(msg.sender, amount);
    }

    function _pay(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        uint256 beforeBalance = IERC20(_config.bem).balanceOf(address(this));
        uint256 recipientBefore = IERC20(_config.bem).balanceOf(recipient);
        totalPaid += amount;
        IERC20(_config.bem).safeTransfer(recipient, amount);
        // Ordinary, non-rebasing BEM only. An unexpected sender balance decrease rolls back.
        if (
            IERC20(_config.bem).balanceOf(address(this)) != beforeBalance - amount
                || IERC20(_config.bem).balanceOf(recipient) != recipientBefore + amount
        ) revert RewardBalanceDecreased();
    }

    function redeemMiner() external nonReentrant {
        _requireActive();
        _requireAll();
        _harvest();
        uint256 dust = remainder;
        uint256 amount = dust;
        remainder = 0;
        for (uint256 id = 1; id <= SHARE_COUNT; ++id) {
            uint256 due = accPerShare - claimed[id];
            claimed[id] = accPerShare;
            amount += due;
            emit RewardClaimed(msg.sender, id, due);
        }
        _close();
        _pay(msg.sender, amount);
        _deliverMiner();
        emit Redeemed(msg.sender, true, amount, dust);
    }

    function redeemWithoutHarvest() external nonReentrant {
        _requireActive();
        _requireAll();
        _close();
        _deliverMiner();
        emit Redeemed(msg.sender, false, 0, 0);
    }

    function claimResidual(address recipient) external nonReentrant {
        if (state != Types.State.REDEEMED || msg.sender != redeemedBeneficiary) revert Unauthorized();
        if (recipient == address(0) || recipient == address(this)) revert InvalidTerms();
        uint256 balance = IERC20(_config.bem).balanceOf(address(this));
        if (balance + totalPaid < totalAccounted) revert RewardBalanceDecreased();
        uint256 received = balance + totalPaid - totalAccounted;
        totalAccounted += received;
        remainder = 0;
        emit RewardsSynced(received, totalAccounted, accPerShare, 0);
        _pay(recipient, balance);
        emit ResidualClaimed(msg.sender, recipient, balance);
    }

    function _close() internal {
        state = Types.State.REDEEMED;
        redeemedBeneficiary = msg.sender;
        soldCount = 0;
        uint256[] memory ids = new uint256[](SHARE_COUNT);
        for (uint256 i; i < SHARE_COUNT; ++i) {
            ids[i] = i + 1;
        }
        _burnBatch(msg.sender, ids, _ones(SHARE_COUNT));
    }

    function _deliverMiner() internal {
        IERC721(_config.collection).safeTransferFrom(address(this), msg.sender, _terms.tokenId);
        if (IERC721(_config.collection).ownerOf(_terms.tokenId) != msg.sender) revert UnexpectedNFT();
    }

    function _requireAll() internal view {
        for (uint256 id = 1; id <= SHARE_COUNT; ++id) {
            if (_holders[id] != msg.sender || balanceOf(msg.sender, id) != 1) revert NotHolder();
        }
    }

    function _requireActive() internal view {
        if (state != Types.State.ACTIVE) revert InvalidState();
    }

    function _checkId(uint256 id) internal pure {
        if (id == 0 || id > SHARE_COUNT) revert InvalidIds();
    }

    function _checkIds(uint256[] memory ids) internal pure {
        if (ids.length == 0 || ids.length > SHARE_COUNT) revert InvalidIds();
        uint256 bits;
        for (uint256 i; i < ids.length; ++i) {
            _checkId(ids[i]);
            uint256 bit = 1 << (ids[i] - 1);
            if (bits & bit != 0) revert InvalidIds();
            bits |= bit;
        }
    }

    function _checkOwned(uint256[] memory ids) internal view {
        _checkIds(ids);
        for (uint256 i; i < ids.length; ++i) {
            if (_holders[ids[i]] != msg.sender || balanceOf(msg.sender, ids[i]) != 1) revert NotHolder();
        }
    }

    function _ones(uint256 count) internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            amounts[i] = 1;
        }
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes memory data)
        public
        override
        nonReentrant
    {
        super.safeTransferFrom(from, to, id, value, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values,
        bytes memory data
    ) public override nonReentrant {
        _checkIds(ids);
        super.safeBatchTransferFrom(from, to, ids, values, data);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0) && to != address(0) && state != Types.State.ACTIVE) {
            revert InvalidState();
        }
        for (uint256 i; i < ids.length; ++i) {
            _checkId(ids[i]);
            if (values[i] > 1) revert InvalidIds();
        }
        super._update(from, to, ids, values);
        for (uint256 i; i < ids.length; ++i) {
            if (values[i] == 0) continue;
            _holders[ids[i]] = to;
            uint256 bit = 1 << (ids[i] - 1);
            if (to == address(0)) soldBitmap &= ~bit;
            else soldBitmap |= bit;
        }
    }

    function onERC721Received(address, address from, uint256 tokenId, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (
            state != Types.State.PURCHASING || msg.sender != _config.collection || from != _terms.seller
                || tokenId != _terms.tokenId
        ) revert UnexpectedNFT();
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        emit UnexpectedNativeReceived(msg.sender, msg.value);
    }
}
