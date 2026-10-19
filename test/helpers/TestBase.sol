// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {GroupBuyVault} from "../../src/GroupBuyVault.sol";
import {GroupBuyFactory} from "../../src/GroupBuyFactory.sol";
import {GovernanceTimelock} from "../../src/GovernanceTimelock.sol";
import {Types} from "../../src/Types.sol";
import {MockNFT, MockBEM, MockMining, MockCircuitMarket} from "./Mocks.sol";

abstract contract TestBase is Test {
    GroupBuyFactory internal factory;
    GroupBuyVault internal template;
    GroupBuyVault internal vault;
    GovernanceTimelock internal timelock;
    MockNFT internal nft;
    MockBEM internal bem;
    MockMining internal mining;
    MockCircuitMarket internal market;
    Types.Config internal config;
    Types.Terms internal terms;
    bytes internal payload;
    bytes32 internal configHash;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA201);
    address internal dave = address(0xDA7E);
    address internal seller = address(0x5E11E2);
    address internal guardian = address(0x6A2D);
    uint256 internal constant TOKEN_ID = 3204;
    uint256 internal constant PRICE = 1 ether + 57;

    function setUp() public virtual {
        vm.chainId(56);
        vm.warp(100000);
        nft = new MockNFT();
        bem = new MockBEM();
        mining = new MockMining(bem);
        market = new MockCircuitMarket();
        nft.mint(seller, TOKEN_ID);
        vm.prank(seller);
        nft.setApprovalForAll(address(market), true);
        market.list(1, seller, address(nft), TOKEN_ID, uint96(PRICE), 100);
        template = new GroupBuyVault();
        address[] memory roles = new address[](1);
        roles[0] = address(this);
        timelock = new GovernanceTimelock(1, roles, roles);
        GroupBuyFactory implementation = new GroupBuyFactory();
        factory = GroupBuyFactory(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(GroupBuyFactory.initialize, (address(timelock), guardian, 1))
                )
            )
        );
        config = Types.Config(
            56,
            1,
            Types.MarketKind.MOCK_CIRCUIT,
            address(market),
            address(nft),
            address(mining),
            address(bem),
            address(market).codehash,
            0,
            0,
            60,
            true
        );
        payload = "";
        terms = Types.Terms(
            seller,
            TOKEN_ID,
            PRICE,
            uint64(block.timestamp + 1 days),
            0,
            0,
            1,
            uint96(PRICE),
            100,
            keccak256(payload),
            0,
            0,
            "tapeout3204",
            "ipfs://local/3204/{id}.json"
        );
        configHash = keccak256(abi.encode(config));
        address[] memory targets = new address[](4);
        uint256[] memory values = new uint256[](4);
        bytes[] memory calls = new bytes[](4);
        for (uint256 i; i < 4; i++) {
            targets[i] = address(factory);
        }
        calls[0] = abi.encodeCall(
            GroupBuyFactory.approveTemplate, (address(template), 1, address(template).codehash)
        );
        calls[1] = abi.encodeCall(GroupBuyFactory.approveConfig, (config));
        calls[2] = abi.encodeCall(GroupBuyFactory.selectConfiguration, (address(template), configHash));
        calls[3] = abi.encodeCall(GroupBuyFactory.resumeCreation, ());
        bytes32 setupSalt = keccak256("INITIAL_CONFIGURATION");
        timelock.scheduleBatch(targets, values, calls, bytes32(0), setupSalt, 1);
        vm.warp(block.timestamp + 1);
        timelock.executeBatch(targets, values, calls, bytes32(0), setupSalt);
        vault = GroupBuyVault(payable(factory.createPool(address(template), configHash, terms, payload, 1)));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
    }

    function ids(uint256 start, uint256 end) internal pure returns (uint256[] memory result) {
        result = new uint256[](end - start + 1);
        for (uint256 i; i < result.length; i++) {
            result[i] = start + i;
        }
    }

    function ones(uint256 n) internal pure returns (uint256[] memory result) {
        result = new uint256[](n);
        for (uint256 i; i < n; i++) {
            result[i] = 1;
        }
    }

    function cost(uint256[] memory shares) internal view returns (uint256 result) {
        for (uint256 i; i < shares.length; i++) {
            result += vault.costOf(shares[i]);
        }
    }

    function contribute(address who, uint256 first, uint256 last, bool complete) internal {
        uint256[] memory shares = ids(first, last);
        uint256 value = cost(shares);
        vm.prank(who);
        vault.contribute{value: value}(shares, complete, payload);
    }

    function activate() internal {
        contribute(alice, 1, 45, false);
        contribute(bob, 46, 100, true);
    }

    function consolidate() internal {
        vm.prank(bob);
        vault.safeBatchTransferFrom(bob, alice, ids(46, 100), ones(55), "");
    }
}
