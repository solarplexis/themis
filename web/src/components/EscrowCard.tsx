"use client";

import { Escrow } from "@/hooks/useEscrows";

const statusColors: Record<string, string> = {
  Funded: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Released: "bg-green-500/20 text-green-400 border-green-500/30",
  Refunded: "bg-red-500/20 text-red-400 border-red-500/30",
  Disputed: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  None: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function EscrowCard({ escrow }: { escrow: Escrow }) {
  const deadlineDate = new Date(escrow.deadline * 1000);
  const isExpired = deadlineDate < new Date();

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-slate-400 text-sm">Escrow</span>
          <h3 className="text-xl font-bold text-slate-200">#{escrow.id}</h3>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm border ${statusColors[escrow.statusName]}`}
        >
          {escrow.statusName}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-slate-400">Amount</span>
          <span className="text-slate-200 font-mono">{escrow.amountFormatted} ETH</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Buyer</span>
          <a
            href={`https://sepolia.etherscan.io/address/${escrow.buyer}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 font-mono"
          >
            {truncateAddress(escrow.buyer)}
          </a>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Seller</span>
          <a
            href={`https://sepolia.etherscan.io/address/${escrow.seller}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 font-mono"
          >
            {truncateAddress(escrow.seller)}
          </a>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Deadline</span>
          <span className={`${isExpired ? "text-red-400" : "text-slate-200"}`}>
            {deadlineDate.toLocaleDateString()}
          </span>
        </div>

        <div className="pt-3 border-t border-slate-700">
          <span className="text-slate-400 text-sm">Task CID</span>
          <p className="text-slate-300 text-sm font-mono truncate mt-1">
            {escrow.taskCID}
          </p>
        </div>
      </div>
    </div>
  );
}
