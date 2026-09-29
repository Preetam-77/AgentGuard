// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentGuard {
    uint256 public dailyLimit;

    mapping(address => bool) public allowedContracts;

    constructor(uint256 _dailyLimit) {
        dailyLimit = _dailyLimit;
    }

    function setDailyLimit(uint256 _dailyLimit) external {
        dailyLimit = _dailyLimit;
    }

    function addAllowedContract(address contractAddress) external {
        allowedContracts[contractAddress] = true;
    }

    function removeAllowedContract(address contractAddress) external {
        allowedContracts[contractAddress] = false;
    }

    function isAllowedContract(address contractAddress)
        external
        view
        returns (bool)
    {
        return allowedContracts[contractAddress];
    }

    function checkTransaction(
        uint256 amount,
        address contractAddress
    ) external view returns (bool) {
        if (amount > dailyLimit) {
            return false;
        }

        if (!allowedContracts[contractAddress]) {
            return false;
        }

        return true;
    }
}