// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReverseDutchAuction {
    IERC20 public tokenForSale;      // Token being sold
    IERC20 public paymentToken;      // Token used for payment
    address public seller;
    uint256 public startingPrice;
    uint256 public priceDecreasePerSecond;
    uint256 public auctionStart;
    uint256 public auctionDuration;
    bool public auctionEnded;
    uint256 public tokensForSale;
    
    event AuctionEnded(address buyer, uint256 price);
    event TokensDeposited(uint256 amount);

    constructor(
        address _tokenToSell,
        uint256 _startingPrice, 
        uint256 _priceDecreasePerSecond, 
        uint256 _auctionDuration
    ) {
        tokenForSale = IERC20(_tokenToSell);
        paymentToken = IERC20(_tokenToSell); // Same token for sale and payment
        startingPrice = _startingPrice;
        priceDecreasePerSecond = _priceDecreasePerSecond;
        auctionStart = block.timestamp;
        auctionDuration = _auctionDuration;
        seller = msg.sender;
        auctionEnded = false;
    }

    function depositTokens(uint256 amount) external {
        require(msg.sender == seller, "Only seller can deposit tokens");
        require(!auctionEnded, "Auction has already ended");
        require(tokenForSale.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        tokensForSale += amount;
        emit TokensDeposited(amount);
    }

    function currentPrice() public view returns (uint256) {
        uint256 elapsed = block.timestamp - auctionStart;
        if (elapsed >= auctionDuration) return 0;
        
        uint256 decrease = elapsed * priceDecreasePerSecond;
        if (decrease >= startingPrice) return 0;
        return startingPrice - decrease;
    }

    function buy() external {
        require(!auctionEnded, "Auction has already ended.");
        require(block.timestamp < auctionStart + auctionDuration, "Auction has expired.");
        
        uint256 price = currentPrice();
        require(price > 0, "Auction has expired.");
        require(tokensForSale > 0, "No tokens for sale");

        // Transfer payment tokens from buyer to seller
        require(paymentToken.transferFrom(msg.sender, seller, price), "Payment transfer failed");
        
        // Transfer all available tokens to the buyer
        uint256 tokenAmount = tokenForSale.balanceOf(address(this));
        require(tokenForSale.transfer(msg.sender, tokenAmount), "Token transfer failed");

        auctionEnded = true;
        emit AuctionEnded(msg.sender, price);
    }

    function endAuction() external {
        require(block.timestamp >= auctionStart + auctionDuration, "Auction still active");
        require(!auctionEnded, "Auction was already ended or bought.");
        
        // Return unsold tokens to seller
        uint256 remainingTokens = tokenForSale.balanceOf(address(this));
        if (remainingTokens > 0) {
            require(tokenForSale.transfer(seller, remainingTokens), "Token return failed");
        }
        
        auctionEnded = true;
    }
}