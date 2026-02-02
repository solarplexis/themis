"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, ESCROW_ABI, EscrowStatus } from "@/config/wagmi";
import { formatEther } from "viem";

export interface Escrow {
  id: number;
  buyer: string;
  seller: string;
  token: string;
  amount: bigint;
  amountFormatted: string;
  taskCID: string;
  deadline: number;
  status: number;
  statusName: string;
}

export function useEscrowCount() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "escrowCount",
  });
}

export function useEscrow(escrowId: number) {
  const { data, isLoading, error } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "getEscrow",
    args: [BigInt(escrowId)],
  });

  const escrow: Escrow | null = data
    ? {
        id: escrowId,
        buyer: data.buyer,
        seller: data.seller,
        token: data.token,
        amount: data.amount,
        amountFormatted: formatEther(data.amount),
        taskCID: data.taskCID,
        deadline: Number(data.deadline),
        status: data.status,
        statusName: EscrowStatus[data.status as keyof typeof EscrowStatus] || "Unknown",
      }
    : null;

  return { escrow, isLoading, error };
}

export function useAllEscrows() {
  const { data: count, isLoading: countLoading } = useEscrowCount();

  const escrowCount = count ? Number(count) : 0;

  // Create array of contract calls for each escrow
  const contracts = Array.from({ length: escrowCount }, (_, i) => ({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "getEscrow" as const,
    args: [BigInt(i + 1)],
  }));

  const { data, isLoading } = useReadContracts({
    contracts,
  });

  const escrows: Escrow[] = data
    ? data
        .filter((result): result is typeof result & { status: "success"; result: NonNullable<typeof result.result> } =>
          result.status === "success" && result.result !== undefined
        )
        .map((result, index) => {
          const d = result.result;
          return {
            id: index + 1,
            buyer: d.buyer,
            seller: d.seller,
            token: d.token,
            amount: d.amount,
            amountFormatted: formatEther(d.amount),
            taskCID: d.taskCID,
            deadline: Number(d.deadline),
            status: d.status,
            statusName: EscrowStatus[d.status as keyof typeof EscrowStatus] || "Unknown",
          } as Escrow;
        })
    : [];

  return {
    escrows,
    isLoading: countLoading || isLoading,
    total: escrowCount,
  };
}

export function useContractStats() {
  const { data: arbitrator } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "arbitrator",
  });

  const { data: feePercentage } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "feePercentage",
  });

  const { data: escrowCount } = useEscrowCount();

  return {
    arbitrator,
    feePercentage: feePercentage ? Number(feePercentage) / 100 : 0,
    escrowCount: escrowCount ? Number(escrowCount) : 0,
  };
}
