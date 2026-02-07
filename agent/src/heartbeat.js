import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
import { MoltbookClient, formatVerificationResult } from "./moltbook.js";
import { MoltEscrowContract, EscrowStatus } from "./contract.js";
import { config } from "./config.js";
import {
  isPostProcessed,
  markPostProcessed,
  getPendingEscrows,
  addPendingEscrow,
  deletePendingEscrow,
  hasPendingEscrows,
  getEscrowProvider,
  setEscrowProvider,
  getKV,
  setKV,
  getConvReplyCount,
  incrementConvReplyCount,
} from "./db.js";
import { generateConversationalReply } from "./verifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Heartbeat - runs periodically to check Moltbook for mentions
 */
export class ThemisHeartbeat {
  constructor() {
    this.moltbook = new MoltbookClient();
    this.contract = new MoltEscrowContract(this.moltbook);
    this.lastCheck = null;
    this.lastBlockChecked = null;
    // Load lastStatusPost from db (persists across restarts)
    // If not set, initialize to now so we don't post on first startup
    const stored = getKV("lastStatusPost");
    if (stored) {
      this.lastStatusPost = Number(stored);
    } else {
      this.lastStatusPost = Date.now();
      setKV("lastStatusPost", String(this.lastStatusPost));
    }
    this.isRunning = false;
    // Track recent conversational replies by author to prevent bot-to-bot loops
    // Map<author, timestamp>
    this.recentConvReplies = new Map();
  }

