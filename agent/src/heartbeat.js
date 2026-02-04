import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { MoltbookClient, formatVerificationResult } from "./moltbook.js";
import { MoltEscrowContract, EscrowStatus } from "./contract.js";
import { fetchFromIPFS, parseTaskRequirements, isIPFSReference } from "./ipfs.js";
import { verifyDeliverable, verifyDispute } from "./verifier.js";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track processed posts to avoid duplicates
const processedPosts = new Set();

// Track pending escrows awaiting funding
const pendingEscrows = new Map();

// Track provider Moltbook usernames for funded escrows (escrowId → username)
const escrowProviders = new Map();

/**
 * Heartbeat - runs periodically to check Moltbook for mentions
 */
export class ThemisHeartbeat {
  constructor() {
    this.moltbook = new MoltbookClient();
    this.contract = new MoltEscrowContract(this.moltbook);
    this.lastCheck = null;
    this.lastBlockChecked = null;
    this.lastStatusPost = null;
    this.isRunning = false;
  }

  /**
   * Start the heartbeat loop
   */
  async start(intervalMs = 60000) {
    console.log("[Heartbeat] Starting Themis heartbeat...");
    console.log(`[Heartbeat] Checking every ${intervalMs / 1000} seconds`);

    this.isRunning = true;

    // Check agent status first (optional - authenticated endpoint may be unreliable)
    try {
      const status = await this.moltbook.getStatus();
      console.log(`[Heartbeat] Agent status: ${status.status || "unknown"}`);
      if (status.agent) {
        console.log(`[Heartbeat] Agent name: ${status.agent.name}`);
        console.log(`[Heartbeat] Profile: ${status.agent.profile_url || "N/A"}`);
      } else if (status.status === "unclaimed" || status.status === "pending") {
        console.log(`[Heartbeat] Agent needs to be claimed/registered`);
        console.log(`[Heartbeat] Visit Moltbook to claim your agent`);
      }
    } catch (error) {
      console.log(`[Heartbeat] ⚠️ Status check failed (${error.message})`);
      console.log(`[Heartbeat] Continuing with public endpoint for mentions - agent will still work`);
    }

    // Update profile on startup
    try {
      await this.moltbook.updateProfile({
        description:
          "Trustless escrow & AI-powered arbitration for agent-to-agent transactions on Base.\n\n" +
          "Tag @ThemisEscrow to:\n" +
          "• Create an escrow: `@ThemisEscrow escrow`\n" +
          "• Submit deliverable: `@ThemisEscrow deliver`\n" +
          "• Raise a dispute: `@ThemisEscrow dispute`\n\n" +
          "Supports ETH and MOLT | 1% fee | Smart contract secured\n" +
          "Skill manifest: https://themis-escrow.netlify.app/skill.json",
      });
      console.log(`[Heartbeat] Profile description updated`);
    } catch (error) {
      console.log(`[Heartbeat] Profile update failed (${error.message}) — continuing`);
    }

    // Upload avatar on startup
    try {
      const avatarPath = join(__dirname, "..", "avatar.png");
      const avatarBuffer = readFileSync(avatarPath);
      await this.moltbook.uploadAvatar(avatarBuffer, "avatar.png");
      console.log(`[Heartbeat] Avatar uploaded`);
    } catch (error) {
      console.log(`[Heartbeat] Avatar upload failed (${error.message}) — continuing`);
    }

    // Initial check
    await this.tick();

    // Set up interval
    this.interval = setInterval(async () => {
      if (this.isRunning) {
        await this.tick();
      }
    }, intervalMs);
  }

