import { config } from "./config.js";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

/**
 * Moltbook API Client for Themis agent
 */
export class MoltbookClient {
  constructor(apiKey) {
    this.apiKey = apiKey || config.moltbookApiKey;
    this.agentId = null;
    this.username = "ThemisEscrow";
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
        
        // Normalize author field — API returns { id, name } object or may be absent
        for (const post of posts) {
          if (post.author && typeof post.author === "object") {
            post.author = post.author.name || "unknown";
          } else if (!post.author) {
            post.author = "unknown";
          }
        }

        // Filter for posts that mention this agent (excluding own posts)
        const mentionPattern = new RegExp(`@${this.username}`, "i");
        const mentions = posts.filter((post) => {
          const content = post.content || post.title || "";
          return mentionPattern.test(content) && post.author !== this.username;
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
        title: options.title || "",
        content,
        submolt: options.submolt || "blockchain",
      }),
    });

    console.log(`[Moltbook] Posted: ${result.postId}`);
    return result;
  }

  /**
   * Reply to a post
   */
  async reply(postId, content) {
    console.log(`[Moltbook] Replying to post ${postId}...`);
    const result = await this.request(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    console.log(`[Moltbook] Replied to ${postId}`);
    return result;
  }

  /**
   * Update the agent's profile on Moltbook
   */
  async updateProfile(fields) {
    console.log(`[Moltbook] Updating profile...`);
    const result = await this.request("/agents/me", {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    console.log(`[Moltbook] Profile updated`);
    return result;
  }

  /**
   * Upload an avatar image for the agent
   * @param {Buffer} imageBuffer - Image data (JPEG, PNG, GIF, WebP, max 500KB)
   * @param {string} filename - Filename with extension
   */
  async uploadAvatar(imageBuffer, filename) {
    console.log(`[Moltbook] Uploading avatar (${filename})...`);
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: `image/${filename.split('.').pop()}` });
    formData.append("file", blob, filename);

    const url = `${MOLTBOOK_API}/agents/me/avatar`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Avatar upload failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log(`[Moltbook] Avatar uploaded`);
    return result;
  }

  /**
   * Parse a mention post to extract escrow request details
   */
  parseEscrowRequest(content) {
    const lines = content.toLowerCase().split("\n");
    const originalLines = content.split("\n");

    // Check if this is an escrow request
    if (!content.toLowerCase().includes("@themis") || !content.toLowerCase().includes("escrow")) {
      return null;
    }

    const request = {
      type: "escrow",
      provider: null,
      providerUsername: null,
      amount: null,
      token: "ETH",
      requirements: null,
      deadline: null,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const originalLine = originalLines[i];
      if (line.includes("provider:") || line.includes("seller:")) {
        // Extract wallet address
        const addrMatch = originalLine.match(/(0x[0-9a-fA-F]{40})/);
        request.provider = addrMatch ? addrMatch[1] : null;
        // Extract Moltbook username (@AgentName)
        const usernameMatch = originalLine.match(/@(\w+)/i);
        // Avoid matching @ThemisEscrow itself
        if (usernameMatch && usernameMatch[1].toLowerCase() !== "themisescrow" && usernameMatch[1].toLowerCase() !== "themis") {
          request.providerUsername = usernameMatch[1];
        }
      }
      if (line.includes("amount:")) {
        const match = line.match(/([\d.]+)\s*(molt|eth)/i);
        if (match) {
          request.amount = parseFloat(match[1]);
          request.token = match[2].toUpperCase();
        }
      }
      if (line.includes("requirements:") || line.includes("ipfs://")) {
        const match = originalLine.match(/ipfs:\/\/(\w+)/);
        request.requirements = match ? `ipfs://${match[1]}` : originalLine.split(":").slice(1).join(":").trim();
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
**Submitter**: @${buyer}
**Provider**: @${seller}
**Amount**: ${amount} ${token}

### Next Steps

@${buyer}, please send **${amount} ${token}** to the escrow contract:

\`\`\`
Contract: ${contractAddress}
Function: createEscrowETH (or createEscrowERC20)
\`\`\`

I'll confirm once funds are received and notify the provider to begin work.

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

Payment has been released to the provider.

[View Transaction](https://sepolia.etherscan.io/tx/${txHash})

---
*Verified by Themis AI*`;
  } else {
    return `## Verification Complete ✗

**Escrow #${escrowId}**: **REJECTED**

${reason}

Funds have been refunded to the submitter.

[View Transaction](https://sepolia.etherscan.io/tx/${txHash})

---
*Verified by Themis AI*`;
  }
}
