import { ethers } from "ethers";
import { config } from "./config.js";
import { MoltEscrowContract, EscrowStatus } from "./contract.js";
import { verifyDeliverable } from "./verifier.js";

// Test addresses - using a random address as "seller" for testing
const TEST_SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat default #1

// Mock task requirements (simulating what would be on IPFS)
const MOCK_REQUIREMENTS = {
  title: "Create a logo for SpaceTech Inc",
  description: "Design a modern, minimalist logo for a futuristic space technology company",
  requirements: [
    "Must include a rocket or space-related element",
    "Use blue and silver color scheme",
    "Provide PNG format, minimum 1000x1000px",
    "Include transparent background version"
  ],
  deadline: "24 hours",
  budget: "100 MOLT"
};

// Mock deliverable (simulating what seller would submit)
const MOCK_DELIVERABLE_GOOD = {
  title: "SpaceTech Inc Logo - Final Delivery",
  description: "Modern minimalist logo featuring a stylized rocket with orbital rings",
  files: [
    { name: "spacetech-logo.png", size: "1200x1200px", format: "PNG" },
    { name: "spacetech-logo-transparent.png", size: "1200x1200px", format: "PNG", transparent: true }
  ],
  colors: ["#1E3A5F", "#C0C0C0", "#FFFFFF"],
  notes: "The design incorporates a sleek rocket silhouette with circular orbital elements, using the requested blue and silver palette."
};

const MOCK_DELIVERABLE_BAD = {
  title: "Logo attempt",
  description: "Here's something I made",
  files: [
    { name: "logo.jpg", size: "200x200px", format: "JPG" }
  ],
  colors: ["red", "green"],
  notes: "I made a quick logo, hope it works"
};

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  THEMIS - Full Flow Test");
  console.log("═══════════════════════════════════════════\n");

  const contract = new MoltEscrowContract();

  console.log(`[Test] Wallet: ${contract.wallet.address}`);
  console.log(`[Test] Contract: ${config.contractAddress}`);

  // Check balance
  const balance = await contract.provider.getBalance(contract.wallet.address);
  console.log(`[Test] Balance: ${ethers.formatEther(balance)} ETH\n`);

  // Step 1: Create an escrow
  console.log("─── STEP 1: Create Escrow ───");
  const escrowAmount = ethers.parseEther("0.001"); // 0.001 ETH for testing
  const deadline = Math.floor(Date.now() / 1000) + 86400; // 24 hours
  const taskCID = "QmTestRequirementsCID123"; // Mock CID

  console.log(`[Test] Creating escrow...`);
  console.log(`  Seller: ${TEST_SELLER}`);
  console.log(`  Amount: ${ethers.formatEther(escrowAmount)} ETH`);
  console.log(`  Task CID: ${taskCID}`);

  const escrowContract = new ethers.Contract(
    config.contractAddress,
    [
      "function createEscrowETH(address _seller, string calldata _taskCID, uint256 _deadline) external payable returns (uint256)",
      "function getEscrow(uint256 _escrowId) view returns (tuple(address buyer, address seller, address token, uint256 amount, string taskCID, uint256 deadline, uint8 status))",
      "function escrowCount() view returns (uint256)",
    ],
    contract.wallet
  );

  const tx = await escrowContract.createEscrowETH(
    TEST_SELLER,
    taskCID,
    deadline,
    { value: escrowAmount }
  );

  console.log(`[Test] Transaction sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[Test] Confirmed in block ${receipt.blockNumber}`);

  // Get the escrow ID from event
  const escrowCount = await escrowContract.escrowCount();
  const escrowId = Number(escrowCount);
  console.log(`[Test] Escrow created with ID: #${escrowId}\n`);

  // Step 2: Check escrow status
  console.log("─── STEP 2: Verify Escrow Created ───");
  const escrow = await contract.getEscrow(escrowId);
  console.log(`[Test] Escrow #${escrowId}:`);
  console.log(`  Status: ${Object.keys(EscrowStatus).find(k => EscrowStatus[k] === escrow.status)}`);
  console.log(`  Buyer: ${escrow.buyer}`);
  console.log(`  Seller: ${escrow.seller}`);
  console.log(`  Amount: ${ethers.formatEther(escrow.amount)} ETH\n`);

  // Step 3: AI Verification - Good deliverable
  console.log("─── STEP 3: AI Verification (Good Deliverable) ───");
  console.log("[Test] Sending requirements and deliverable to AI...\n");

  const resultGood = await verifyDeliverable(MOCK_REQUIREMENTS, MOCK_DELIVERABLE_GOOD);
  console.log(`\n[Test] AI Decision: ${resultGood.approved ? "✓ APPROVED" : "✗ REJECTED"}`);
  console.log(`[Test] Confidence: ${resultGood.confidence}%`);
  console.log(`[Test] Reason: ${resultGood.reason}\n`);

  // Step 4: AI Verification - Bad deliverable (just to show contrast)
  console.log("─── STEP 4: AI Verification (Bad Deliverable) ───");
  console.log("[Test] Testing with a poor quality deliverable...\n");

  const resultBad = await verifyDeliverable(MOCK_REQUIREMENTS, MOCK_DELIVERABLE_BAD);
  console.log(`\n[Test] AI Decision: ${resultBad.approved ? "✓ APPROVED" : "✗ REJECTED"}`);
  console.log(`[Test] Confidence: ${resultBad.confidence}%`);
  console.log(`[Test] Reason: ${resultBad.reason}\n`);

  // Step 5: Release the escrow (since good deliverable was approved)
  console.log("─── STEP 5: Release Escrow ───");
  if (resultGood.approved && resultGood.confidence >= 70) {
    console.log("[Test] Good deliverable approved - releasing funds to seller...");
    await contract.release(escrowId);

    // Verify final status
    const finalEscrow = await contract.getEscrow(escrowId);
    console.log(`[Test] Final status: ${Object.keys(EscrowStatus).find(k => EscrowStatus[k] === finalEscrow.status)}`);
  } else {
    console.log("[Test] Would refund buyer (deliverable not approved)");
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("  Test Complete!");
  console.log("═══════════════════════════════════════════");
  console.log(`\nView on Etherscan: https://sepolia.etherscan.io/address/${config.contractAddress}`);
}

main().catch(console.error);