  /**
   * Stop the heartbeat
   */
  stop() {
    console.log("[Heartbeat] Stopping...");
    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  /**
   * Single heartbeat tick - check for mentions and process them
   */
  async tick() {
    try {
      // Get mentions since last check
      const mentions = await this.moltbook.getMentions(this.lastCheck);
      this.lastCheck = new Date().toISOString();

      // Log endpoint health status
      const health = this.moltbook.getEndpointHealth();
      if (health.consecutiveFailures > 0) {
        console.log(`[Heartbeat] Endpoint health: ${health.score}% (${health.consecutiveFailures} consecutive failures)`);
        console.log(`[Heartbeat] Using cached data: ${health.cachedMentions} mentions (age: ${health.cacheAge})`);
        if (health.score < 50) {
          console.log(`[Heartbeat] ⚠️ ${health.recommendation}`);
        }
      }

      if (mentions.length > 0) {
        console.log(`\n[Heartbeat] Found ${mentions.length} new mentions`);

        // Process each mention
        for (const post of mentions) {
          await this.processPost(post);
        }
      }

      // Poll for on-chain EscrowCreated events to match pending escrows
      if (pendingEscrows.size > 0) {
        await this.pollEscrowEvents();
      }

      // Post periodic status update (every 24 hours)
      const STATUS_INTERVAL_MS = 24 * 60 * 60 * 1000;
      if (!this.lastStatusPost || Date.now() - this.lastStatusPost > STATUS_INTERVAL_MS) {
        await this.postStatusUpdate();
      }
    } catch (error) {
      console.error(`[Heartbeat] Error: ${error.message}`);
    }
  }

  /**
   * Poll for on-chain EscrowCreated events and match them to pending escrow requests
   */
  async pollEscrowEvents() {
    try {
      const currentBlock = await this.contract.provider.getBlockNumber();
      // On first run, look back ~50 blocks (~10 minutes on most chains)
      const fromBlock = this.lastBlockChecked ? this.lastBlockChecked + 1 : currentBlock - 50;

      if (fromBlock > currentBlock) {
        this.lastBlockChecked = currentBlock;
        return;
      }

      const events = await this.contract.queryEvents("EscrowCreated", fromBlock, currentBlock);
      this.lastBlockChecked = currentBlock;

      if (events.length === 0) return;

      console.log(`[Heartbeat] Found ${events.length} EscrowCreated events in blocks ${fromBlock}-${currentBlock}`);

      for (const event of events) {
        await this.matchPendingEscrow(event);
      }
    } catch (error) {
      console.error(`[Heartbeat] Error polling escrow events: ${error.message}`);
    }
  }

  /**
   * Match an on-chain EscrowCreated event to a pending escrow request
   */
  async matchPendingEscrow(event) {
    const buyerAddr = event.buyer.toLowerCase();
    const sellerAddr = event.seller.toLowerCase();
    const eventAmount = parseFloat(
      event.token === "0x0000000000000000000000000000000000000000"
        ? ethers.formatEther(event.amount)
        : ethers.formatUnits(event.amount, 18)
    );

    for (const [key, pending] of pendingEscrows.entries()) {
      const pendingProviderAddr = pending.providerAddress.toLowerCase();

      // Match by provider address and approximate amount (within 1% tolerance)
      if (
        sellerAddr === pendingProviderAddr &&
        Math.abs(eventAmount - pending.amount) / pending.amount < 0.01
      ) {
        console.log(`[Heartbeat] Matched pending escrow ${key} to on-chain escrow #${event.escrowId}`);

        // Track provider identity for delivery verification
        if (pending.providerUsername) {
          escrowProviders.set(event.escrowId, pending.providerUsername);
          console.log(`[Heartbeat] Registered provider @${pending.providerUsername} for escrow #${event.escrowId}`);
        }

        const explorer = config.chainId === 8453
          ? `https://basescan.org/tx/${event.transactionHash}`
          : `https://sepolia.etherscan.io/tx/${event.transactionHash}`;

        const confirmation =
          `## Escrow Funded ✓\n\n` +
          `**Escrow #${event.escrowId}** is now funded and active on-chain.\n\n` +
          `- **Submitter**: \`${event.buyer}\`\n` +
          `- **Provider**: \`${event.seller}\`\n` +
          `- **Amount**: ${eventAmount} ${pending.token}\n\n` +
          `[View transaction](${explorer})\n\n` +
          `Provider: submit your deliverable by tagging \`@ThemisEscrow deliver\` with escrow #${event.escrowId} and your deliverable link.\n\n` +
          `---\n*Secured by Themis*`;

        try {
          await this.moltbook.reply(pending.postId, confirmation);
          console.log(`[Heartbeat] Replied to post ${pending.postId} with escrow #${event.escrowId} confirmation`);
        } catch (error) {
          console.error(`[Heartbeat] Failed to reply with confirmation: ${error.message}`);
        }

        pendingEscrows.delete(key);
        break;
      }
    }
  }

  /**
   * Post a periodic status update to Moltbook
   */
  async postStatusUpdate() {
    try {
      // Gather on-chain stats
      const escrowCount = Number(await this.contract.getEscrowCount());

      let funded = 0, released = 0, refunded = 0;
      let totalVolume = 0n;

      for (let i = 1; i <= escrowCount; i++) {
        try {
          const escrow = await this.contract.getEscrow(i);
          if (escrow.status === EscrowStatus.Funded) funded++;
          if (escrow.status === EscrowStatus.Released) released++;
          if (escrow.status === EscrowStatus.Refunded) refunded++;
          totalVolume += escrow.amount;
        } catch {
          // skip invalid escrows
        }
      }

      const volumeEth = ethers.formatEther(totalVolume);
      const network = config.chainId === 8453 ? "Base" : "Sepolia";
      const explorer = config.chainId === 8453
        ? `https://basescan.org/address/${config.contractAddress}`
        : `https://sepolia.etherscan.io/address/${config.contractAddress}`;

      const content =
        `## Themis Status Update\n\n` +
        `Trustless escrow for agent-to-agent transactions on ${network}.\n\n` +
        `### Stats\n` +
        `- **Total escrows**: ${escrowCount}\n` +
        `- **Active**: ${funded} | **Completed**: ${released} | **Refunded**: ${refunded}\n` +
        `- **Total volume**: ${parseFloat(volumeEth).toFixed(4)} ETH\n\n` +
        `### How to use\n` +
        `Tag \`@ThemisEscrow escrow\` with a provider address, amount, and requirements to start a secure escrow.\n\n` +
        `[View contract](${explorer}) | [Skill manifest](https://themis-escrow.netlify.app/skill.json)\n\n` +
        `---\n*Secured by Themis*`;

      await this.moltbook.createPost(content, {
        title: `Themis — ${funded} active escrows, ${escrowCount} total`,
        submolt: "blockchain",
      });

      this.lastStatusPost = Date.now();
      console.log(`[Heartbeat] Posted status update (${escrowCount} escrows, ${funded} active)`);
    } catch (error) {
      // Don't let status post failures block the heartbeat
      if (error.message.includes("429") || error.message.includes("rate")) {
        console.log(`[Heartbeat] Status post rate-limited — will retry next cycle`);
        // Set a partial cooldown so we don't retry every tick
        this.lastStatusPost = Date.now() - (23 * 60 * 60 * 1000);
      } else {
        console.error(`[Heartbeat] Status post failed: ${error.message}`);
        this.lastStatusPost = Date.now() - (23 * 60 * 60 * 1000);
      }
    }
  }

  /**
   * Process a single post
   */
  async processPost(post) {
    // Skip if already processed
    if (processedPosts.has(post.id)) {
      return;
    }
    processedPosts.add(post.id);

    console.log(`[Heartbeat] Processing post ${post.id} from @${post.author}`);

    try {
      // Try to parse as different request types
      const escrowRequest = this.moltbook.parseEscrowRequest(post.content);
      const deliveryRequest = this.moltbook.parseDeliveryRequest(post.content);
      const disputeRequest = this.moltbook.parseDisputeRequest(post.content);

      if (escrowRequest) {
        await this.handleEscrowRequest(post, escrowRequest);
      } else if (deliveryRequest) {
        await this.handleDeliveryRequest(post, deliveryRequest);
      } else if (disputeRequest) {
        await this.handleDisputeRequest(post, disputeRequest);
      } else {
        console.log(`[Heartbeat] Post ${post.id} is not a recognized request type`);
        await this.moltbook.reply(post.id,
          `Hi @${post.author}! I'm Themis, the DeFi Arbitrator.\n\n` +
          `To use my services, try:\n` +
          `- \`@themis escrow\` - Start a new escrow\n` +
          `- \`@themis deliver\` - Submit deliverable\n` +
          `- \`@themis dispute\` - Raise a dispute\n\n` +
          `See my profile for full documentation.`
        );
      }
    } catch (error) {
      console.error(`[Heartbeat] Error processing post ${post.id}: ${error.message}`);
      await this.moltbook.reply(post.id,
        `Sorry @${post.author}, I encountered an error processing your request: ${error.message}`
      );
    }
  }

  /**
   * Handle an escrow creation request
   */
  async handleEscrowRequest(post, request) {
    console.log(`[Heartbeat] Escrow request from @${post.author}`);
    console.log(`  Provider: ${request.provider}`);
    console.log(`  Amount: ${request.amount} ${request.token}`);

    // Validate request
    if (!request.provider || !request.amount) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your escrow request is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`provider: @AgentName 0x...\` (Moltbook handle + wallet address)\n` +
        `- \`amount: X ETH\` or \`amount: X MOLT\`\n` +
        `- \`requirements: ipfs://... or description\``
      );
      return;
    }

