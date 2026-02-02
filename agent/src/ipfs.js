import { config } from "./config.js";

/**
 * Fetch content from IPFS using multiple gateways as fallback
 * @param {string} cid - IPFS CID (can include ipfs:// prefix)
 * @returns {Promise<string>} - Content from IPFS
 */
export async function fetchFromIPFS(cid) {
  // Clean up the CID
  const cleanCID = cid
    .replace("ipfs://", "")
    .replace("/ipfs/", "")
    .trim();

  if (!cleanCID) {
    throw new Error("Invalid IPFS CID");
  }

  // Try each gateway
  for (const gateway of config.ipfsGateways) {
    try {
      const url = `${gateway}${cleanCID}`;
      console.log(`[IPFS] Fetching from ${url}...`);

      const response = await fetch(url, {
        timeout: 30000,
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      // Handle JSON
      if (contentType.includes("application/json")) {
        return await response.json();
      }

      // Handle text/other
      return await response.text();
    } catch (error) {
      console.log(`[IPFS] Gateway ${gateway} failed: ${error.message}`);
      continue;
    }
  }

  throw new Error(`Failed to fetch CID ${cleanCID} from all gateways`);
}

/**
 * Parse task requirements from IPFS content
 * @param {string|object} content - Raw content from IPFS
 * @returns {object} - Parsed task requirements
 */
export function parseTaskRequirements(content) {
  if (typeof content === "object") {
    return content;
  }

  // Try to parse as JSON
  try {
    return JSON.parse(content);
  } catch {
    // Return as plain text description
    return {
      description: content,
      type: "text",
    };
  }
}
