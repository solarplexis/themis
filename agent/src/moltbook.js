import { config } from "./config.js";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

/**
 * Moltbook API Client for Themis agent
 */
export class MoltbookClient {
  constructor(apiKey) {
    this.apiKey = apiKey || config.moltbookApiKey;
    this.agentId = null;
    this.username = "ThemisEscrow_1770071185";
    this.lastMentions = []; // Cache for flaky endpoint
    this.lastSuccessfulFetch = null; // Timestamp of last successful fetch
    this.consecutiveFailures = 0; // Track failures for backoff
  }

  async request(endpoint, options = {}) {
    const url = `${MOLTBOOK_API}${endpoint}`;
    console.log(`[Moltbook] Requesting: ${url}`);
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    try {
      // Add 10-second timeout for all authenticated requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`[Moltbook] Response status: ${response.status}`);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Moltbook API error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`[Moltbook] Request to ${endpoint} timed out after 10s`);
        throw new Error('Request timeout');
      }
      console.error(`[Moltbook] Request to ${endpoint} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get health status of the Moltbook endpoint
   * Returns reliability score and recommendation
   */
  getEndpointHealth() {
    const score = this.consecutiveFailures === 0 ? 100 : 
                  this.consecutiveFailures === 1 ? 75 :
                  this.consecutiveFailures === 2 ? 50 : 25;
    
    const cacheAge = this.lastSuccessfulFetch ? 
      Math.round((Date.now() - this.lastSuccessfulFetch) / 1000) : null;
    
    return {
      score,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccess: this.lastSuccessfulFetch ? new Date(this.lastSuccessfulFetch).toISOString() : 'never',
      cacheAge: cacheAge ? `${cacheAge}s` : 'N/A',
      cachedMentions: this.lastMentions.length,
      recommendation: score < 50 ? 'Consider increasing poll interval' : 'Endpoint healthy'
    };
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

    const result = await this.request("/agents/register", {
      method: "POST",
      body: JSON.stringify({
        name: this.username,
        description: "Trustless escrow & AI arbitration for agent-to-agent transactions. Tag me to secure your deals.",
      }),
    });

    this.agentId = result.agentId;
    console.log(`[Moltbook] Registered with ID: ${this.agentId}`);
    return result;
  }

  /**
   * Get recent posts mentioning this agent
   * Uses public /agents/profile endpoint (no auth required)
   * Includes retry logic and caching for flaky endpoint
   */
  async getMentions(since = null) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Moltbook] Fetching profile for ${this.username} (attempt ${attempt}/${maxRetries})...`);
        
        // Use public profile endpoint - no auth required
        const url = `${MOLTBOOK_API}/agents/profile?name=${this.username}`;
        const response = await fetch(url, { 
          timeout: 10000 // 10 second timeout
        });
        
        console.log(`[Moltbook] Response status: ${response.status}`);
        
        if (!response.ok) {
          const error = await response.text();
          console.error(`[Moltbook] Error: ${error}`);
          
          // If not the last attempt, retry
          if (attempt < maxRetries) {
            console.log(`[Moltbook] Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          
          // Last attempt failed, return cached data
          console.log(`[Moltbook] All retries failed, returning cached data (${this.lastMentions.length} mentions)`);
          this.consecutiveFailures++;
          return this.lastMentions;
        }
        
        const result = await response.json();
        
        if (!result.success || !result.recentPosts) {
          console.log(`[Moltbook] No recent posts found`);
          
          // Try again if not last attempt
          if (attempt < maxRetries) {
            console.log(`[Moltbook] Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          
          // Return cached data
          console.log(`[Moltbook] No data available, returning cached data (${this.lastMentions.length} mentions)`);
          this.consecutiveFailures++;
          return this.lastMentions;
        }
        
        const posts = result.recentPosts || [];
        console.log(`[Moltbook] Found ${posts.length} recent posts`);
        
        // Filter for posts that mention this agent (excluding own posts)
        const mentionPattern = new RegExp(`@${this.username}`, "i");
        const mentions = posts.filter((post) => {
          const content = post.content || post.title || "";
          return mentionPattern.test(content);
        });
        
        console.log(`[Moltbook] Found ${mentions.length} mentions`);
        
        // Success! Update cache
        this.lastMentions = mentions;
        this.lastSuccessfulFetch = Date.now();
        this.consecutiveFailures = 0;
        
        return mentions;
        
      } catch (error) {
        console.error(`[Moltbook] Error fetching profile (attempt ${attempt}/${maxRetries}): ${error.message}`);
        
        // If not the last attempt, retry
        if (attempt < maxRetries) {
          console.log(`[Moltbook] Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // All retries failed, return cached data
        const cacheAge = this.lastSuccessfulFetch ? Math.round((Date.now() - this.lastSuccessfulFetch) / 1000) : 'never';
        console.log(`[Moltbook] All retries exhausted. Returning cached data (${this.lastMentions.length} mentions, last updated: ${cacheAge}s ago)`);
        this.consecutiveFailures++;
        return this.lastMentions;
      }
    }
    
    // Fallback (should never reach here)
    return this.lastMentions;
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
