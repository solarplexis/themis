import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, sepolia } from "wagmi/chains";

const defaultChainId = process.env.NEXT_PUBLIC_DEFAULT_CHAIN === "base" ? base.id : sepolia.id;
const orderedChains =
  defaultChainId === base.id ? ([base, sepolia] as const) : ([sepolia, base] as const);

export const config = getDefaultConfig({
  appName: "Themis - DeFi Arbitrator",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: orderedChains,
  ssr: true,
});

// Re-export contract constants so existing client imports still work
export {
  CONTRACTS,
  CONTRACT_ADDRESS,
  MOLT_TOKEN_ADDRESS,
  ESCROW_ABI,
  ERC20_ABI,
  EscrowStatus,
} from "./contracts";
