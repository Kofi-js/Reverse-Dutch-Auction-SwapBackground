import { ethers } from "hardhat";
import fs from "fs";

// Utility function to get deployed addresses
async function getDeployedAddresses() {
  const network = process.env.HARDHAT_NETWORK || "hardhat";
  const deploymentPath = `./deployments/${network}.json`;
  
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment found for network ${network}`);
  }
  
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

// Check auction status
async function checkAuctionStatus() {
  const { auction: auctionAddress, token: tokenAddress } = await getDeployedAddresses();
  
  const auction = await ethers.getContractAt("ReverseDutchAuction", auctionAddress);
  const token = await ethers.getContractAt("IERC20", tokenAddress);
  
  const seller = await auction.seller();
  const initialPrice = await auction.startingPrice();
  const currentPrice = await auction.currentPrice();
  const startTime = await auction.auctionStart();
  const duration = await auction.auctionDuration();
  const hasEnded = await auction.auctionEnded();
  
  // Calculate time remaining
  const currentTime = Math.floor(Date.now() / 1000);
  const endTime = Number(startTime) + Number(duration);
  const timeRemaining = endTime - currentTime;
  
  console.log("\n=== Auction Status ===");
  console.log(`Seller: ${seller}`);
  console.log(`Token Address: ${tokenAddress}`);
  console.log(`Initial Price: ${ethers.formatEther(initialPrice)} ETH`);
  console.log(`Current Price: ${ethers.formatEther(currentPrice)} ETH`);
  console.log(`Start Time: ${new Date(Number(startTime) * 1000).toLocaleString()}`);
  console.log(`End Time: ${new Date(endTime * 1000).toLocaleString()}`);
  console.log(`Time Remaining: ${timeRemaining > 0 ? `${timeRemaining} seconds` : "Auction ended"}`);
  console.log(`Auction Ended: ${hasEnded}`);
  
  // Check token balance of the auction contract
  const auctionBalance = await token.balanceOf(auctionAddress);
  console.log(`Token Balance in Auction: ${ethers.formatEther(auctionBalance)}`);
  
  return { auction, token, currentPrice, hasEnded };
}

// Participate in the auction (buy)
async function buyFromAuction() {
  const [signer] = await ethers.getSigners();
  const { auction, token, currentPrice, hasEnded } = await checkAuctionStatus();
  
  if (hasEnded) {
    console.log("Cannot buy: Auction has already ended.");
    return;
  }
  
  if (currentPrice <= 0n) {
    console.log("Cannot buy: Price has reached zero.");
    return;
  }
  
  // First, approve the token for spending
  const approveTx = await token.connect(signer).approve(await auction.getAddress(), currentPrice);
  await approveTx.wait();
  console.log(`Approved ${ethers.formatEther(currentPrice)} tokens for auction`);
  
  // Then buy from the auction
  try {
    const buyTx = await auction.connect(signer).buy();
    const receipt = await buyTx.wait();
    
    // Find AuctionEnded event
    const auctionEndedEvent = receipt?.logs
      .filter((log: any) => log.fragment?.name === "AuctionEnded")
      .map((log: any) => auction.interface.parseLog(log));
    
    if (auctionEndedEvent && auctionEndedEvent.length > 0) {
      const { buyer, price } = auctionEndedEvent[0].args;
      console.log(`\nSuccessfully purchased from auction!`);
      console.log(`Buyer: ${buyer}`);
      console.log(`Final Price: ${ethers.formatEther(price)} ETH`);
      console.log(`Transaction: ${receipt?.hash}`);
    } else {
      console.log(`\nTransaction completed: ${receipt?.hash}`);
    }
  } catch (error: any) {
    console.error(`Failed to buy from auction: ${error.message}`);
  }
}

// End the auction after it has expired
async function endExpiredAuction() {
  const [signer] = await ethers.getSigners();
  const { auction, hasEnded } = await checkAuctionStatus();
  
  if (hasEnded) {
    console.log("Cannot end: Auction has already ended.");
    return;
  }
  
  try {
    const endTx = await auction.connect(signer).endAuction();
    const receipt = await endTx.wait();
    console.log(`\nAuction ended successfully!`);
    console.log(`Transaction: ${receipt?.hash}`);
  } catch (error: any) {
    console.error(`Failed to end auction: ${error.message}`);
  }
}

// Fund a buyer with tokens
async function fundBuyerWithTokens(buyerAddress: string, amount: string) {
  const { token: tokenAddress } = await getDeployedAddresses();
  const token = await ethers.getContractAt("ERC20Mock", tokenAddress);
  
  const amountWei = ethers.parseEther(amount);
  const tx = await token.transfer(buyerAddress, amountWei);
  await tx.wait();
  
  const newBalance = await token.balanceOf(buyerAddress);
  console.log(`\nSuccessfully funded ${buyerAddress}`);
  console.log(`New token balance: ${ethers.formatEther(newBalance)}`);
}

// Main function to run interactions
async function main() {
  try {
    // 1. Check current auction status
    console.log("\nChecking auction status...");
    await checkAuctionStatus();

    // 2. Fund a second account (for testing buying)
    const [, buyer] = await ethers.getSigners();
    const buyerAddress = await buyer.getAddress();
    console.log("\nFunding buyer account...");
    await fundBuyerWithTokens(buyerAddress, "5");

    // 3. Wait for price to decrease a bit (optional in real environment)
    console.log("\nWaiting for price to decrease...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 4. Buy from the auction
    console.log("\nAttempting to buy from auction...");
    await buyFromAuction();

    // 5. If auction is still active, we could manually end it
    // Commented out as it would fail if the auction was bought in step 4
    // console.log("\nAttempting to end auction...");
    // await endExpiredAuction();

    console.log("\nInteraction script completed!");

  } catch (error) {
    console.error("Error:", error);
    process.exitCode = 1;
  }
}

// Execute if running this script directly
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { checkAuctionStatus, buyFromAuction, endExpiredAuction, fundBuyerWithTokens };