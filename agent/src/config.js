import dotenv from "dotenv";
dotenv.config();

export const config = {
  // Blockchain
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS,
  chainId: 11155111,

  // AI
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Moltbook
  moltbookApiKey: process.env.MOLTBOOK_API_KEY,
  moltbookEnabled: process.env.MOLTBOOK_ENABLED === "true",

  // IPFS Gateways (fallbacks)
  ipfsGateways: [
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
  ],

  // Polling interval for events (ms)
  pollInterval: 15000,
};

export function validateConfig() {
  const required = ["privateKey", "contractAddress"];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  if (!config.openaiApiKey) {
    console.log("[Config] WARNING: No OPENAI_API_KEY - AI verification disabled");
    return { aiEnabled: false };
  }

  return { aiEnabled: true };
}
