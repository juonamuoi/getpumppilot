// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * PumpPilot Token (PUMP)
 * ----------------------
 * A minimal, dependency-free ERC-20 with a hard cap and a single distributor
 * role used to settle off-chain PUMP reward balances on-chain.
 *
 * IMPORTANT — READ BEFORE DEPLOYING
 * - Deploy this yourself from a wallet you control. PumpPilot never holds your keys.
 * - Get it audited before any public distribution or liquidity.
 * - A transferable token may be a regulated instrument in your jurisdiction.
 *   Take legal advice before selling it, listing it, or promising any return.
 * - Nothing here creates an entitlement to profit. PUMP is a utility/reward token.
 */
contract PumpToken {
    string public constant name = "PumpPilot Token";
    string public constant symbol = "PUMP";
    uint8 public constant decimals = 18;

    /// Hard cap: 1,000,000,000 PUMP. Cannot ever be raised.
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;

    uint256 public totalSupply;
    address public owner;
    /// Allowed to mint reward claims (set this to your settlement backend wallet).
    address public distributor;
    /// Once renounced, minting is permanently disabled.
    bool public mintingRenounced;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    /// Prevents replaying the same off-chain claim reference twice.
    mapping(bytes32 => bool) public claimUsed;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event DistributorChanged(address indexed previous, address indexed next);
    event RewardClaimed(bytes32 indexed claimRef, address indexed to, uint256 amount);
    event MintingRenounced();

    modifier onlyOwner() {
        require(msg.sender == owner, "PUMP: not owner");
        _;
    }

    constructor(address treasury, uint256 initialSupply) {
        require(treasury != address(0), "PUMP: zero treasury");
        require(initialSupply <= MAX_SUPPLY, "PUMP: over cap");
        owner = msg.sender;
        distributor = msg.sender;
        if (initialSupply > 0) {
            totalSupply = initialSupply;
            balanceOf[treasury] = initialSupply;
            emit Transfer(address(0), treasury, initialSupply);
        }
        emit OwnerChanged(address(0), msg.sender);
    }

    // --- ERC-20 ---

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "PUMP: allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function burn(uint256 value) external {
        require(balanceOf[msg.sender] >= value, "PUMP: balance");
        balanceOf[msg.sender] -= value;
        totalSupply -= value;
        emit Transfer(msg.sender, address(0), value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "PUMP: zero recipient");
        require(balanceOf[from] >= value, "PUMP: balance");
        unchecked {
            balanceOf[from] -= value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    // --- Reward settlement ---

    /**
     * Mints an off-chain PUMP reward on-chain exactly once.
     * `claimRef` is the unique reference from the app ledger.
     */
    function claimReward(bytes32 claimRef, address to, uint256 amount) external {
        require(msg.sender == distributor, "PUMP: not distributor");
        require(!mintingRenounced, "PUMP: minting closed");
        require(!claimUsed[claimRef], "PUMP: claim used");
        require(to != address(0), "PUMP: zero recipient");
        require(totalSupply + amount <= MAX_SUPPLY, "PUMP: over cap");

        claimUsed[claimRef] = true;
        totalSupply += amount;
        balanceOf[to] += amount;

        emit Transfer(address(0), to, amount);
        emit RewardClaimed(claimRef, to, amount);
    }

    // --- Admin ---

    function setDistributor(address next) external onlyOwner {
        emit DistributorChanged(distributor, next);
        distributor = next;
    }

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "PUMP: zero owner");
        emit OwnerChanged(owner, next);
        owner = next;
    }

    /// Permanently disables further minting. Irreversible.
    function renounceMinting() external onlyOwner {
        mintingRenounced = true;
        emit MintingRenounced();
    }
}
