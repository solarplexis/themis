import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from parent directory (themis root)
dotenv.config({ path: resolve(__dirname, "../../.env") });

// Helper to read deployed contract address from ignition files
function getContractAddress(chainId) {
  const deploymentFile = resolve(
    __dirname,
    `../../ignition/deployments/chain-${chainId}/deployed_addresses.json`
  );
  try {
    if (fs.existsSync(deploymentFile)) {
      const addresses = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
      // The key is typically in the format "ModuleName#ContractName"
      const addressKey = Object.keys(addresses).find(key => key.includes("#MoltEscrow"));
      if (addressKey) {
        return addresses[addressKey];
      }
    }
  } catch (error) {
    console.error(`[Config] Error reading deployment file for chainId ${chainId}:`, error);
  }
  return null;
}

// Network configuration
const NETWORKS = {
  sepolia: {
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    privateKey: process.env.TESTNET_PRIVATE_KEY,
    contractAddress: getContractAddress(11155111),
    chainId: 11155111,
    name: "Sepolia",
  },
  base: {
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    privateKey: process.env.MAINNET_PRIVATE_KEY,
    contractAddress: getContractAddress(8453),
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
  pollInterval: parseInt(process.env.POLL_INTERVAL) || 60000,

  // Heartbeat interval for Moltbook (ms)
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL) || 60000,

  // MOLT token (Base only)
  moltTokenAddress: "0xb695559b26bb2c9703ef1935c37aeae9526bab07",

  // Themis REST API
  themisApiUrl: process.env.THEMIS_API_URL || "https://themis-escrow.netlify.app",

  // Submolts to poll for mentions
  pollSubmolts: (process.env.POLL_SUBMOLTS || "blockchain,general,agent-commerce").split(","),
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
