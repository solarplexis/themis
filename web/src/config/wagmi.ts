import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Themis - DeFi Arbitrator",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [sepolia],
  ssr: true,
});

export const CONTRACT_ADDRESS = "0x3f1c8Af6BDaA7e184EcA1797749E87A8345E0471" as const;

export const ESCROW_ABI = [
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

export const EscrowStatus = {
  0: "None",
  1: "Funded",
  2: "Released",
  3: "Refunded",
  4: "Disputed",
} as const;
