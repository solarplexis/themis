import { config, validateConfig } from "./config.js";
import { MoltEscrowContract, EscrowStatus } from "./contract.js";
import { fetchFromIPFS, parseTaskRequirements } from "./ipfs.js";
import { verifyDeliverable, verifyDispute } from "./verifier.js";
import { ThemisHeartbeat } from "./heartbeat.js";
import { MoltbookClient } from "./moltbook.js";

// Track escrows awaiting verification
const pendingVerifications = new Map();
let lastProcessedBlock = 0;

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  THEMIS - DeFi Arbitration Agent");
  console.log("═══════════════════════════════════════════");

  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error(`[Config] ${error.message}`);
    console.log("\nCreate a .env file with:");
    console.log("  PRIVATE_KEY=your_wallet_private_key");
    console.log("  CONTRACT_ADDRESS=deployed_contract_address");
    console.log("  OPENAI_API_KEY=your_openai_api_key");
    console.log("  MOLTBOOK_API_KEY=your_moltbook_api_key (optional)");
    process.exit(1);
  }

  // Initialize contract (with moltbook client if enabled)
  const moltbook = (config.moltbookEnabled && config.moltbookApiKey)
    ? new MoltbookClient()
    : null;
  const contract = new MoltEscrowContract(moltbook);

  console.log(`[Agent] Connected to contract: ${config.contractAddress}`);
  console.log(`[Agent] Network: ${config.networkName} (${config.chainId})`);
  console.log(`[Agent] Arbitrator: ${contract.wallet.address}`);

  // Verify we're the arbitrator
  const contractArbitrator = await contract.contract.arbitrator();
  if (contractArbitrator.toLowerCase() !== contract.wallet.address.toLowerCase()) {
    console.error(`[Agent] WARNING: Wallet is not the contract arbitrator!`);
    console.error(`[Agent] Contract arbitrator: ${contractArbitrator}`);
    console.error(`[Agent] Your wallet: ${contract.wallet.address}`);
  }

  // Load existing escrows
  console.log("\n[Agent] Loading existing escrows...");
  const escrowCount = await contract.getEscrowCount();
  console.log(`[Agent] Found ${escrowCount} total escrows`);

  // Check status of each escrow
  for (let i = 1; i <= Number(escrowCount); i++) {
    const escrow = await contract.getEscrow(i);
    const statusName = Object.keys(EscrowStatus).find(
      (key) => EscrowStatus[key] === escrow.status
    );
    console.log(`  #${i}: ${statusName} - ${escrow.taskCID.slice(0, 20)}...`);
  }

  // Get current block for polling
  lastProcessedBlock = await contract.provider.getBlockNumber();
  console.log(`\n[Agent] Starting from block ${lastProcessedBlock}`);

  // Start polling for events (instead of using filters)
  console.log("[Agent] Polling for blockchain events...");
  const pollInterval = setInterval(() => pollEvents(contract), config.pollInterval);

  // Start Moltbook heartbeat if enabled
  let heartbeat = null;
  if (config.moltbookEnabled && config.moltbookApiKey) {
    console.log("\n[Agent] Starting Moltbook heartbeat...");
    heartbeat = new ThemisHeartbeat();
    await heartbeat.start(15000); // Check every 15 seconds
  } else {
    console.log("\n[Agent] Moltbook integration disabled (set MOLTBOOK_ENABLED=true to enable)");
  }

  // Start CLI for manual operations
  console.log("\n[Agent] Ready! Commands:");
  console.log("  verify <escrowId> <deliverableCID> - Verify and release/refund");
  console.log("  status <escrowId> - Check escrow status");
  console.log("  release <escrowId> - Manually release to provider");
  console.log("  refund <escrowId> - Manually refund to submitter");
  console.log("  moltbook - Toggle Moltbook heartbeat");
  console.log("  quit - Exit agent\n");

  // Simple CLI
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", async (line) => {
    const [command, ...args] = line.trim().split(" ");

    try {
      switch (command) {
        case "verify":
          await handleVerify(contract, args[0], args[1]);
          break;
        case "status":
          await handleStatus(contract, args[0]);
          break;
        case "release":
          await contract.release(args[0]);
          break;
        case "refund":
          await contract.refund(args[0]);
          break;
        case "moltbook":
          if (heartbeat && heartbeat.isRunning) {
            heartbeat.stop();
            console.log("[Agent] Moltbook heartbeat stopped");
          } else {
            heartbeat = new ThemisHeartbeat();
            await heartbeat.start(60000);
            console.log("[Agent] Moltbook heartbeat started");
          }
          break;
        case "quit":
        case "exit":
          console.log("[Agent] Shutting down...");
          clearInterval(pollInterval);
          if (heartbeat) heartbeat.stop();
          process.exit(0);
        default:
          if (command) console.log(`Unknown command: ${command}`);
      }
    } catch (error) {
      console.error(`[Error] ${error.message}`);
    }
  });
}

