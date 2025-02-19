import { ethers, network } from "hardhat";
import hre from "hardhat";
import fs from "fs";

async function verifyContract(address: string, constructorArguments: any[] = []) {
  if (network.name === "hardhat" || network.name === "localhost") return;

  console.log("Waiting for block confirmations...");
  await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for blockchain confirmations

  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArguments,
    });
    console.log(`Contract verified at ${address}`);
  } catch (error: any) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("Contract already verified!");
    } else {
      console.error("Error verifying contract:", error);
    }
  }
}

async function main() {
  try {
    console.log("Starting deployment process...");
    
    // Deploy Token
    console.log("\nDeploying Token...");
    const initialSupply = ethers.parseEther("1000000"); // 1 million tokens
    const Token = await ethers.getContractFactory("IERC20");
    const token = await Token.deploy(
      "Turbulence",   // name
      "TBL",          // symbol
      initialSupply
    );
    
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`Token deployed to: ${tokenAddress}`);

    // Get deployer address for logging
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    
    // Check initial balance
    const initialBalance = await token.balanceOf(deployerAddress);
    console.log(`Initial supply: ${ethers.formatEther(initialBalance)} TBL`);

    // Deploy Reverse Dutch Auction
    console.log("\nDeploying Reverse Dutch Auction...");
    const startingPrice = ethers.parseEther("1.0");
    const priceDecreaseRate = ethers.parseEther("0.0001"); // Price drop per second
    const auctionDuration = 3600; // 1 hour
    
    const ReverseDutchAuction = await ethers.getContractFactory("ReverseDutchAuction");
    const auction = await ReverseDutchAuction.deploy(
      tokenAddress,
      startingPrice,
      priceDecreaseRate,
      auctionDuration
    );
    
    await auction.waitForDeployment();
    const auctionAddress = await auction.getAddress();
    console.log(`Reverse Dutch Auction deployed to: ${auctionAddress}`);

    // Deposit tokens to the auction
    console.log("\nDepositing tokens to the auction...");
    const tokensToDeposit = ethers.parseEther("10000"); // 10,000 tokens
    await token.approve(auctionAddress, tokensToDeposit);
    await auction.depositTokens(tokensToDeposit);
    
    const auctionBalance = await token.balanceOf(auctionAddress);
    console.log(`Tokens deposited to auction: ${ethers.formatEther(auctionBalance)} TBL`);

    // Log deployment info
    console.log("\nDeployment Summary:");
    console.log("-------------------");
    console.log(`Network: ${network.name}`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`Auction: ${auctionAddress}`);
    console.log(`Starting Price: ${ethers.formatEther(startingPrice)} TBL`);
    console.log(`Price Decrease Rate: ${ethers.formatEther(priceDecreaseRate)} TBL/second`);
    console.log(`Auction Duration: ${auctionDuration} seconds`);
    console.log(`Tokens for Sale: ${ethers.formatEther(auctionBalance)} TBL`);
    console.log(`Deployer/Seller: ${deployerAddress}`);

    // Save deployment addresses
    const deployments = {
      network: network.name,
      token: tokenAddress,
      auction: auctionAddress,
      seller: deployerAddress,
      startingPrice: startingPrice.toString(),
      priceDecreaseRate: priceDecreaseRate.toString(),
      auctionDuration: auctionDuration,
      tokensForSale: auctionBalance.toString(),
      timestamp: new Date().toISOString()
    }; 

    const deploymentsDir = "./deployments";
    if (!fs.existsSync(deploymentsDir)){
      fs.mkdirSync(deploymentsDir);
    }

    fs.writeFileSync(
      `${deploymentsDir}/${network.name}.json`,
      JSON.stringify(deployments, null, 2)
    );

    // Start verification process
    if (network.name !== "hardhat" && network.name !== "localhost") {
      console.log("\nStarting contract verification...");
      
      await verifyContract(tokenAddress, [
        "Turbulence",
        "TBL",
        initialSupply
      ]);
      
      await verifyContract(auctionAddress, [
        tokenAddress,
        startingPrice,
        priceDecreaseRate,
        auctionDuration
      ]);
    }

    console.log("\nDeployment completed successfully!");

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exitCode = 1;
  }
}

// Execute deployment
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});