#!/usr/bin/env node

import dotenv from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const SUBMITTER_PRIVATE_KEY = process.env.TEST_SUBMITTER_PRIVATE_KEY;
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const CONTRACT_ADDRESS = "0x3f1c8Af6BDaA7e184EcA1797749E87A8345E0471";
const ESCROW_AMOUNT = "0.001";

const ABI = [
  "function createEscrowETH(address _seller, string _taskCID, uint256 _deadline) payable returns (uint256)",
  "function escrowCount() view returns (uint256)",
  "event EscrowCreated(uint256 indexed escrowId, address indexed buyer, address indexed seller, address token, uint256 amount, string taskCID, uint256 deadline)",
];

async function main() {
  const task = process.argv[2];

  if (!task || task === "help" || task === "--help") {
    console.log(`
  Create Escrow (Sepolia)

  Usage: node scripts/create-escrow.js "<task>"

  Example:
    node scripts/create-escrow.js "Who will win the big game this year"

  Creates an escrow on Sepolia WITHOUT delivering. Use test-clarify.js
  to add clarifications, then verify-escrow.js to deliver.
`);
    process.exit(1);
  }

  if (!SUBMITTER_PRIVATE_KEY) {
    console.error("  Error: Missing TEST_SUBMITTER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const submitterWallet = new ethers.Wallet(SUBMITTER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, submitterWallet);

  // Random provider address
  const providerWallet = ethers.Wallet.createRandom();
  const providerAddress = providerWallet.address;

  const deadline = Math.floor(Date.now() / 1000) + 24 * 3600;
  const value = ethers.parseEther(ESCROW_AMOUNT);

  console.log(`\n  Creating Escrow on Sepolia\n`);
  console.log(`  Task:      "${task}"`);
  console.log(`  Amount:    ${ESCROW_AMOUNT} ETH`);
  console.log(`  Provider:  ${providerAddress} (random)`);
  console.log(`  Deadline:  ${new Date(deadline * 1000).toISOString()}\n`);

  try {
    const tx = await contract.createEscrowETH(providerAddress, task, deadline, { value });
    console.log(`  Tx sent: ${tx.hash}`);
    console.log(`  Waiting for confirmation...`);

    const receipt = await tx.wait();

    // Parse escrow ID from event
    let escrowId = null;
    const iface = new ethers.Interface(ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "EscrowCreated") {
          escrowId = Number(parsed.args[0]);
          break;
        }
      } catch {}
    }

    if (escrowId === null) {
      escrowId = Number(await contract.escrowCount());
    }

    console.log(`\n  Escrow #${escrowId} created!\n`);
    console.log(`  Next steps:`);
    console.log(`    1. Add clarifications: node scripts/test-clarify.js ask ${escrowId} "Your question"`);
    console.log(`    2. Answer them:        node scripts/test-clarify.js answer ${escrowId} <questionId> "Answer"`);
    console.log(`    3. Deliver:            node scripts/verify-escrow.js ${escrowId} "Your deliverable"\n`);

  } catch (error) {
    console.error(`  Error: ${error.message}`);
    process.exit(1);
  }
}

main();
