const { ethers } = require("hardhat");
const deployedAddresses = require("../ignition/deployments/chain-11155111/deployed_addresses.json");

async function main() {
  const CONTRACT_ADDRESS = deployedAddresses["MoltEscrowModule#MoltEscrow"];
  if (!CONTRACT_ADDRESS) {
    console.error("Could not find contract address in deployment file.");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Fulfilling task with account:", signer.address);

  const escrowId = process.argv[2];
  if (!escrowId) {
    console.error("Please provide an escrowId as an argument.");
    process.exit(1);
  }

  console.log(`\nAttempting to fulfill task for Escrow ID: ${escrowId}...`);

  const MoltEscrow = await ethers.getContractAt("MoltEscrow", CONTRACT_ADDRESS);

  // 1. Fetch Escrow Details
  let escrow;
  try {
    escrow = await MoltEscrow.getEscrow(escrowId);
  } catch (error) {
    console.error(`\n❌ Error fetching escrow #${escrowId}.`);
    console.error("   Please ensure the contract address is correct and you are on the right network.");
    console.error(`   Error details: ${error.message}`);
    process.exit(1);
  }
  

  if (escrow.status !== 1) { // 1 = Funded
    console.error(`\n❌ Escrow #${escrowId} is not in 'Funded' status. Current status: ${escrow.status}`);
    return;
  }
  
  console.log("✅ Escrow details fetched successfully.");
  console.log("   - Task CID:", escrow.taskCID);

  // 2. Simulate "Doing the Work"
  // In a real scenario, the agent would perform a task based on the taskCID.
  // Here, we'll just generate a mock result.
  const workResult = `This is the completed deliverable for task specified in ${escrow.taskCID}.`;
  console.log("✅ Work simulation complete.");

  // 3. Simulate "Uploading" to IPFS
  // In a real scenario, you would use an IPFS client to upload the workResult.
  // Here, we'll create a fake CID.
  const resultCID = "ipfs://Qm" + "Z" + "a".repeat(43); // Example: QmZa... 
  console.log("✅ Deliverable 'uploaded' to IPFS.");
  console.log("   - Result CID:", resultCID);
  
  // 4. Simulate Notifying the Arbitrator
  // In the full application, this would be a post on Moltbook.
  // The Themis agent would see this post, fetch the CIDs, and start the verification.
  console.log("\n---------- 📣 SIMULATED NOTIFICATION 📣 ----------");
  console.log(`
  @Themis, the task for Escrow ID #${escrowId} is complete.

  The deliverable is available at: ${resultCID}

  Please verify and release the funds.
  `);
  console.log("----------------------------------------------------");
  console.log("\nScript finished. The Themis agent can now proceed with verification.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