async function pollEvents(contract) {
  try {
    const currentBlock = await contract.provider.getBlockNumber();

    if (currentBlock <= lastProcessedBlock) {
      return; // No new blocks
    }

    // Query for EscrowCreated events
    const createdEvents = await contract.queryEvents(
      "EscrowCreated",
      lastProcessedBlock + 1,
      currentBlock
    );

    for (const event of createdEvents) {
      console.log(`\n[Event] New escrow created!`);
      console.log(`  ID: #${event.escrowId}`);
      console.log(`  Submitter: ${event.buyer}`);
      console.log(`  Provider: ${event.seller}`);
      console.log(`  Amount: ${event.amount.toString()} wei`);
      console.log(`  Task CID: ${event.taskCID}`);
      console.log(`  Deadline: ${new Date(event.deadline * 1000).toISOString()}`);

      pendingVerifications.set(event.escrowId, {
        ...event,
        createdAt: Date.now(),
      });
    }

    // Query for EscrowDisputed events
    const disputedEvents = await contract.queryEvents(
      "EscrowDisputed",
      lastProcessedBlock + 1,
      currentBlock
    );

    for (const event of disputedEvents) {
      console.log(`\n[Event] Escrow #${event.escrowId} disputed!`);
    }

    lastProcessedBlock = currentBlock;
  } catch (error) {
    // Silently ignore polling errors (network hiccups)
    if (!error.message.includes("filter not found")) {
      console.error(`[Poll] Error: ${error.message}`);
    }
  }
}

async function handleVerify(contract, escrowId, deliverableCID) {
  if (!escrowId || !deliverableCID) {
    console.log("Usage: verify <escrowId> <deliverableCID>");
    return;
  }

  console.log(`\n[Verify] Starting verification for escrow #${escrowId}...`);

  // Get escrow details
  const escrow = await contract.getEscrow(escrowId);

  if (escrow.status !== EscrowStatus.Funded) {
    console.log(`[Verify] Escrow is not in Funded status (current: ${escrow.status})`);
    return;
  }

  // Fetch requirements from IPFS
  console.log(`[Verify] Fetching requirements from ${escrow.taskCID}...`);
  let requirements;
  try {
    const requirementsRaw = await fetchFromIPFS(escrow.taskCID);
    requirements = parseTaskRequirements(requirementsRaw);
  } catch (error) {
    console.log(`[Verify] Could not fetch from IPFS, using CID as description`);
    requirements = { description: escrow.taskCID };
  }

  // Fetch deliverable from IPFS
  console.log(`[Verify] Fetching deliverable from ${deliverableCID}...`);
  let deliverable;
  try {
    deliverable = await fetchFromIPFS(deliverableCID);
  } catch (error) {
    console.log(`[Verify] Could not fetch from IPFS, using CID as description`);
    deliverable = { description: deliverableCID };
  }

  // AI verification
  const result = await verifyDeliverable(requirements, deliverable);

  if (result.approved && result.confidence >= 70) {
    console.log(`[Verify] ✓ Approved! Releasing funds to provider...`);
    await contract.release(escrowId);
  } else {
    console.log(`[Verify] ✗ Rejected. Refunding submitter...`);
    await contract.refund(escrowId);
  }
}

async function handleStatus(contract, escrowId) {
  if (!escrowId) {
    // Show all escrows
    const count = await contract.getEscrowCount();
    console.log(`\n[Status] Total escrows: ${count}`);
    for (let i = 1; i <= Number(count); i++) {
      const escrow = await contract.getEscrow(i);
      const statusName = Object.keys(EscrowStatus).find(
        (key) => EscrowStatus[key] === escrow.status
      );
      console.log(`  #${i}: ${statusName}`);
    }
    return;
  }

  const escrow = await contract.getEscrow(escrowId);
  const statusName = Object.keys(EscrowStatus).find(
    (key) => EscrowStatus[key] === escrow.status
  );

  console.log(`\n[Escrow #${escrowId}]`);
  console.log(`  Status: ${statusName}`);
  console.log(`  Submitter: ${escrow.buyer}`);
  console.log(`  Provider: ${escrow.seller}`);
  console.log(`  Amount: ${escrow.amount.toString()} wei`);
  console.log(`  Task CID: ${escrow.taskCID}`);
  console.log(`  Deadline: ${new Date(Number(escrow.deadline) * 1000).toISOString()}`);
}

// Run
main().catch(console.error);
