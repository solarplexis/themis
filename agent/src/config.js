import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from parent directory (themis root)
dotenv.config({ path: resolve(__dirname, "../../.env") });

// Network configuration
const NETWORKS = {
  sepolia: {
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    privateKey: process.env.TESTNET_PRIVATE_KEY,
    contractAddress: "0x3f1c8Af6BDaA7e184EcA1797749E87A8345E0471",
    chainId: 11155111,
    name: "Sepolia",
  },
  base: {
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    privateKey: process.env.MAINNET_PRIVATE_KEY,
    contractAddress: "0x7D32f54652237A6c73a2F93b63623d07B7Ccb2Cb",
    chainId: 8453,
    name: "Base",
  },
};

// Default to Base mainnet, can override with NETWORK env var
const activeNetwork = process.env.NETWORK || "base";
const network = NETWORKS[activeNetwork] || NETWORKS.base;

export const config = {
  // Blockchain
  rpcUrl: network.rpcUrl,
  privateKey: network.privateKey,
  contractAddress: network.contractAddress,
  chainId: network.chainId,
  networkName: network.name,

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

  // MOLT token (Base only)
  moltTokenAddress: "0xb695559b26bb2c9703ef1935c37aeae9526bab07",
};

export function validateConfig() {
  const required = ["privateKey", "contractAddress"];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  console.log(`[Config] Network: ${config.networkName} (chainId: ${config.chainId})`);
  console.log(`[Config] Contract: ${config.contractAddress}`);

  if (!config.openaiApiKey) {
    console.log("[Config] WARNING: No OPENAI_API_KEY - AI verification disabled");
    return { aiEnabled: false };
  }

  return { aiEnabled: true };
}
