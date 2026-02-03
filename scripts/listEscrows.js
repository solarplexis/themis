const { ethers } = require("hardhat");
const deployedAddresses = require("../ignition/deployments/chain-11155111/deployed_addresses.json");

async function main() {
  const CONTRACT_ADDRESS = deployedAddresses["MoltEscrowModule#MoltEscrow"];
  if (!CONTRACT_ADDRESS) {
    console.error("Could not find contract address in deployment file.");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Querying escrows with account:", signer.address);

  const MoltEscrow = await ethers.getContractAt("MoltEscrow", CONTRACT_ADDRESS);

  let escrowCount;
  try {
    escrowCount = await MoltEscrow.escrowCount();
  } catch (error) {
    console.error("\n❌ Error fetching escrowCount.");
    console.error("   Please ensure the contract address is correct and you are on the right network.");
    console.error(`   Error details: ${error.message}`);
    process.exit(1);
  }

  if (escrowCount == 0) {
    console.log("\nNo escrows found on this contract.");
    return;
  }

  console.log(`\nFound ${escrowCount} escrow(s). Fetching details...`);
  console.log("----------------------------------------------------\n");

  const statusMap = ["None", "Funded", "Released", "Refunded", "Disputed"];

  for (let i = 1; i <= escrowCount; i++) {
    const escrow = await MoltEscrow.getEscrow(i);
    const amountFormatted = ethers.formatEther(escrow.amount);
    const deadline = new Date(Number(escrow.deadline) * 1000).toLocaleString();

    console.log(`
    Escrow ID:    ${i}
    Status:       ${statusMap[escrow.status]}
    Amount:       ${amountFormatted} ETH
    Buyer:        ${escrow.buyer}
    Seller:       ${escrow.seller}
    Deadline:     ${deadline}
    Task CID:     ${escrow.taskCID}
    `);
    console.log("----------------------------------------------------\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
