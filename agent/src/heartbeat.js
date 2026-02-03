import { MoltbookClient, formatEscrowConfirmation, formatVerificationResult } from "./moltbook.js";
import { MoltEscrowContract, EscrowStatus } from "./contract.js";
import { fetchFromIPFS, parseTaskRequirements } from "./ipfs.js";
import { verifyDeliverable, verifyDispute } from "./verifier.js";
import { config } from "./config.js";

// Track processed posts to avoid duplicates
const processedPosts = new Set();

// Track pending escrows awaiting funding
const pendingEscrows = new Map();

/**
 * Heartbeat - runs periodically to check Moltbook for mentions
 */
export class ThemisHeartbeat {
  constructor() {
    this.moltbook = new MoltbookClient();
    this.contract = new MoltEscrowContract(this.moltbook);
    this.lastCheck = null;
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

      if (mentions.length === 0) {
        return; // Silent when no mentions
      }

      console.log(`\n[Heartbeat] Found ${mentions.length} new mentions`);

      // Process each mention
      for (const post of mentions) {
        await this.processPost(post);
      }
    } catch (error) {
      console.error(`[Heartbeat] Error: ${error.message}`);
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
    console.log(`  Seller: @${request.seller}`);
    console.log(`  Amount: ${request.amount} ${request.token}`);

    // Validate request
    if (!request.seller || !request.amount) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your escrow request is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`seller: @username\`\n` +
        `- \`amount: X ETH\` or \`amount: X MOLT\`\n` +
        `- \`requirements: ipfs://... or description\``
      );
      return;
    }

    // Create escrow confirmation
    const escrowId = `pending-${Date.now()}`;
    pendingEscrows.set(escrowId, {
      buyer: post.author,
      seller: request.seller,
      amount: request.amount,
      token: request.token,
      requirements: request.requirements,
      postId: post.id,
      createdAt: Date.now(),
    });

    const response = formatEscrowConfirmation(
      escrowId,
      post.author,
      request.seller,
      request.amount,
      request.token,
      config.contractAddress
    );

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
      if (escrow.taskCID.startsWith("ipfs://") || escrow.taskCID.startsWith("Qm")) {
        requirements = await fetchFromIPFS(escrow.taskCID);
      } else {
        requirements = parseTaskRequirements(escrow.taskCID);
      }

      if (request.deliverable.startsWith("ipfs://") || request.deliverable.startsWith("Qm")) {
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
