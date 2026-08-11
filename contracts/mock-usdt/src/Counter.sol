// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Test-only USDT stand-in for BSC Testnet (chain 97). No official Tether
// deployment exists on this testnet -- see progress-tracker.md Open
// Questions. 6 decimals to match real USDT, not the ERC20 default of 18.
contract MockUSDT is ERC20 {
    constructor() ERC20("Test Tether USD", "USDT") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // Anyone can mint more for testing -- this contract has zero value
    // and will never be deployed to mainnet.
    function faucet(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}