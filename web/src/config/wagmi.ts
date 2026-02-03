import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, sepolia } from "wagmi/chains";

const defaultChainId = process.env.NEXT_PUBLIC_DEFAULT_CHAIN === "base" ? base.id : sepolia.id;
const orderedChains =
  defaultChainId === base.id ? [base, sepolia] : [sepolia, base];

export const config = getDefaultConfig({
  appName: "Themis - DeFi Arbitrator",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: orderedChains,
  ssr: true,
});

// Contract addresses per chain
export const CONTRACTS = {
  [base.id]: {
    escrow: "0x7D32f54652237A6c73a2F93b63623d07B7Ccb2Cb" as const,
    molt: "0xb695559b26bb2c9703ef1935c37aeae9526bab07" as const,
  },
  [sepolia.id]: {
    escrow: "0x3f1c8Af6BDaA7e184EcA1797749E87A8345E0471" as const,
    molt: null, // No MOLT on Sepolia
  },
} as const;

// Default to Sepolia for now
export const CONTRACT_ADDRESS = "0x3f1c8Af6BDaA7e184EcA1797749E87A8345E0471" as const;
export const MOLT_TOKEN_ADDRESS = "0xb695559b26bb2c9703ef1935c37aeae9526bab07" as const;

export const ESCROW_ABI = [
  // Read functions
  {
    inputs: [{ name: "_escrowId", type: "uint256" }],
    name: "getEscrow",
    outputs: [
      {
        components: [
          { name: "buyer", type: "address" },
          { name: "seller", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "taskCID", type: "string" },
          { name: "deadline", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "escrowCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "arbitrator",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "feePercentage",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Write functions - ETH
  {
    inputs: [
      { name: "_seller", type: "address" },
      { name: "_taskCID", type: "string" },
      { name: "_deadline", type: "uint256" },
    ],
    name: "createEscrowETH",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  // Write functions - ERC20
  {
    inputs: [
      { name: "_token", type: "address" },
      { name: "_seller", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_taskCID", type: "string" },
      { name: "_deadline", type: "uint256" },
    ],
    name: "createEscrowERC20",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "escrowId", type: "uint256" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: true, name: "seller", type: "address" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "taskCID", type: "string" },
      { indexed: false, name: "deadline", type: "uint256" },
    ],
    name: "EscrowCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "escrowId", type: "uint256" },
      { indexed: false, name: "amountToSeller", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
    name: "EscrowReleased",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "escrowId", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "EscrowRefunded",
    type: "event",
  },
] as const;

// Standard ERC20 ABI for token approval
export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const EscrowStatus = {
  0: "None",
  1: "Funded",
  2: "Released",
  3: "Refunded",
  4: "Disputed",
} as const;
