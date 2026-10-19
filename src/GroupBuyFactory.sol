// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Types} from "./Types.sol";
import {IGroupBuyVault} from "./interfaces/IGroupBuyVault.sol";

interface ILockedVaultTemplate {
    function templateInitializersDisabled() external view returns (bool);
}

/// @notice Upgradeable registry which never receives participation funds.
/// @dev Governance can change future pools. Existing ERC-1167 clones retain their
///      fixed implementation and only recognize the bounded funding-cancel hook.
contract GroupBuyFactory is Initializable, UUPSUpgradeable {
    error Unauthorized();
    error InvalidGovernance();
    error InvalidTemplate();
    error InvalidConfiguration();
    error CreationPaused();
    error ConfigurationChanged();
    error UnknownPool();
    error PoolAlreadyExists();
    error InvalidPage();
    error BatchTooLarge();

    uint256 public constant MAX_CANCEL_BATCH = 32;
    uint256 public constant MAX_PAGE_SIZE = 100;
    bytes32 public constant VAULT_TEMPLATE_ID = keccak256("TapeOut.GroupBuyVault.v1");

    struct TemplateApproval {
        bytes32 codeHash;
        uint32 version;
        bool approved;
    }

    /// @custom:storage-location erc7201:tapeout.storage.GroupBuyFactory
    struct FactoryStorage {
        address upgradeAdmin;
        address guardian;
        uint256 requiredMinDelay;
        bool creationPaused;
        address selectedTemplate;
        bytes32 selectedConfigHash;
        mapping(address => TemplateApproval) templates;
        mapping(bytes32 => Types.Config) configs;
        mapping(bytes32 => bool) approvedConfigs;
        address[] pools;
        mapping(address => bool) isPool;
    }

    // keccak256(abi.encode(uint256(keccak256("tapeout.storage.GroupBuyFactory")) - 1)) & ~bytes32(uint256(255))
    bytes32 private constant FACTORY_STORAGE =
        0xc909148cda707d8103c1137c3421b949f184aaab255325d2da12f7225afa1b00;

    event GovernanceConfigured(address indexed upgradeAdmin, address indexed guardian, uint256 minimumDelay);
    event TemplateApproved(address indexed template, uint32 version, bytes32 codeHash);
    event ConfigurationApproved(bytes32 indexed configHash, uint32 version, Types.MarketKind marketKind);
    event ConfigurationSelected(address indexed template, bytes32 indexed configHash);
    event CreationPauseChanged(bool paused, address indexed caller);
    event FundingCancelRequested(address indexed vault, uint8 reasonCode, address indexed guardian);
    event PoolCreated(
        address indexed vault,
        address indexed creator,
        address indexed template,
        bytes32 configHash,
        bytes32 termsHash,
        uint256 round,
        bytes32 salt,
        bytes orderPayload
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(address timelock, address guardian_, uint256 requiredMinDelay_) external initializer {
        if (
            timelock.code.length == 0 || guardian_ == address(0) || guardian_ == timelock
                || requiredMinDelay_ == 0
        ) {
            revert InvalidGovernance();
        }
        // These checks reject accidental EOA/bare-owner configurations. They are not
        // a substitute for pinning and reviewing governance bytecode/roles at release.
        if (
            !IERC165(timelock).supportsInterface(type(IAccessControl).interfaceId)
                || TimelockController(payable(timelock)).getMinDelay() < requiredMinDelay_
                || !TimelockController(payable(timelock)).hasRole(bytes32(0), timelock)
                || TimelockController(payable(timelock)).hasRole(keccak256("PROPOSER_ROLE"), guardian_)
                || TimelockController(payable(timelock)).hasRole(bytes32(0), guardian_)
        ) revert InvalidGovernance();
        __UUPSUpgradeable_init();
        FactoryStorage storage s = _store();
        s.upgradeAdmin = timelock;
        s.guardian = guardian_;
        s.requiredMinDelay = requiredMinDelay_;
        s.creationPaused = true;
        emit GovernanceConfigured(timelock, guardian_, requiredMinDelay_);
    }

    modifier onlyAdmin() {
        FactoryStorage storage s = _store();
        if (msg.sender != s.upgradeAdmin) revert Unauthorized();
        if (TimelockController(payable(s.upgradeAdmin)).getMinDelay() < s.requiredMinDelay) {
            revert InvalidGovernance();
        }
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != _store().guardian) revert Unauthorized();
        _;
    }

    function approveTemplate(address template, uint32 version, bytes32 expectedCodeHash) external onlyAdmin {
        if (
            version == 0 || template.code.length == 0 || template.codehash != expectedCodeHash
                || IGroupBuyVault(template).implementationSelf() != template
                || IGroupBuyVault(template).vaultTemplateId() != VAULT_TEMPLATE_ID
                || !ILockedVaultTemplate(template).templateInitializersDisabled()
        ) revert InvalidTemplate();
        _store().templates[template] = TemplateApproval(expectedCodeHash, version, true);
        emit TemplateApproved(template, version, expectedCodeHash);
    }

    function approveConfig(Types.Config calldata config) external onlyAdmin returns (bytes32 configHash) {
        if (
            config.chainId != 56 || block.chainid != 56 || config.templateVersion == 0
                || config.market.code.length == 0 || config.collection.code.length == 0
                || config.mining.code.length == 0 || config.bem.code.length == 0
                || config.market.codehash != config.marketCodeHash
                || config.marketKind == Types.MarketKind.CIRCUIT_RESERVED
                || (config.marketKind == Types.MarketKind.MOCK_CIRCUIT && !config.mockOnly)
        ) revert InvalidConfiguration();
        configHash = hashConfig(config);
        FactoryStorage storage s = _store();
        s.configs[configHash] = config;
        s.approvedConfigs[configHash] = true;
        emit ConfigurationApproved(configHash, config.templateVersion, config.marketKind);
    }

    function selectConfiguration(address template, bytes32 configHash) external onlyAdmin {
        FactoryStorage storage s = _store();
        TemplateApproval storage approved = s.templates[template];
        if (
            !approved.approved || approved.codeHash != template.codehash || !s.approvedConfigs[configHash]
                || approved.version != s.configs[configHash].templateVersion
        ) revert InvalidConfiguration();
        s.selectedTemplate = template;
        s.selectedConfigHash = configHash;
        emit ConfigurationSelected(template, configHash);
    }

    function pauseCreation() external onlyGuardian {
        _store().creationPaused = true;
        emit CreationPauseChanged(true, msg.sender);
    }

    function resumeCreation() external onlyAdmin {
        FactoryStorage storage s = _store();
        if (s.selectedTemplate == address(0) || !s.approvedConfigs[s.selectedConfigHash]) {
            revert InvalidConfiguration();
        }
        s.creationPaused = false;
        emit CreationPauseChanged(false, msg.sender);
    }

    function createPool(
        address expectedTemplate,
        bytes32 expectedConfigHash,
        Types.Terms calldata terms,
        bytes calldata payload,
        uint256 round
    ) external returns (address vault) {
        FactoryStorage storage s = _store();
        if (s.creationPaused) revert CreationPaused();
        if (expectedTemplate != s.selectedTemplate || expectedConfigHash != s.selectedConfigHash) {
            revert ConfigurationChanged();
        }
        TemplateApproval storage approved = s.templates[expectedTemplate];
        if (!approved.approved || expectedTemplate.codehash != approved.codeHash) revert InvalidTemplate();
        bytes32 salt = poolSalt(msg.sender, expectedTemplate, expectedConfigHash, terms, payload, round);
        address predicted = Clones.predictDeterministicAddress(expectedTemplate, salt, address(this));
        if (s.isPool[predicted] || predicted.code.length != 0) revert PoolAlreadyExists();
        vault = Clones.cloneDeterministic(expectedTemplate, salt);
        IGroupBuyVault(vault)
            .initialize(address(this), msg.sender, s.configs[expectedConfigHash], terms, payload);
        // Registration happens only after successful initialization; a revert rolls
        // back creation itself, preventing uninitialized clones or burned salts.
        s.isPool[vault] = true;
        s.pools.push(vault);
        emit PoolCreated(
            vault, msg.sender, expectedTemplate, expectedConfigHash, hashTerms(terms), round, salt, payload
        );
    }

    function guardianCancel(address vault, uint8 reasonCode) external onlyGuardian {
        _cancel(vault, reasonCode);
    }

    function guardianCancelBatch(address[] calldata vaults, uint8 reasonCode) external onlyGuardian {
        if (vaults.length == 0 || vaults.length > MAX_CANCEL_BATCH) revert BatchTooLarge();
        for (uint256 i; i < vaults.length; ++i) {
            _cancel(vaults[i], reasonCode);
        }
    }

    function _cancel(address vault, uint8 reasonCode) private {
        if (!_store().isPool[vault]) revert UnknownPool();
        IGroupBuyVault(vault).factoryCancelFunding(reasonCode);
        emit FundingCancelRequested(vault, reasonCode, msg.sender);
    }

    function getPools(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        FactoryStorage storage s = _store();
        if (limit == 0 || limit > MAX_PAGE_SIZE || offset > s.pools.length) revert InvalidPage();
        uint256 count = s.pools.length - offset;
        if (count > limit) count = limit;
        page = new address[](count);
        for (uint256 i; i < count; ++i) {
            page[i] = s.pools[offset + i];
        }
    }

    function poolSalt(
        address creator,
        address template,
        bytes32 configHash,
        Types.Terms calldata terms,
        bytes calldata payload,
        uint256 round
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid, creator, template, configHash, hashTerms(terms), keccak256(payload), round
            )
        );
    }

    function predictPool(
        address creator,
        address template,
        bytes32 configHash,
        Types.Terms calldata terms,
        bytes calldata payload,
        uint256 round
    ) external view returns (address) {
        return Clones.predictDeterministicAddress(
            template, poolSalt(creator, template, configHash, terms, payload, round), address(this)
        );
    }

    function hashConfig(Types.Config calldata config) public pure returns (bytes32) {
        return keccak256(abi.encode(config));
    }

    function hashTerms(Types.Terms calldata terms) public pure returns (bytes32) {
        return keccak256(abi.encode(terms));
    }

    function upgradeAdmin() external view returns (address) {
        return _store().upgradeAdmin;
    }

    function guardian() external view returns (address) {
        return _store().guardian;
    }

    function requiredMinDelay() external view returns (uint256) {
        return _store().requiredMinDelay;
    }

    function creationPaused() external view returns (bool) {
        return _store().creationPaused;
    }

    function selectedTemplate() external view returns (address) {
        return _store().selectedTemplate;
    }

    function selectedConfigHash() external view returns (bytes32) {
        return _store().selectedConfigHash;
    }

    function poolCount() external view returns (uint256) {
        return _store().pools.length;
    }

    function isPool(address vault) external view returns (bool) {
        return _store().isPool[vault];
    }

    function templateApproval(address template) external view returns (TemplateApproval memory) {
        return _store().templates[template];
    }

    function configuration(bytes32 configHash)
        external
        view
        returns (Types.Config memory config, bool approved)
    {
        FactoryStorage storage s = _store();
        return (s.configs[configHash], s.approvedConfigs[configHash]);
    }

    function _authorizeUpgrade(address) internal override onlyAdmin {}

    function _store() private pure returns (FactoryStorage storage s) {
        bytes32 slot = FACTORY_STORAGE;
        assembly { s.slot := slot }
    }
}