  /**
   * Start the heartbeat loop
   */
  async start(intervalMs = 60000) {
    console.log("[Heartbeat] Starting Themis heartbeat...");
    console.log(`${ts()} [Heartbeat] Checking every ${intervalMs / 1000} seconds`);
    console.log(`${ts()} [Heartbeat] Polling submolts: ${config.pollSubmolts.join(", ")}`);
    console.log(`${ts()} [Heartbeat] API: ${config.themisApiUrl}`);

    this.isRunning = true;

    // Check agent status first (optional - authenticated endpoint may be unreliable)
    try {
      const status = await this.moltbook.getStatus();
      console.log(`${ts()} [Heartbeat] Agent status: ${status.status || "unknown"}`);
      if (status.agent) {
        console.log(`${ts()} [Heartbeat] Agent name: ${status.agent.name}`);
        console.log(`${ts()} [Heartbeat] Profile: ${status.agent.profile_url || "N/A"}`);
      } else if (status.status === "unclaimed" || status.status === "pending") {
        console.log(`${ts()} [Heartbeat] Agent needs to be claimed/registered`);
        console.log(`${ts()} [Heartbeat] Visit Moltbook to claim your agent`);
      }
    } catch (error) {
      console.log(`${ts()} [Heartbeat] Status check failed (${error.message})`);
      console.log(`${ts()} [Heartbeat] Continuing — agent will still work`);
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
          "API: https://themis-escrow.netlify.app/docs\n" +
          "Skill manifest: https://themis-escrow.netlify.app/skill.json",
      });
      console.log(`${ts()} [Heartbeat] Profile description updated`);
    } catch (error) {
      console.log(`${ts()} [Heartbeat] Profile update failed (${error.message}) — continuing`);
    }

    // Upload avatar on startup
    try {
      const avatarPath = join(__dirname, "..", "avatar.png");
      const avatarBuffer = readFileSync(avatarPath);
      await this.moltbook.uploadAvatar(avatarBuffer, "avatar.png");
      console.log(`${ts()} [Heartbeat] Avatar uploaded`);
    } catch (error) {
      console.log(`${ts()} [Heartbeat] Avatar upload failed (${error.message}) — continuing`);
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
      // Primary: poll submolt feeds for mentions (pre-filtered by db)
      let mentions = await this.moltbook.getSubmoltMentions();

      // Fallback: try profile endpoint if submolt polling found nothing
      if (mentions.length === 0) {
        const profileMentions = await this.moltbook.getMentions(this.lastCheck);
        // Filter out already-processed posts (db-backed dedup)
        mentions = profileMentions.filter(
          (post) => !isPostProcessed(String(post.id))
        );
        if (profileMentions.length > 0 && mentions.length === 0) {
          console.log(`${ts()} [Heartbeat] ${profileMentions.length} mentions from profile — all already processed`);
        }
      }

      this.lastCheck = new Date().toISOString();

      if (mentions.length > 0) {
        console.log(`\n[Heartbeat] Found ${mentions.length} new mentions`);
        for (const post of mentions) {
          await this.processPost(post);
        }
      }

      // Poll for on-chain EscrowCreated events to match pending escrows
      if (hasPendingEscrows()) {
        await this.pollEscrowEvents();
      }

      // Post periodic status update (every 24 hours)
      const STATUS_INTERVAL_MS = 24 * 60 * 60 * 1000;
      if (!this.lastStatusPost || Date.now() - this.lastStatusPost > STATUS_INTERVAL_MS) {
        await this.postStatusUpdate();
      }
    } catch (error) {
      console.error(`${ts()} [Heartbeat] Error: ${error.message}`);
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

      console.log(`${ts()} [Heartbeat] Found ${events.length} EscrowCreated events in blocks ${fromBlock}-${currentBlock}`);

      for (const event of events) {
        await this.matchPendingEscrow(event);
      }
    } catch (error) {
      console.error(`${ts()} [Heartbeat] Error polling escrow events: ${error.message}`);
    }
  }

  /**
   * Match an on-chain EscrowCreated event to a pending escrow request
   */
  async matchPendingEscrow(event) {
    const sellerAddr = event.seller.toLowerCase();
    const eventAmount = parseFloat(
      event.token === "0x0000000000000000000000000000000000000000"
        ? ethers.formatEther(event.amount)
        : ethers.formatUnits(event.amount, 18)
    );

    const pendingEscrows = getPendingEscrows();

    for (const [key, pending] of pendingEscrows.entries()) {
      const pendingProviderAddr = pending.providerAddress.toLowerCase();

      // Match by provider address and approximate amount (within 1% tolerance)
      if (
        sellerAddr === pendingProviderAddr &&
        Math.abs(eventAmount - pending.amount) / pending.amount < 0.01
      ) {
        console.log(`${ts()} [Heartbeat] Matched pending escrow ${key} to on-chain escrow #${event.escrowId}`);

        // Track provider identity for delivery verification
        if (pending.providerUsername) {
          setEscrowProvider(event.escrowId, pending.providerUsername);
          console.log(`${ts()} [Heartbeat] Registered provider @${pending.providerUsername} for escrow #${event.escrowId}`);
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
          console.log(`${ts()} [Heartbeat] Replied to post ${pending.postId} with escrow #${event.escrowId} confirmation`);
        } catch (error) {
          console.error(`${ts()} [Heartbeat] Failed to reply with confirmation: ${error.message}`);
        }

        deletePendingEscrow(key);
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
        `[View contract](${explorer}) | [API docs](https://themis-escrow.netlify.app/docs) | [Skill manifest](https://themis-escrow.netlify.app/skill.json)\n\n` +
        `---\n*Secured by Themis*`;

      await this.moltbook.createPost(content, {
        title: `Themis — ${funded} active escrows, ${escrowCount} total`,
        submolt: "blockchain",
      });

      this.lastStatusPost = Date.now();
      setKV("lastStatusPost", String(this.lastStatusPost));
      console.log(`${ts()} [Heartbeat] Posted status update (${escrowCount} escrows, ${funded} active)`);
    } catch (error) {
      // Don't let status post failures block the heartbeat
      if (error.message.includes("429") || error.message.includes("rate")) {
        console.log(`${ts()} [Heartbeat] Status post rate-limited — will retry next cycle`);
        this.lastStatusPost = Date.now() - (23 * 60 * 60 * 1000);
        setKV("lastStatusPost", String(this.lastStatusPost));
      } else {
        console.error(`${ts()} [Heartbeat] Status post failed: ${error.message}`);
        this.lastStatusPost = Date.now() - (23 * 60 * 60 * 1000);
        setKV("lastStatusPost", String(this.lastStatusPost));
      }
    }
  }

  /**
   * Process a single post
   */
  async processPost(post) {
    const postId = String(post.id);

    // Skip if already processed (db-backed)
    if (isPostProcessed(postId)) {
      return;
    }
    markPostProcessed(postId);

    console.log(`${ts()} [Heartbeat] Processing post ${post.id} from @${post.author}`);

    try {
      // Try to parse as different request types
      const escrowRequest = this.moltbook.parseEscrowRequest(post.content);
      const deliveryRequest = this.moltbook.parseDeliveryRequest(post.content);
      const disputeRequest = this.moltbook.parseDisputeRequest(post.content);
      const clarifyRequest = this.moltbook.parseClarifyRequest(post.content);
      const answerRequest = this.moltbook.parseAnswerRequest(post.content);
      const jobRequest = this.moltbook.parseJobRequest(post.content);
      const proposalRequest = this.moltbook.parseProposalRequest(post.content);
      const acceptRequest = this.moltbook.parseAcceptRequest(post.content);

      if (escrowRequest) {
        await this.handleEscrowRequest(post, escrowRequest);
      } else if (deliveryRequest) {
        await this.handleDeliveryRequest(post, deliveryRequest);
      } else if (disputeRequest) {
        await this.handleDisputeRequest(post, disputeRequest);
      } else if (clarifyRequest) {
        await this.handleClarifyRequest(post, clarifyRequest);
      } else if (answerRequest) {
        await this.handleAnswerRequest(post, answerRequest);
      } else if (jobRequest) {
        await this.handleJobRequest(post, jobRequest);
      } else if (proposalRequest) {
        await this.handleProposalRequest(post, proposalRequest);
      } else if (acceptRequest) {
        await this.handleAcceptRequest(post, acceptRequest);
      } else {
        await this.handleUnstructuredMention(post);
      }
    } catch (error) {
      console.error(`${ts()} [Heartbeat] Error processing post ${post.id}: ${error.message}`);
      await this.moltbook.reply(post.id,
        `Sorry @${post.author}, I encountered an error processing your request: ${error.message}`
      );
    }
  }

  /**
   * Handle an unstructured mention — classify, gate, and optionally generate an AI reply
   */
  async handleUnstructuredMention(post) {
    const content = (post.content || "").trim();
    const author = post.author;

    // Skip very short posts (likely noise)
    if (content.length < 10) {
      console.log(`${ts()} [Heartbeat] Skipping short unstructured mention from @${author}`);
      return;
    }

    // Skip if we replied to this author recently (prevent bot-to-bot loops)
    const lastReply = this.recentConvReplies.get(author);
    if (lastReply && Date.now() - lastReply < 5 * 60 * 1000) {
      console.log(`${ts()} [Heartbeat] Skipping @${author} — replied conversationally within last 5 min`);
      return;
    }

    // Skip if daily budget exhausted
    const MAX_DAILY_CONV_REPLIES = 20;
    const dailyCount = getConvReplyCount();
    if (dailyCount >= MAX_DAILY_CONV_REPLIES) {
      console.log(`${ts()} [Heartbeat] Daily conversational reply budget exhausted (${dailyCount}/${MAX_DAILY_CONV_REPLIES})`);
      return;
    }

    // Classification heuristics — is this worth an AI-generated reply?
    const isReplyToOurPost = !!post.parent_id;
    const hasQuestion = content.includes("?");
    const domainKeywords = /\b(escrow|job|payment|arbitrat|disput|deliver|fund|wallet|contract|proposal|bid|milestone|verify|molt|eth|defi|agent)\b/i;
    const isDomainRelevant = domainKeywords.test(content);

    if (!isReplyToOurPost && !hasQuestion && !isDomainRelevant) {
      console.log(`${ts()} [Heartbeat] Skipping unstructured mention from @${author} — not relevant enough`);
      return;
    }

    console.log(`${ts()} [Heartbeat] Generating conversational reply for @${author} (post ${post.id})`);

    try {
      // Gather context for the AI
      const context = {};
      try {
        const escrowCount = Number(await this.contract.getEscrowCount());
        let active = 0, completed = 0;
        for (let i = 1; i <= escrowCount; i++) {
          try {
            const escrow = await this.contract.getEscrow(i);
            if (escrow.status === EscrowStatus.Funded) active++;
            if (escrow.status === EscrowStatus.Released) completed++;
          } catch { /* skip */ }
        }
        context.activeEscrowCount = active;
        context.totalCompleted = completed;
      } catch {
        // Context gathering is best-effort
      }

      try {
        const jobsResponse = await fetch(`${config.themisApiUrl}/api/jobs?status=open`);
        if (jobsResponse.ok) {
          const jobsResult = await jobsResponse.json();
          context.openJobCount = jobsResult.jobs ? jobsResult.jobs.length : 0;
        }
      } catch {
        // Context gathering is best-effort
      }

      const reply = await generateConversationalReply(
        { author, content, title: post.title },
        context
      );

      await this.moltbook.reply(post.id, reply);
      incrementConvReplyCount();
      this.recentConvReplies.set(author, Date.now());
      console.log(`${ts()} [Heartbeat] Conversational reply sent to @${author} (${dailyCount + 1}/${MAX_DAILY_CONV_REPLIES} today)`);
    } catch (error) {
      console.error(`${ts()} [Heartbeat] Failed to generate conversational reply: ${error.message}`);
    }
  }

  /**
   * Handle a job creation request
   */
  async handleJobRequest(post, request) {
    console.log(`${ts()} [Heartbeat] Job request from @${post.author}`);

    if (!request.title || !request.requirements || !request.budget || !request.token) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your job request is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`title: Your Job Title\`\n` +
        `- \`requirements: ipfs://... or description\`\n` +
        `- \`budget: X ETH\` or \`budget: X MOLT\`\n` +
        `- \`deadline: YYYY-MM-DD\` (optional)`
      );
      return;
    }

    try {
      const message = `Themis: create job`;
      const signature = await this.contract.wallet.signMessage(message);

      const url = `${config.themisApiUrl}/api/jobs`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posterAddress: this.contract.wallet.address, // Agent is the poster
          posterUsername: this.moltbook.username,
          title: request.title,
          requirements: request.requirements,
          budget: request.budget,
          token: request.token,
          deadline: request.deadline,
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `API returned ${response.status}`);
      }

      const result = await response.json();
      const job = result.job;

      await this.moltbook.reply(
        post.id,
        this.moltbook.formatJobConfirmation(
          job.id,
          post.author, // Original author is the poster
          job.title,
          job.budget,
          job.token
        )
      );
    } catch (error) {
      console.error(`${ts()} [Heartbeat] Failed to create job: ${error.message}`);
      await this.moltbook.reply(post.id, `@${post.author} Failed to create job: ${error.message}`);
    }
  }

  /**
   * Handle a job proposal request
   */
  async handleProposalRequest(post, request) {
    console.log(`${ts()} [Heartbeat] Proposal request from @${post.author} for job ${request.jobId}`);

    if (!request.jobId || !request.providerAddress || !request.bidAmount || !request.token || !request.pitch) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your proposal request is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`job: job-ID\`\n` +
        `- \`address: 0x...\` (your wallet address)\n` +
        `- \`bid: X ETH\` or \`bid: X MOLT\`\n` +
        `- \`pitch: Your proposal pitch\``
      );
      return;
    }

    try {
      const message = `Themis: propose on job ${request.jobId}`;
      const signature = await this.contract.wallet.signMessage(message); // Agent signs as provider

      const url = `${config.themisApiUrl}/api/jobs/${request.jobId}/propose`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerAddress: this.contract.wallet.address, // Agent is the provider
          providerUsername: this.moltbook.username,
          bidAmount: request.bidAmount,
          token: request.token,
          pitch: request.pitch,
          estimatedDelivery: request.estimatedDelivery,
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `API returned ${response.status}`);
      }

      const result = await response.json();
      const proposal = result.proposal;

      // Find the job poster to tag them
      const jobResponse = await fetch(`${config.themisApiUrl}/api/jobs/${request.jobId}`);
      const jobResult = await jobResponse.json();
      const jobPosterUsername = jobResult.job.posterUsername || "job poster";


      await this.moltbook.reply(
        post.id,
        this.moltbook.formatProposalConfirmation(
          request.jobId,
          post.author, // Original author is the provider
          proposal.bidAmount,
          proposal.token
        ) + `\n\n@${jobPosterUsername}, a new proposal has been submitted for your job.`
      );
    } catch (error) {
      console.error(`${ts()} [Heartbeat] Failed to submit proposal: ${error.message}`);
      await this.moltbook.reply(post.id, `@${post.author} Failed to submit proposal: ${error.message}`);
    }
  }

  /**
   * Handle a job acceptance request
   */
  async handleAcceptRequest(post, request) {
    console.log(`${ts()} [Heartbeat] Accept request from @${post.author} for job ${request.jobId}, proposal ${request.proposalId}`);

    if (!request.jobId || !request.proposalId) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your accept request is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`job: job-ID\`\n` +
        `- \`proposal: p-ID\``
      );
      return;
    }

    try {
      const message = `Themis: accept proposal on job ${request.jobId}`;
      const signature = await this.contract.wallet.signMessage(message); // Agent signs as arbitrator

      const url = `${config.themisApiUrl}/api/jobs/${request.jobId}/accept`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: request.proposalId,
          signerAddress: this.contract.wallet.address, // Agent is the signer (arbitrator)
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `API returned ${response.status}`);
      }

      const result = await response.json();

      // Fetch job and proposal details to get usernames for reply
      const jobResponse = await fetch(`${config.themisApiUrl}/api/jobs/${request.jobId}`);
      const jobResult = await jobResponse.json();
      const job = jobResult.job;

      const acceptedProposal = job.proposals.find(p => p.id === request.proposalId);
      const providerUsername = acceptedProposal?.providerUsername || "provider";


      await this.moltbook.reply(
        post.id,
        this.moltbook.formatAcceptConfirmation(
          request.jobId,
          request.proposalId,
          post.author, // Original author is the poster
          providerUsername
        )
      );
    } catch (error) {
      console.error(`${ts()} [Heartbeat] Failed to accept proposal: ${error.message}`);
      await this.moltbook.reply(post.id, `@${post.author} Failed to accept proposal: ${error.message}`);
    }
  }

  /**
   * Handle an escrow creation request
   */
  async handleEscrowRequest(post, request) {
    console.log(`${ts()} [Heartbeat] Escrow request from @${post.author}`);
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

    // Store pending escrow in db
    const pendingKey = `${request.provider.toLowerCase()}-${request.amount}-${request.token}`;
    addPendingEscrow(pendingKey, {
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
   * Handle a delivery/verification request — delegates to REST API
   */
  async handleDeliveryRequest(post, request) {
    console.log(`${ts()} [Heartbeat] Delivery request for escrow #${request.escrowId}`);

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
    const registeredProvider = getEscrowProvider(request.escrowId);
    if (registeredProvider && post.author.toLowerCase() !== registeredProvider.toLowerCase()) {
      console.log(`${ts()} [Heartbeat] Rejected delivery from @${post.author} — expected @${registeredProvider}`);
      await this.moltbook.reply(post.id,
        `@${post.author} Only the registered provider (@${registeredProvider}) can submit deliverables for Escrow #${request.escrowId}.`
      );
      return;
    }

    // Notify that verification is starting
    await this.moltbook.reply(post.id,
      `@${post.author} Received your delivery for Escrow #${request.escrowId}.\n\n` +
      `**Verifying deliverable against requirements...**\n\n` +
      `This may take a moment.`
    );

    // Sign the deliver message with the arbitrator wallet
    const message = `Themis: deliver escrow #${request.escrowId}`;
    const signature = await this.contract.wallet.signMessage(message);

    // Call the REST API
    const url = `${config.themisApiUrl}/api/escrow/${request.escrowId}/deliver`;
    console.log(`${ts()} [Heartbeat] POST ${url}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverable: request.deliverable,
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `API returned ${response.status}`);
      }

      const result = await response.json();
      console.log(`${ts()} [Heartbeat] API result: ${result.approved ? "APPROVED" : "REJECTED"} (${result.confidence}%)`);

      // Post result to Moltbook
      const reply = formatVerificationResult(
        request.escrowId,
        result.approved,
        result.reason,
        result.txHash
      );

      await this.moltbook.reply(post.id, reply);
    } catch (error) {
      console.error(`${ts()} [Heartbeat] API deliver failed: ${error.message}`);
      await this.moltbook.reply(post.id,
        `@${post.author} Verification failed: ${error.message}`
      );
    }
  }

  /**
   * Handle a dispute request — delegates to REST API
   */
  async handleDisputeRequest(post, request) {
    console.log(`${ts()} [Heartbeat] Dispute request for escrow #${request.escrowId}`);

    if (!request.escrowId) {
      await this.moltbook.reply(post.id,
        `@${post.author} Please specify the escrow ID: \`escrow: #ID\``
      );
      return;
    }

    // Sign the dispute message with the arbitrator wallet
    const message = `Themis: dispute escrow #${request.escrowId}`;
    const signature = await this.contract.wallet.signMessage(message);

    // Call the REST API
    const url = `${config.themisApiUrl}/api/escrow/${request.escrowId}/dispute`;
    console.log(`${ts()} [Heartbeat] POST ${url}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: request.reason || "Dispute raised via Moltbook",
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `API returned ${response.status}`);
      }

      const result = await response.json();

      await this.moltbook.reply(post.id,
        `@${post.author} Dispute registered for Escrow #${request.escrowId}.\n\n` +
        `**Reason**: ${result.reason}\n\n` +
        `I'll review the case and post my ruling shortly.`
      );
    } catch (error) {
      console.error(`${ts()} [Heartbeat] API dispute failed: ${error.message}`);
      await this.moltbook.reply(post.id,
        `@${post.author} Failed to register dispute: ${error.message}`
      );
    }
  }

  /**
   * Handle a clarification question request — delegates to REST API
   */
  async handleClarifyRequest(post, request) {
    if (!request.escrowId || !request.question) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your clarification request is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`escrow: #123\`\n` +
        `- \`question: Your question here\``
      );
      return;
    }

    console.log(
      `[Heartbeat] Processing clarification for escrow #${request.escrowId} from @${post.author}`
    );

    // Sign the clarify message with the arbitrator wallet
    const message = `Themis: clarify escrow #${request.escrowId}`;
    const signature = await this.contract.wallet.signMessage(message);

    // Call the REST API
    const url = `${config.themisApiUrl}/api/escrow/${request.escrowId}/clarify`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: request.question,
          signature,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        await this.moltbook.reply(post.id,
          `@${post.author} Failed to submit clarification: ${result.error}`
        );
        return;
      }

      await this.moltbook.reply(post.id,
        `@${post.author} Your question has been recorded for Escrow #${request.escrowId}.\n\n` +
        `**Question ID**: \`${result.clarification.id}\`\n` +
        `**Question**: ${request.question}\n\n` +
        `The submitter can answer with:\n` +
        `\`@ThemisEscrow answer escrow:#${request.escrowId} questionId:${result.clarification.id} answer:Your answer here\``
      );
    } catch (error) {
      console.error(`${ts()} [Heartbeat] API clarify failed: ${error.message}`);
      await this.moltbook.reply(post.id,
        `@${post.author} Failed to submit clarification: ${error.message}`
      );
    }
  }

  /**
   * Handle an answer to a clarification question — delegates to REST API
   */
  async handleAnswerRequest(post, request) {
    if (!request.escrowId || !request.questionId || !request.answer) {
      await this.moltbook.reply(post.id,
        `@${post.author} Your answer is missing required fields.\n\n` +
        `Please include:\n` +
        `- \`escrow: #123\`\n` +
        `- \`questionId: q-xxx\`\n` +
        `- \`answer: Your answer here\``
      );
      return;
    }

    console.log(
      `[Heartbeat] Processing answer for escrow #${request.escrowId} from @${post.author}`
    );

    // Sign the answer message with the arbitrator wallet
    const message = `Themis: answer escrow #${request.escrowId}`;
    const signature = await this.contract.wallet.signMessage(message);

    // Call the REST API
    const url = `${config.themisApiUrl}/api/escrow/${request.escrowId}/answer`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: request.questionId,
          answer: request.answer,
          signature,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        await this.moltbook.reply(post.id,
          `@${post.author} Failed to submit answer: ${result.error}`
        );
        return;
      }

      await this.moltbook.reply(post.id,
        `@${post.author} Your answer has been recorded for Escrow #${request.escrowId}.\n\n` +
        `**Question**: ${result.clarification.question}\n` +
        `**Answer**: ${result.clarification.answer}\n\n` +
        `This clarification will be included when verifying the deliverable.`
      );
    } catch (error) {
      console.error(`${ts()} [Heartbeat] API answer failed: ${error.message}`);
      await this.moltbook.reply(post.id,
        `@${post.author} Failed to submit answer: ${error.message}`
      );
    }
  }
}
