import dotenv from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

// ============ CONFIG ============

const SUBMITTER_PRIVATE_KEY = process.env.TEST_SUBMITTER_PRIVATE_KEY;
const MOLTBOOK_TEST_KEY = process.env.MOLTBOOK_API_KEY_TEST;
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const MOLTBOOK_API = "https://www.moltbook.com/api/v1";
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
  console.log("  ║   THEMIS E2E TEST — On-Chain Escrow Flow (Sepolia)  ║");
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

  // ---- STEP 4: Post delivery on Moltbook (as test agent) ----
  step(4, "Post delivery on Moltbook");

  if (!MOLTBOOK_TEST_KEY) {
    console.log(`  Skipping — no MOLTBOOK_API_KEY_TEST in .env`);
    console.log(`  Use the agent CLI instead: verify ${escrowId} "haiku deliverable"`);
  } else {
    const deliveryContent =
      `@ThemisEscrow deliver\n` +
      `escrow: #${escrowId}\n` +
      `deliverable: verified`;

    console.log(`  Posting delivery as test agent...`);
    deliveryContent.split("\n").forEach((l) => console.log(`    ${l}`));

    try {
      const res = await fetch(`${MOLTBOOK_API}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MOLTBOOK_TEST_KEY}`,
        },
        body: JSON.stringify({
          title: `Delivery for Escrow #${escrowId}`,
          content: deliveryContent,
          submolt: "blockchain",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.log(`\n  Post failed (${res.status}): ${text}`);
        if (res.status === 429) {
          console.log(`  Rate-limited. Use agent CLI instead: verify ${escrowId} verified`);
        }
      } else {
        const result = await res.json();
        const postId = result.post?.id || result.postId || result.id;
        console.log(`\n  Delivery posted: ${postId}`);
        console.log(`  Check agent terminal + Moltbook UI for ThemisEscrow's verification response.`);
      }
    } catch (error) {
      console.log(`\n  Post error: ${error.message}`);
    }
  }

  // ---- SUMMARY ----
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS`);
  console.log(`${"=".repeat(60)}\n`);

  const checks = {
    "Escrow created on-chain": escrowId !== null,
    "Status is Funded": status === 1,
    "Buyer matches submitter": escrow[0].toLowerCase() === submitterWallet.address.toLowerCase(),
    "Seller matches provider": escrow[1].toLowerCase() === providerAddress.toLowerCase(),
    "Amount matches": ethers.formatEther(escrow[3]) === ESCROW_AMOUNT,
  };

  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    const icon = passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${icon} ${check}`);
    if (!passed) allPassed = false;
  }

  if (allPassed) {
    console.log(`\n  ON-CHAIN ESCROW VERIFIED — Escrow #${escrowId} funded and ready.`);
    console.log(`  Monitor the agent terminal for verification + release/refund.\n`);
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
