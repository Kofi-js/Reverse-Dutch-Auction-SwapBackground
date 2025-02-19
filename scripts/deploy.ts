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
    
    // Deploy Coin token
    console.log("\nDeploying Coin Token...");
    const initialSupply = 1000000; // 1 million tokens
    const Coin = await ethers.getContractFactory("IERC20");
    const coin = await Coin.deploy(
      "Turbulence",   // name
      "TBL",    // symbol
      initialSupply
    );
    
    await coin.waitForDeployment();
    const coinAddress = await coin.getAddress();
    console.log(`Coin Token deployed to: ${coinAddress}`);

    // Get deployer address for logging
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    
    // Check initial balance
    const initialBalance = await coin.balanceOf(deployerAddress);
    const decimals = await coin.decimals();
    console.log(`Initial supply: ${ethers.formatUnits(initialBalance, decimals)} ${await coin.symbol()}`);
    console.log(`Owner: ${await coin.owner()}`);

    // Log deployment info
    console.log("\nDeployment Summary:");
    console.log("-------------------");
    console.log(`Network: ${network.name}`);
    console.log(`Coin Token: ${coinAddress}`);
    console.log(`Initial Supply: ${initialSupply} ${await coin.symbol()}`);
    console.log(`Deployer/Owner: ${deployerAddress}`);

    // Save deployment addresses
    const deployments = {
      network: network.name,
      coin: coinAddress,
      owner: deployerAddress,
      initialSupply: initialSupply,
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
      
      await verifyContract(coinAddress, [
        "My Coin",
        "MYCOIN",
        initialSupply
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