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
  console.log(`Initial Price: ${ethers.formatEther(initialPrice)} TBL`);
  console.log(`Current Price: ${ethers.formatEther(currentPrice)} TBL`);
  console.log(`Start Time: ${new Date(Number(startTime) * 1000).toLocaleString()}`);
  console.log(`End Time: ${new Date(endTime * 1000).toLocaleString()}`);
  console.log(`Time Remaining: ${timeRemaining > 0 ? `${timeRemaining} seconds` : "Auction ended"}`);
  console.log(`Auction Ended: ${hasEnded}`);
  
  // Check token balance of the auction contract
  const auctionBalance = await token.balanceOf(auctionAddress);
  console.log(`Token Balance in Auction: ${ethers.formatEther(auctionBalance)} TBL`);
  
  return { auction, token, currentPrice, hasEnded, auctionBalance };
}

// Participate in the auction (buy)
async function buyFromAuction() {
  const [, buyer] = await ethers.getSigners(); // Use the second account as buyer
  const { auction, token, currentPrice, hasEnded, auctionBalance } = await checkAuctionStatus();
  
  if (hasEnded) {
    console.log("Cannot buy: Auction has already ended.");
    return;
  }
  
  if (currentPrice <= 0n) {
    console.log("Cannot buy: Price has reached zero.");
    return;
  }
  
  // First, check and display buyer's balance
  const buyerAddress = await buyer.getAddress();
  const buyerBalance = await token.balanceOf(buyerAddress);
  console.log(`\nBuyer (${buyerAddress}) Balance: ${ethers.formatEther(buyerBalance)} TBL`);
  
  if (buyerBalance < currentPrice) {
    console.log(`Insufficient balance. Need ${ethers.formatEther(currentPrice)} TBL but have ${ethers.formatEther(buyerBalance)} TBL`);
    return;
  }
  
  // Approve the token for spending
  const approveTx = await token.connect(buyer).approve(await auction.getAddress(), currentPrice);
  await approveTx.wait();
  console.log(`Approved ${ethers.formatEther(currentPrice)} TBL for auction`);
  
  // Then buy from the auction
  try {
    const buyTx = await auction.connect(buyer).buy();
    const receipt = await buyTx.wait();
    
    // Check new balances
    const newBuyerBalance = await token.balanceOf(buyerAddress);
    const newAuctionBalance = await token.balanceOf(await auction.getAddress());
    
    console.log(`\nTransaction successful!`);
    console.log(`Transaction hash: ${receipt?.hash}`);
    console.log(`\nBuyer new balance: ${ethers.formatEther(newBuyerBalance)} TBL (gained ${ethers.formatEther(newBuyerBalance - buyerBalance + currentPrice)} TBL)`);
    console.log(`Auction new balance: ${ethers.formatEther(newAuctionBalance)} TBL (should be 0)`);
    
    if (newAuctionBalance === 0n) {
      console.log(`\nAuction completed successfully!`);
    } else {
      console.log(`\nWarning: Auction still has tokens left!`);
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
    console.log(`Transaction hash: ${receipt?.hash}`);
    
    // Check final status
    await checkAuctionStatus();
    
  } catch (error: any) {
    console.error(`Failed to end auction: ${error.message}`);
  }
}

// Fund a buyer with tokens
async function fundBuyerWithTokens(amount: string) {
  const [owner, buyer] = await ethers.getSigners();
  const { token: tokenAddress } = await getDeployedAddresses();
  const token = await ethers.getContractAt("TestToken", tokenAddress);
  
  const buyerAddress = await buyer.getAddress();
  const ownerBalance = await token.balanceOf(await owner.getAddress());
  console.log(`\nOwner balance: ${ethers.formatEther(ownerBalance)} TBL`);
  
  const amountWei = ethers.parseEther(amount);
  if (ownerBalance < amountWei) {
    console.log(`Owner has insufficient balance to fund buyer`);
    return;
  }
  
  const oldBuyerBalance = await token.balanceOf(buyerAddress);
  console.log(`Current buyer balance: ${ethers.formatEther(oldBuyerBalance)} TBL`);
  
  const tx = await token.connect(owner).transfer(buyerAddress, amountWei);
  await tx.wait();
  
  const newBalance = await token.balanceOf(buyerAddress);
  console.log(`\nSuccessfully funded ${buyerAddress}`);
  console.log(`New token balance: ${ethers.formatEther(newBalance)} TBL (added ${amount} TBL)`);
}

// Menu-driven interaction
async function interactiveMenu() {
  console.log("\n==== Reverse Dutch Auction Interaction ====");
  console.log("1. Check auction status");
  console.log("2. Fund buyer account with tokens");
  console.log("3. Buy from auction");
  console.log("4. End expired auction");
  console.log("5. Exit");
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('\nSelect an option (1-5): ', async (option: string) => {
    readline.close();
    
    switch (option) {
      case '1':
        await checkAuctionStatus();
        break;
      case '2':
        readline.question('Amount of tokens to fund: ', async (amount: string) => {
          await fundBuyerWithTokens(amount);
          readline.close();
        });
        return;
      case '3':
        await buyFromAuction();
        break;
      case '4':
        await endExpiredAuction();
        break;
      case '5':
        console.log("Exiting...");
        process.exit(0);
      default:
        console.log("Invalid option");
    }
    
    // Return to menu after operation completes
    setTimeout(interactiveMenu, 1000);
  });
}

// Main function to run interactions
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode
    await interactiveMenu();
    return;
  }
  
  try {
    switch (args[0]) {
      case "status":
        await checkAuctionStatus();
        break;
      case "fund":
        const amount = args[1] || "10";
        await fundBuyerWithTokens(amount);
        break;
      case "buy":
        await buyFromAuction();
        break;
      case "end":
        await endExpiredAuction();
        break;
      case "demo":
        // Run a complete demo
        console.log("\n=== Running Complete Demo ===");
        
        // 1. Check current auction status
        console.log("\nChecking initial auction status...");
        await checkAuctionStatus();

        // 2. Fund the buyer account
        console.log("\nFunding buyer account...");
        await fundBuyerWithTokens("10");

        // 3. Wait for price to decrease a bit
        console.log("\nWaiting for price to decrease...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 4. Check updated status
        console.log("\nChecking updated auction status...");
        await checkAuctionStatus();
        
        // 5. Buy from the auction
        console.log("\nAttempting to buy from auction...");
        await buyFromAuction();

        console.log("\nDemo completed!");
        break;
      default:
        console.log(`Unknown command: ${args[0]}`);
        console.log("Available commands: status, fund [amount], buy, end, demo");
    }
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