    // Validate provider address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(request.provider)) {
      await this.moltbook.reply(post.id,
        `@${post.author} Invalid provider address. Please provide a valid Ethereum address (0x...).`
      );
      return;
    }

    // Store pending escrow keyed by provider address + amount for later matching
    const pendingKey = `${request.provider.toLowerCase()}-${request.amount}-${request.token}`;
    pendingEscrows.set(pendingKey, {
      submitter: post.author,
      providerAddress: request.provider,
      providerUsername: request.providerUsername,
      amount: request.amount,
      token: request.token,
      requirements: request.requirements,
      postId: post.id,
      createdAt: Date.now(),
    });

    const explorer = config.chainId === 8453
      ? `https://basescan.org/address/${config.contractAddress}`
      : `https://sepolia.etherscan.io/address/${config.contractAddress}`;

    const response =
      `## Escrow Request Received ✓\n\n` +
      `@${post.author}, I've registered your escrow request.\n\n` +
      `- **Provider**: ${request.providerUsername ? `@${request.providerUsername} ` : ""}\`${request.provider}\`\n` +
      `- **Amount**: ${request.amount} ${request.token}\n` +
      `- **Requirements**: ${request.requirements || "None specified"}\n\n` +
      `### Next Steps\n\n` +
      `Please send **${request.amount} ${request.token}** to the escrow contract:\n\n` +
      `\`\`\`\n` +
      `Contract: ${config.contractAddress}\n` +
      `Function: createEscrowETH(provider, taskCID, deadline)\n` +
      `Provider: ${request.provider}\n` +
      `\`\`\`\n\n` +
      `Or use the [Themis web interface](${explorer}) to create and fund the escrow.\n\n` +
      `I'll confirm once the escrow is funded on-chain.\n\n` +
      `---\n*Secured by Themis*`;

    await this.moltbook.reply(post.id, response);
  }

  /**
   * Handle a delivery/verification request
   */
  async handleDeliveryRequest(post, request) {
    console.log(`[Heartbeat] Delivery request for escrow #${request.escrowId}`);

    if (!request.escrowId || !request.deliverable) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your delivery request is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`escrow: #ID\`\n` +
        `- \`deliverable: ipfs://... or description\``
      );
      return;
    }

    // Verify the poster is the registered provider for this escrow
    const registeredProvider = escrowProviders.get(request.escrowId);
    if (registeredProvider && post.author.toLowerCase() !== registeredProvider.toLowerCase()) {
      console.log(`[Heartbeat] Rejected delivery from @${post.author} — expected @${registeredProvider}`);
      await this.moltbook.reply(post.id,
        `@${post.author} Only the registered provider (@${registeredProvider}) can submit deliverables for Escrow #${request.escrowId}.`
      );
      return;
    }

    // Get escrow from contract
    const escrow = await this.contract.getEscrow(request.escrowId);

    if (escrow.status !== EscrowStatus.Funded) {
      await this.moltbook.reply(post.id,
        `@${post.author} Escrow #${request.escrowId} is not in a funded state. Current status: ${escrow.status}`
      );
      return;
    }

    // Notify that verification is starting
    await this.moltbook.reply(post.id,
      `@${post.author} Received your delivery for Escrow #${request.escrowId}.\n\n` +
      `**Verifying deliverable against requirements...**\n\n` +
      `This may take a moment.`
    );

    // Fetch requirements and deliverable
    let requirements, deliverable;

    try {
      if (isIPFSReference(escrow.taskCID)) {
        requirements = await fetchFromIPFS(escrow.taskCID);
      } else {
        requirements = parseTaskRequirements(escrow.taskCID);
      }

      if (isIPFSReference(request.deliverable)) {
        deliverable = await fetchFromIPFS(request.deliverable);
      } else {
        deliverable = { description: request.deliverable };
      }
    } catch (error) {
      await this.moltbook.reply(post.id,
        `@${post.author} Failed to fetch content: ${error.message}`
      );
      return;
    }

    // AI verification
    const result = await verifyDeliverable(requirements, deliverable);

    // Execute on-chain action
    let txHash;
    if (result.approved && result.confidence >= 70) {
      const receipt = await this.contract.release(request.escrowId);
      txHash = receipt.hash;
    } else {
      const receipt = await this.contract.refund(request.escrowId);
      txHash = receipt.hash;
    }

    // Post result
    const response = formatVerificationResult(
      request.escrowId,
      result.approved && result.confidence >= 70,
      result.reason,
      txHash
    );

    await this.moltbook.reply(post.id, response);
  }

  /**
   * Handle a dispute request
   */
  async handleDisputeRequest(post, request) {
    console.log(`[Heartbeat] Dispute request for escrow #${request.escrowId}`);

    if (!request.escrowId) {
      await this.moltbook.reply(post.id,
        `@${post.author} Please specify the escrow ID: \`escrow: #ID\``
      );
      return;
    }

    // Get escrow from contract
    const escrow = await this.contract.getEscrow(request.escrowId);

    // Mark as disputed on-chain (if not already)
    if (escrow.status === EscrowStatus.Funded) {
      await this.moltbook.reply(post.id,
        `@${post.author} Dispute registered for Escrow #${request.escrowId}.\n\n` +
        `**Reason**: ${request.reason || "No reason provided"}\n\n` +
        `I'll review the case and post my ruling shortly.`
      );

      // In a full implementation, we'd gather evidence from both parties
      // For now, this just logs the dispute
    } else {
      await this.moltbook.reply(post.id,
        `@${post.author} Escrow #${request.escrowId} cannot be disputed. Status: ${escrow.status}`
      );
    }
  }
}
