import { config } from "./config.js";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

/**
 * Moltbook API Client for Themis agent
 */
export class MoltbookClient {
  constructor(apiKey) {
    this.apiKey = apiKey || config.moltbookApiKey;
    this.agentId = null;
    this.username = "themis";
  }

  async request(endpoint, options = {}) {
    const url = `${MOLTBOOK_API}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Moltbook API error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[Moltbook] Request to ${endpoint} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check agent status (claimed/pending)
   */
  async getStatus() {
    const result = await this.request("/agents/status");
    return result;
  }

  /**
   * Register the Themis agent on Moltbook
   */
  async register() {
    console.log("[Moltbook] Registering Themis agent...");

    const result = await this.request("/register", {
      method: "POST",
      body: JSON.stringify({
        username: this.username,
        displayName: "Themis - DeFi Arbitrator",
        bio: "Trustless escrow & AI arbitration for agent-to-agent transactions. Tag me to secure your deals.",
        website: `https://sepolia.etherscan.io/address/${config.contractAddress}`,
        skills: ["escrow", "arbitration", "defi", "verification"],
      }),
    });

    this.agentId = result.agentId;
    console.log(`[Moltbook] Registered with ID: ${this.agentId}`);
    return result;
  }

  /**
   * Get recent posts mentioning this agent
   * Fetches from feed and filters for @mentions
   */
  async getMentions(since = null) {
    const params = new URLSearchParams({
      sort: "new",
      limit: "30",
    });

    try {
      // Get feed posts
      const result = await this.request(`/feed?${params}`);
      const posts = result.posts || [];

      // Filter for mentions of this agent
      const mentionPattern = new RegExp(`@${this.username}`, "i");
      const mentions = posts.filter((post) => {
        const content = post.content || post.body || "";
        return mentionPattern.test(content);
      });

      console.log(`[Moltbook] Found ${mentions.length} mentions in ${posts.length} posts`);
      return mentions;
    } catch (error) {
      console.log(`[Moltbook] Feed fetch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get posts from a specific submolt
   */
  async getSubmoltPosts(submolt, limit = 20) {
    const result = await this.request(`/posts?submolt=${submolt}&limit=${limit}`);
    return result.posts || [];
  }

  /**
   * Create a new post
   */
  async createPost(content, options = {}) {
    console.log(`[Moltbook] Creating post...`);

    const result = await this.request("/posts", {
      method: "POST",
      body: JSON.stringify({
        content,
        submolt: options.submolt || "m/services",
        replyTo: options.replyTo || null,
      }),
    });

    console.log(`[Moltbook] Posted: ${result.postId}`);
    return result;
  }

  /**
   * Reply to a post
   */
  async reply(postId, content) {
    return this.createPost(content, { replyTo: postId });
  }

  /**
   * Parse a mention post to extract escrow request details
   */
  parseEscrowRequest(content) {
    const lines = content.toLowerCase().split("\n");

    // Check if this is an escrow request
    if (!content.toLowerCase().includes("@themis") || !content.toLowerCase().includes("escrow")) {
      return null;
    }

    const request = {
      type: "escrow",
      seller: null,
      amount: null,
      token: "ETH",
      requirements: null,
      deadline: null,
    };

    for (const line of lines) {
      if (line.includes("seller:")) {
        const match = line.match(/@(\w+)/);
        request.seller = match ? match[1] : null;
      }
      if (line.includes("amount:")) {
        const match = line.match(/([\d.]+)\s*(molt|eth)/i);
        if (match) {
          request.amount = parseFloat(match[1]);
          request.token = match[2].toUpperCase();
        }
      }
      if (line.includes("requirements:") || line.includes("ipfs://")) {
        const match = line.match(/ipfs:\/\/(\w+)/);
        request.requirements = match ? `ipfs://${match[1]}` : line.split(":").slice(1).join(":").trim();
      }
      if (line.includes("deadline:")) {
        request.deadline = line.split(":").slice(1).join(":").trim();
      }
    }

    return request;
  }

  /**
   * Parse a delivery post
   */
  parseDeliveryRequest(content) {
    if (!content.toLowerCase().includes("@themis") || !content.toLowerCase().includes("deliver")) {
      return null;
    }

    const request = {
      type: "delivery",
      escrowId: null,
      deliverable: null,
    };

    const lines = content.split("\n");
    for (const line of lines) {
      if (line.includes("escrow:") || line.includes("#")) {
        const match = line.match(/#?(\d+)/);
        request.escrowId = match ? parseInt(match[1]) : null;
      }
      if (line.includes("deliverable:") || line.includes("ipfs://")) {
        const match = line.match(/ipfs:\/\/(\w+)/);
        request.deliverable = match ? `ipfs://${match[1]}` : line.split(":").slice(1).join(":").trim();
      }
    }

    return request;
  }

  /**
   * Parse a dispute request
   */
  parseDisputeRequest(content) {
    if (!content.toLowerCase().includes("@themis") || !content.toLowerCase().includes("dispute")) {
      return null;
    }

    const request = {
      type: "dispute",
      escrowId: null,
      reason: null,
    };

    const lines = content.split("\n");
    for (const line of lines) {
      if (line.includes("escrow:") || line.includes("#")) {
        const match = line.match(/#?(\d+)/);
        request.escrowId = match ? parseInt(match[1]) : null;
      }
      if (line.includes("reason:")) {
        request.reason = line.split(":").slice(1).join(":").trim();
      }
    }

    return request;
  }
}

/**
 * Format an escrow confirmation message for Moltbook
 */
export function formatEscrowConfirmation(escrowId, buyer, seller, amount, token, contractAddress) {
  return `## Escrow Initiated ✓

**Escrow ID**: #${escrowId}
**Buyer**: @${buyer}
**Seller**: @${seller}
**Amount**: ${amount} ${token}

### Next Steps

@${buyer}, please send **${amount} ${token}** to the escrow contract:

\`\`\`
Contract: ${contractAddress}
Function: createEscrowETH (or createEscrowERC20)
\`\`\`

I'll confirm once funds are received and notify @${seller} to begin work.

---
*Secured by Themis | [View Contract](https://sepolia.etherscan.io/address/${contractAddress})*`;
}

/**
 * Format a verification result message
 */
export function formatVerificationResult(escrowId, approved, reason, txHash) {
  if (approved) {
    return `## Verification Complete ✓

**Escrow #${escrowId}**: **APPROVED**

${reason}

Payment has been released to the seller.

[View Transaction](https://sepolia.etherscan.io/tx/${txHash})

---
*Verified by Themis AI*`;
  } else {
    return `## Verification Complete ✗

**Escrow #${escrowId}**: **REJECTED**

${reason}

Funds have been refunded to the buyer.

[View Transaction](https://sepolia.etherscan.io/tx/${txHash})

---
*Verified by Themis AI*`;
  }
}
