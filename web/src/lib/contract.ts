import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, sepolia } from "viem/chains";
import { CONTRACTS, ESCROW_ABI, EscrowStatus } from "@/config/contracts";

const chains = { [base.id]: base, [sepolia.id]: sepolia } as const;

function getRpcUrl(chainId: number): string {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL env var not set");
  return rpcUrl;
}

function getContractAddress(chainId: number): Address {
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!contracts) throw new Error(`No contract address for chain ${chainId}`);
  return contracts.escrow as Address;
}

function getDefaultChainId(): number {
  const env = process.env.NEXT_PUBLIC_DEFAULT_CHAIN;
  return env === "base" ? base.id : sepolia.id;
}

export function getPublicClient(chainId?: number) {
  const id = chainId ?? getDefaultChainId();
  const chain = chains[id as keyof typeof chains];
  if (!chain) throw new Error(`Unsupported chain: ${id}`);

  return createPublicClient({
    chain,
    transport: http(getRpcUrl(id)),
  });
}

export function getArbitratorClient(chainId?: number) {
  const key = process.env.ARBITRATOR_PRIVATE_KEY;
  if (!key) throw new Error("ARBITRATOR_PRIVATE_KEY env var not set");

  const id = chainId ?? getDefaultChainId();
  const chain = chains[id as keyof typeof chains];
  if (!chain) throw new Error(`Unsupported chain: ${id}`);

  const account = privateKeyToAccount(key as Hex);

  return createWalletClient({
    account,
    chain,
    transport: http(getRpcUrl(id)),
  });
}

export interface Escrow {
  id: number;
  buyer: Address;
  seller: Address;
  token: Address;
  amount: string;
  amountRaw: bigint;
  taskCID: string;
  deadline: number;
  status: number;
  statusName: string;
}

export async function getEscrow(
  escrowId: number,
  chainId?: number
): Promise<Escrow> {
  const id = chainId ?? getDefaultChainId();
  const client = getPublicClient(id);
  const address = getContractAddress(id);

  const result = (await client.readContract({
    address,
    abi: ESCROW_ABI,
    functionName: "getEscrow",
    args: [BigInt(escrowId)],
  })) as {
    buyer: Address;
    seller: Address;
    token: Address;
    amount: bigint;
    taskCID: string;
    deadline: bigint;
    status: number;
  };

  return {
    id: escrowId,
    buyer: result.buyer,
    seller: result.seller,
    token: result.token,
    amount: formatEther(result.amount),
    amountRaw: result.amount,
    taskCID: result.taskCID,
    deadline: Number(result.deadline),
    status: result.status,
    statusName: EscrowStatus[result.status as keyof typeof EscrowStatus] ?? "Unknown",
  };
}

export async function getArbitrator(chainId?: number): Promise<Address> {
  const id = chainId ?? getDefaultChainId();
  const client = getPublicClient(id);
  const address = getContractAddress(id);

  const arbitrator = (await client.readContract({
    address,
    abi: ESCROW_ABI,
    functionName: "arbitrator",
  })) as Address;

  return arbitrator;
}

export async function getEscrowCount(chainId?: number): Promise<number> {
  const id = chainId ?? getDefaultChainId();
  const client = getPublicClient(id);
  const address = getContractAddress(id);

  const count = (await client.readContract({
    address,
    abi: ESCROW_ABI,
    functionName: "escrowCount",
  })) as bigint;

  return Number(count);
}

export async function release(
  escrowId: number,
  chainId?: number
): Promise<Hex> {
  const id = chainId ?? getDefaultChainId();
  const client = getArbitratorClient(id);
  const address = getContractAddress(id);

  const hash = await client.writeContract({
    address,
    abi: ESCROW_ABI,
    functionName: "release",
    args: [BigInt(escrowId)],
  });

  return hash;
}

export async function refund(
  escrowId: number,
  chainId?: number
): Promise<Hex> {
  const id = chainId ?? getDefaultChainId();
  const client = getArbitratorClient(id);
  const address = getContractAddress(id);

  const hash = await client.writeContract({
    address,
    abi: ESCROW_ABI,
    functionName: "refund",
    args: [BigInt(escrowId)],
  });

  return hash;
}
