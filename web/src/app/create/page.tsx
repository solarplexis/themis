"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useChainId,
} from "wagmi";
import { parseEther, parseUnits, formatUnits, decodeEventLog, formatEther } from "viem";
import { base } from "wagmi/chains";
import {
  CONTRACTS,
  ESCROW_ABI,
  ERC20_ABI,
  MOLT_TOKEN_ADDRESS,
} from "@/config/wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

type PaymentToken = "ETH" | "MOLT";

export default function CreateEscrowPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [taskCID, setTaskCID] = useState("");
  const [deadline, setDeadline] = useState("");
  const [paymentToken, setPaymentToken] = useState<PaymentToken>("ETH");
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalStep, setApprovalStep] = useState(false);
  const [moltbookStatus, setMoltbookStatus] = useState<"idle" | "posting" | "posted" | "failed">("idle");

  // Get the correct contract address for current chain
  const contractAddress =
    chainId === base.id
      ? CONTRACTS[base.id].escrow
      : CONTRACTS[11155111].escrow;

  const isOnBase = chainId === base.id;
  const moltAvailable = isOnBase && CONTRACTS[base.id].molt !== null;

  // Read MOLT balance
  const { data: moltBalance } = useReadContract({
    address: MOLT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isOnBase && !!address },
  });

  // Read MOLT allowance
  const { data: moltAllowance } = useReadContract({
    address: MOLT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && contractAddress ? [address, contractAddress] : undefined,
    query: { enabled: isOnBase && !!address && paymentToken === "MOLT" },
  });

  // Check if approval is needed for MOLT
  useEffect(() => {
    if (paymentToken === "MOLT" && amount && moltAllowance !== undefined) {
      const amountWei = parseUnits(amount, 18);
      setNeedsApproval(moltAllowance < amountWei);
    } else {
      setNeedsApproval(false);
    }
  }, [paymentToken, amount, moltAllowance]);

  // Approval transaction
  const {
    data: approvalHash,
    isPending: isApprovalPending,
    writeContract: writeApproval,
  } = useWriteContract();

  const { isLoading: isApprovalConfirming, isSuccess: isApprovalSuccess } =
    useWaitForTransactionReceipt({
      hash: approvalHash,
    });

  // Create escrow transaction
  const { data: hash, isPending, writeContract } = useWriteContract();

  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // After approval succeeds, proceed to create escrow
  useEffect(() => {
    if (isApprovalSuccess && approvalStep) {
      setApprovalStep(false);
      setNeedsApproval(false);
    }
  }, [isApprovalSuccess, approvalStep]);

  // Post to Moltbook after escrow creation succeeds
  useEffect(() => {
    if (!isSuccess || !receipt || moltbookStatus !== "idle") return;

    const escrowCreatedEvent = receipt.logs.find((log) => {
      try {
        const decoded = decodeEventLog({
          abi: ESCROW_ABI,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === "EscrowCreated";
      } catch {
        return false;
      }
    });

    if (!escrowCreatedEvent) return;

    const decoded = decodeEventLog({
      abi: ESCROW_ABI,
      data: escrowCreatedEvent.data,
      topics: escrowCreatedEvent.topics,
    });

    const args = decoded.args as {
      escrowId: bigint;
      buyer: string;
      seller: string;
      token: string;
      amount: bigint;
    };

    const isETH = args.token === "0x0000000000000000000000000000000000000000";
    const displayAmount = isETH
      ? formatEther(args.amount)
      : formatUnits(args.amount, 18);

    setMoltbookStatus("posting");

    fetch("/api/moltbook/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escrowId: Number(args.escrowId),
        buyer: args.buyer,
        seller: args.seller,
        amount: displayAmount,
        token: isETH ? "ETH" : "MOLT",
        txHash: receipt.transactionHash,
        chainId,
      }),
    })
      .then((res) => {
        setMoltbookStatus(res.ok ? "posted" : "failed");
      })
      .catch(() => {
        setMoltbookStatus("failed");
      });
  }, [isSuccess, receipt, moltbookStatus, chainId]);

  const handleApprove = async () => {
    if (!amount) return;

    setApprovalStep(true);
    const amountWei = parseUnits(amount, 18);

    writeApproval({
      address: MOLT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [contractAddress as `0x${string}`, amountWei],
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!seller || !amount || !taskCID || !deadline) {
      alert("Please fill in all fields");
      return;
    }

    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);

    if (paymentToken === "ETH") {
      writeContract({
        address: contractAddress as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "createEscrowETH",
        args: [seller as `0x${string}`, taskCID, BigInt(deadlineTimestamp)],
        value: parseEther(amount),
      });
    } else {
      // MOLT (ERC20)
      const amountWei = parseUnits(amount, 18);
      writeContract({
        address: contractAddress as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: "createEscrowERC20",
        args: [
          MOLT_TOKEN_ADDRESS,
          seller as `0x${string}`,
          amountWei,
          taskCID,
          BigInt(deadlineTimestamp),
        ],
      });
    }
  };

  const getExplorerUrl = (txHash: string) => {
    if (chainId === base.id) {
      return `https://basescan.org/tx/${txHash}`;
    }
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  };

  const getExplorerName = () => {
    return chainId === base.id ? "Basescan" : "Etherscan";
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
          <h1 className="text-2xl font-bold text-white mb-4">Escrow Created!</h1>
          <p className="text-gray-300 mb-6">
            Your escrow has been created and funded.
          </p>
          <a
            href={getExplorerUrl(hash!)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-300 hover:text-blue-200 underline font-medium"
          >
            View transaction on {getExplorerName()} →
          </a>
          <p className="text-gray-400 text-sm mt-4">
            {moltbookStatus === "posting" && "Posting to Moltbook..."}
            {moltbookStatus === "posted" && "Posted to Moltbook"}
            {moltbookStatus === "failed" && "Failed to post to Moltbook"}
          </p>
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
        {/* Payment Token Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Payment Token
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPaymentToken("ETH")}
              className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                paymentToken === "ETH"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              <div className="font-semibold">ETH</div>
              <div className="text-xs opacity-75">Native token</div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentToken("MOLT")}
              disabled={!moltAvailable}
              className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                paymentToken === "MOLT"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : moltAvailable
                  ? "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
                  : "bg-gray-800/50 border-gray-700/50 text-gray-500 cursor-not-allowed"
              }`}
            >
              <div className="font-semibold">MOLT</div>
              <div className="text-xs opacity-75">
                {moltAvailable ? "Moltbook Token" : "Base only"}
              </div>
            </button>
          </div>
          {paymentToken === "MOLT" && moltBalance !== undefined && (
            <p className="text-gray-500 text-sm mt-2">
              Balance: {formatUnits(moltBalance as bigint, 18)} MOLT
            </p>
          )}
        </div>

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
            Amount ({paymentToken})
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
              <span>
                {amount || "0"} {paymentToken}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Fee (1%)</span>
              <span>
                {amount ? (parseFloat(amount) * 0.01).toFixed(6) : "0"}{" "}
                {paymentToken}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Network</span>
              <span>{isOnBase ? "Base" : "Sepolia"}</span>
            </div>
          </div>
        </div>

        {/* Approval button for MOLT */}
        {paymentToken === "MOLT" && needsApproval && !isApprovalSuccess && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApprovalPending || isApprovalConfirming}
            className="w-full py-4 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
          >
            {isApprovalPending
              ? "Confirm Approval in Wallet..."
              : isApprovalConfirming
              ? "Approving MOLT..."
              : "Step 1: Approve MOLT"}
          </button>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            isPending ||
            isConfirming ||
            (paymentToken === "MOLT" && needsApproval && !isApprovalSuccess)
          }
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          {isPending
            ? "Confirm in Wallet..."
            : isConfirming
            ? "Creating Escrow..."
            : paymentToken === "MOLT" && needsApproval && !isApprovalSuccess
            ? "Step 2: Create & Fund Escrow"
            : "Create & Fund Escrow"}
        </button>
      </form>
    </div>
  );
}
