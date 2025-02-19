import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("ReverseDutchAuction", function () {
  async function deployAuctionFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

    // Deploy token
    const initialSupply = ethers.parseEther("10000");
    const TokenFactory = await ethers.getContractFactory("IERC20");
    const tokenContract = await TokenFactory.deploy("Turbulence", "TBL", initialSupply);
    await tokenContract.waitForDeployment();

    // Deploy auction
    const ReverseDutchAuction = await ethers.getContractFactory("ReverseDutchAuction");
    const auction = await ReverseDutchAuction.deploy(
      await tokenContract.getAddress(),
      ethers.parseEther("1.0"),     
      ethers.parseEther("0.00005"),  // Adjusted for a slower price drop  
      60 * 60                       
    );
    await auction.waitForDeployment();

    // Seller deposits tokens for sale
    const depositAmount = ethers.parseEther("1000");
    await tokenContract.approve(await auction.getAddress(), depositAmount);
    await auction.depositTokens(depositAmount);

    // Transfer some tokens to the buyer account for purchasing
    const buyerTokens = ethers.parseEther("5");
    await tokenContract.transfer(otherAccount.address, buyerTokens);

    return { auction, owner, otherAccount, tokenContract };
  }

  describe("Deployment", function () {
    it("Should set the right starting price", async function () {
      const { auction } = await loadFixture(deployAuctionFixture);
      expect(await auction.startingPrice()).to.equal(ethers.parseEther("1.0"));
    });

    it("Should set the right seller", async function () {
      const { auction, owner } = await loadFixture(deployAuctionFixture);
      expect(await auction.seller()).to.equal(owner.address);
    });

    it("Should have the correct auction start time", async function () {
      const { auction } = await loadFixture(deployAuctionFixture);
      const now = Math.floor(Date.now() / 1000);
      const auctionStart = await auction.auctionStart();
      expect(Number(auctionStart)).to.be.closeTo(now, 10);
    });
  });

  describe("Auction Mechanics", function () {
    describe("Price Decrease", function () {
      it("Should decrease price over time", async function () {
        const { auction } = await loadFixture(deployAuctionFixture);
        const initialPrice = await auction.currentPrice();
        await time.increase(30);  // Increase time by 30 seconds
        const newPrice = await auction.currentPrice();
        expect(newPrice).to.be.lt(initialPrice);
      });
    });

    describe("Buying", function () {
      it("Should allow buying at current price", async function () {
        const { auction, owner, otherAccount, tokenContract } = await loadFixture(deployAuctionFixture);
        const initialBuyerTokenBalance = await tokenContract.balanceOf(otherAccount.address);
        const initialSellerTokenBalance = await tokenContract.balanceOf(owner.address);
        const initialAuctionTokenBalance = await tokenContract.balanceOf(await auction.getAddress());

        // Get the current price
        const currentPrice = await auction.currentPrice();

        // Approve payment tokens
        await tokenContract.connect(otherAccount).approve(await auction.getAddress(), currentPrice);

        // Buyer calls buy
        const tx = await auction.connect(otherAccount).buy();
        await tx.wait();

        const finalBuyerTokenBalance = await tokenContract.balanceOf(otherAccount.address);
        const finalSellerTokenBalance = await tokenContract.balanceOf(owner.address);
        const finalAuctionTokenBalance = await tokenContract.balanceOf(await auction.getAddress());

        // Buyer gained auction tokens but spent payment tokens
        expect(finalBuyerTokenBalance.sub(initialBuyerTokenBalance)).to.be.equal(
          initialAuctionTokenBalance.sub(currentPrice)
        );
        
        // Seller received payment tokens
        expect(finalSellerTokenBalance.sub(initialSellerTokenBalance)).to.be.equal(currentPrice);
        
        // Auction contract should have 0 tokens left
        expect(finalAuctionTokenBalance).to.be.eq(0);
      });

      it("Should revert if auction ended", async function () {
        const { auction, otherAccount, tokenContract } = await loadFixture(deployAuctionFixture);
        // Increase time past auction duration
        await time.increase(60 * 60 + 1);
        
        const price = ethers.parseEther("1.0");
        await tokenContract.connect(otherAccount).approve(await auction.getAddress(), price);
        
        await expect(
          auction.connect(otherAccount).buy()
        ).to.be.revertedWith("Auction has expired.");
      });
    });
  });
});