// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract MockNFT is ERC721 {
    bool public broken;
    constructor() ERC721("Local miner", "MINER") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }

    function setBroken(bool flag) external {
        broken = flag;
    }

    function transferFrom(address from, address to, uint256 id) public override {
        require(!broken, "NFT_BROKEN");
        super.transferFrom(from, to, id);
    }
}

contract MockBEM is ERC20 {
    bool public brokenBalance;
    bool public brokenTransfer;
    bool public taxed;
    constructor() ERC20("Local BEM", "BEM") {}

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    function mint(address to, uint256 n) external {
        _mint(to, n);
    }

    function burn(address from, uint256 n) external {
        _burn(from, n);
    }

    function setFaults(bool balanceFault, bool transferFault, bool tax) external {
        brokenBalance = balanceFault;
        brokenTransfer = transferFault;
        taxed = tax;
    }

    function balanceOf(address a) public view override returns (uint256) {
        require(!brokenBalance, "BEM_BALANCE_BROKEN");
        return super.balanceOf(a);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        require(!brokenTransfer, "BEM_TRANSFER_BROKEN");
        if (taxed && value > 0) {
            _burn(msg.sender, 1);
            return super.transfer(to, value - 1);
        }
        return super.transfer(to, value);
    }
}

contract MockMining {
    MockBEM public bem;
    bool public broken;
    bool public zeroReverts;
    uint256 public claims;
    address public lastCaller;
    mapping(bytes32 => uint256) public rewards;
    mapping(bytes32 => uint256) public unsettledRewards;
    mapping(bytes32 => address) public collections;
    mapping(bytes32 => uint256) public tokenIds;

    constructor(MockBEM token) {
        bem = token;
    }

    function minerKey(address collection, uint256 tokenId) public pure returns (bytes32) {
        return keccak256(abi.encode(collection, tokenId));
    }

    function setPending(address collection, uint256 tokenId, uint256 amount) external {
        bytes32 k = minerKey(collection, tokenId);
        rewards[k] = amount;
        collections[k] = collection;
        tokenIds[k] = tokenId;
    }

    function setBroken(bool flag) external {
        broken = flag;
    }

    function setZeroReverts(bool flag) external {
        zeroReverts = flag;
    }

    function setUnsettledRewards(address collection, uint256 tokenId, uint256 amount) external {
        bytes32 k = minerKey(collection, tokenId);
        unsettledRewards[k] = amount;
        collections[k] = collection;
        tokenIds[k] = tokenId;
    }

    function pending(bytes32 k) external view returns (uint256) {
        require(!broken, "MINING_BROKEN");
        return rewards[k];
    }

    function claim(bytes32 k) external {
        require(!broken, "MINING_BROKEN");
        uint256 n = rewards[k] + unsettledRewards[k];
        require(n > 0 || !zeroReverts, "ZERO_REWARDS");
        rewards[k] = 0;
        unsettledRewards[k] = 0;
        claims++;
        lastCaller = msg.sender;
        if (n == 0) return;
        bem.mint(IERC721(collections[k]).ownerOf(tokenIds[k]), n);
    }
}

/// @notice A deliberately separate local model, NOT the unknown live CircuitMarket ABI.
contract MockCircuitMarket {
    struct Listing {
        address seller;
        address collection;
        uint256 tokenId;
        uint96 price;
        uint16 feeBps;
        bool active;
    }
    mapping(uint256 => Listing) public listings;
    mapping(address => mapping(uint256 => uint256)) public current;
    bool public brokenRead;
    uint8 public badPurchase;
    bool public safeDelivery;
    address public lastBuyer;
    uint256 public lastValue;

    function list(
        uint256 id,
        address seller,
        address collection,
        uint256 tokenId,
        uint96 price,
        uint16 feeBps
    ) external {
        listings[id] = Listing(seller, collection, tokenId, price, feeBps, true);
        current[collection][tokenId] = id;
    }

    function cancel(uint256 id) external {
        listings[id].active = false;
    }

    function setPrice(uint256 id, uint96 price) external {
        listings[id].price = price;
    }

    function setFaults(bool readFault, uint8 purchaseFault, bool safe) external {
        brokenRead = readFault;
        badPurchase = purchaseFault;
        safeDelivery = safe;
    }

    function listingView(uint256 id) external view returns (address, address, uint256, uint96, uint16, bool) {
        require(!brokenRead, "READ_FAILED");
        Listing memory l = listings[id];
        return (l.seller, l.collection, l.tokenId, l.price, l.feeBps, l.active);
    }

    function listingFor(address collection, uint256 tokenId)
        external
        view
        returns (uint256, address, uint96, bool)
    {
        require(!brokenRead, "READ_FAILED");
        uint256 id = current[collection][tokenId];
        Listing memory l = listings[id];
        return (id, l.seller, l.price, l.active);
    }

    function buy(uint256 id, uint96 expectedPrice) external payable {
        Listing storage l = listings[id];
        require(l.active && l.price == expectedPrice && msg.value == expectedPrice, "BAD_BUY");
        lastBuyer = msg.sender;
        lastValue = msg.value;
        require(badPurchase != 1, "BUY_FAILED");
        l.active = false;
        if (badPurchase != 2) {
            address to = badPurchase == 3 ? address(0xBAD) : msg.sender;
            if (safeDelivery) IERC721(l.collection).safeTransferFrom(l.seller, to, l.tokenId);
            else IERC721(l.collection).transferFrom(l.seller, to, l.tokenId);
        }
        (bool ok,) = payable(l.seller).call{value: msg.value}("");
        require(ok, "SELLER_REJECTED");
    }
}

contract ForceBNB {
    constructor(address payable recipient) payable {
        selfdestruct(recipient);
    }
}
