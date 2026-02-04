import dotenv from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

// ============ CONFIG ============

const SUBMITTER_PRIVATE_KEY = process.env.TEST_SUBMITTER_PRIVATE_KEY;
const ARBITRATOR_PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY;
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const THEMIS_API = process.env.THEMIS_API_URL || "http://localhost:3000";
const CONTRACT_ADDRESS = "0x3f1c8Af6BDaA7e184EcA1797749E87A8345E0471";
const ESCROW_AMOUNT = "0.001"; // ETH

const ABI = [
  "function createEscrowETH(address _seller, string _taskCID, uint256 _deadline) payable returns (uint256)",
  "function getEscrow(uint256 _escrowId) view returns (tuple(address buyer, address seller, address token, uint256 amount, string taskCID, uint256 deadline, uint8 status))",
  "function escrowCount() view returns (uint256)",
  "function arbitrator() view returns (address)",
  "event EscrowCreated(uint256 indexed escrowId, address indexed buyer, address indexed seller, address token, uint256 amount, string taskCID, uint256 deadline)",
];

const STATUS_NAMES = ["None", "Funded", "Released", "Refunded", "Disputed"];

function step(n, title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  STEP ${n}: ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

// ============ MAIN TEST ============

async function main() {
  console.log("\n");
  console.log("  ╔══════════════════════════════════════════════════════╗");
  console.log("  ║   THEMIS E2E TEST — On-Chain Escrow Flow (Sepolia)   ║");
  console.log("  ╚══════════════════════════════════════════════════════╝");
  console.log();

  // ---- STEP 1: Setup ----
  step(1, "Setup");

  if (!SUBMITTER_PRIVATE_KEY) {
    console.error("  Missing TEST_SUBMITTER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const submitterWallet = new ethers.Wallet(SUBMITTER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, submitterWallet);

  // Generate random provider address
  const providerWallet = ethers.Wallet.createRandom();
  const providerAddress = providerWallet.address;

  // Check balance
  const balance = await provider.getBalance(submitterWallet.address);
  const balanceEth = ethers.formatEther(balance);

  // Check arbitrator
  const arbitrator = await contract.arbitrator();

  console.log(`  Network:           Sepolia (chainId 11155111)`);
  console.log(`  Contract:          ${CONTRACT_ADDRESS}`);
  console.log(`  Arbitrator:        ${arbitrator}`);
  console.log(`  Submitter:         ${submitterWallet.address}`);
  console.log(`  Submitter balance: ${balanceEth} ETH`);
  console.log(`  Provider:          ${providerAddress} (random)`);
  console.log(`  Escrow amount:     ${ESCROW_AMOUNT} ETH`);

  if (parseFloat(balanceEth) < parseFloat(ESCROW_AMOUNT) + 0.001) {
    console.error(`\n  Insufficient balance! Need at least ${ESCROW_AMOUNT} ETH + gas.`);
    console.error(`  Fund ${submitterWallet.address} with Sepolia ETH from a faucet.`);
    process.exit(1);
  }

  const escrowCountBefore = Number(await contract.escrowCount());
  console.log(`  Escrows on contract: ${escrowCountBefore}`);

  // ---- STEP 2: Create escrow on-chain ----
  step(2, "Create escrow on-chain (createEscrowETH)");

  const deadline = Math.floor(Date.now() / 1000) + 24 * 3600;
  const taskCID = "Reply with the word 'verified' to confirm delivery";
  const value = ethers.parseEther(ESCROW_AMOUNT);

  console.log(`  Calling createEscrowETH...`);
  console.log(`    seller:   ${providerAddress}`);
  console.log(`    taskCID:  "${taskCID}"`);
  console.log(`    deadline: ${new Date(deadline * 1000).toISOString()}`);
  console.log(`    value:    ${ESCROW_AMOUNT} ETH\n`);

  let txReceipt;
  try {
    const tx = await contract.createEscrowETH(providerAddress, taskCID, deadline, { value });
    console.log(`  Tx sent: ${tx.hash}`);
    console.log(`  https://sepolia.etherscan.io/tx/${tx.hash}`);
    console.log(`  Waiting for confirmation...`);

    txReceipt = await tx.wait();
    console.log(`  Confirmed in block ${txReceipt.blockNumber}`);
  } catch (error) {
    console.error(`  Transaction failed: ${error.message}`);
    process.exit(1);
  }

  // Parse escrow ID from event
  let escrowId = null;
  const iface = new ethers.Interface(ABI);
  for (const log of txReceipt.logs) {
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

  console.log(`\n  Escrow created: #${escrowId}`);

  // ---- STEP 3: Verify on-chain state ----
  step(3, "Verify on-chain escrow state");

  const escrow = await contract.getEscrow(escrowId);
  const status = Number(escrow[6]);

  console.log(`  Escrow #${escrowId}:`);
  console.log(`    Status:   ${STATUS_NAMES[status]}`);
  console.log(`    Buyer:    ${escrow[0]}`);
  console.log(`    Seller:   ${escrow[1]}`);
  console.log(`    Token:    ${escrow[2] === ethers.ZeroAddress ? "ETH" : escrow[2]}`);
  console.log(`    Amount:   ${ethers.formatEther(escrow[3])} ETH`);
  console.log(`    TaskCID:  ${escrow[4]}`);
  console.log(`    Deadline: ${new Date(Number(escrow[5]) * 1000).toISOString()}`);

  // ---- STEP 4: Deliver via Themis REST API ----
  step(4, "Deliver via REST API (arbitrator-signed)");

  if (!ARBITRATOR_PRIVATE_KEY) {
    console.log(`  Skipping — no TESTNET_PRIVATE_KEY in .env`);
  } else {
    const arbitratorWallet = new ethers.Wallet(ARBITRATOR_PRIVATE_KEY);
    const deliverMessage = `Themis: deliver escrow #${escrowId}`;
    const deliverable = "verified";

    console.log(`  Arbitrator:   ${arbitratorWallet.address}`);
    console.log(`  API:          ${THEMIS_API}`);
    console.log(`  Message:      "${deliverMessage}"`);
    console.log(`  Deliverable:  "${deliverable}"`);

    const signature = await arbitratorWallet.signMessage(deliverMessage);
    console.log(`  Signature:    ${signature.slice(0, 20)}...`);

    const url = `${THEMIS_API}/api/escrow/${escrowId}/deliver`;
    console.log(`\n  POST ${url}`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverable, signature }),
      });

      const result = await res.json();

      if (!res.ok) {
        console.log(`\n  API error (${res.status}): ${result.error}`);
      } else {
        console.log(`\n  API Response:`);
        console.log(`    Approved:    ${result.approved}`);
        console.log(`    Confidence:  ${result.confidence}%`);
        console.log(`    Reason:      ${result.reason}`);
        console.log(`    Tx hash:     ${result.txHash}`);
        if (result.txHash) {
          console.log(`    https://sepolia.etherscan.io/tx/${result.txHash}`);
        }
      }
    } catch (error) {
      console.log(`\n  API call failed: ${error.message}`);
    }
  }

  // ---- STEP 5: Verify final on-chain state ----
  step(5, "Verify final on-chain state");

  // Poll until the tx confirms (Sepolia blocks ~12s)
  let finalStatus = status;
  const maxWait = 60; // seconds
  console.log(`  Waiting up to ${maxWait}s for release tx to confirm...`);
  for (let i = 0; i < maxWait / 5; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check = await contract.getEscrow(escrowId);
    finalStatus = Number(check[6]);
    console.log(`    ${(i + 1) * 5}s — status: ${STATUS_NAMES[finalStatus]}`);
    if (finalStatus !== 1) break; // No longer Funded → tx confirmed
  }

  const finalEscrow = await contract.getEscrow(escrowId);

  console.log(`  Escrow #${escrowId} final state:`);
  console.log(`    Status: ${STATUS_NAMES[finalStatus]}`);

  // ---- SUMMARY ----
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS`);
  console.log(`${"=".repeat(60)}\n`);

  const checks = {
    "Escrow created on-chain": escrowId !== null,
    "Initial status was Funded": status === 1,
    "Buyer matches submitter": escrow[0].toLowerCase() === submitterWallet.address.toLowerCase(),
    "Seller matches provider": escrow[1].toLowerCase() === providerAddress.toLowerCase(),
    "Amount matches": ethers.formatEther(escrow[3]) === ESCROW_AMOUNT,
    "Final status is Released or Refunded": finalStatus === 2 || finalStatus === 3,
  };

  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    const icon = passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${icon} ${check}`);
    if (!passed) allPassed = false;
  }

  if (allPassed) {
    console.log(`\n  E2E TEST PASSED — Escrow #${escrowId} created, delivered via API, and resolved on-chain.\n`);
  } else {
    console.log(`\n  SOME CHECKS FAILED\n`);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
