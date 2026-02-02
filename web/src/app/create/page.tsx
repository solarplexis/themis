"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { CONTRACT_ADDRESS, ESCROW_ABI } from "@/config/wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function CreateEscrowPage() {
  const { address, isConnected } = useAccount();
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [taskCID, setTaskCID] = useState("");
  const [deadline, setDeadline] = useState("");

  const { data: hash, isPending, writeContract } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!seller || !amount || !taskCID || !deadline) {
      alert("Please fill in all fields");
      return;
    }

    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "createEscrowETH",
      args: [seller as `0x${string}`, taskCID, BigInt(deadlineTimestamp)],
      value: parseEther(amount),
    });
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center bg-gray-800/50 border border-gray-700 rounded-lg p-12">
          <h1 className="text-2xl font-bold mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-6">
            Connect your wallet to create an escrow
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center bg-gray-800/50 border border-gray-700 rounded-lg p-12">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-4">Escrow Created!</h1>
          <p className="text-gray-400 mb-6">
            Your escrow has been created and funded.
          </p>
          <a
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            View transaction on Etherscan →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">Create Escrow</h1>
      <p className="text-gray-400 mb-8">
        Create a new escrow to securely pay for services
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Seller Address
          </label>
          <input
            type="text"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <p className="text-gray-500 text-sm mt-1">
            The wallet address that will receive payment
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Amount (ETH)
          </label>
          <input
            type="number"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.01"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Task Requirements
          </label>
          <textarea
            value={taskCID}
            onChange={(e) => setTaskCID(e.target.value)}
            placeholder="Describe the task requirements or paste an IPFS CID (ipfs://Qm...)"
            rows={4}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <p className="text-gray-500 text-sm mt-1">
            The AI will verify deliverables against these requirements
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Deadline
          </label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2">Summary</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">From</span>
              <span className="font-mono">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">To</span>
              <span className="font-mono">
                {seller ? `${seller.slice(0, 6)}...${seller.slice(-4)}` : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount</span>
              <span>{amount || "0"} ETH</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Fee (1%)</span>
              <span>{amount ? (parseFloat(amount) * 0.01).toFixed(6) : "0"} ETH</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending || isConfirming}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          {isPending
            ? "Confirm in Wallet..."
            : isConfirming
            ? "Creating Escrow..."
            : "Create & Fund Escrow"}
        </button>
      </form>
    </div>
  );
}
