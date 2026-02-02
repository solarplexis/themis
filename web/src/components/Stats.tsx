"use client";

import { useContractStats, useAllEscrows } from "@/hooks/useEscrows";
import { CONTRACT_ADDRESS } from "@/config/wagmi";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Stats() {
  const { arbitrator, feePercentage, escrowCount } = useContractStats();
  const { escrows } = useAllEscrows();

  const activeEscrows = escrows.filter((e) => e.statusName === "Funded").length;
  const completedEscrows = escrows.filter((e) => e.statusName === "Released").length;
  const totalVolume = escrows.reduce((sum, e) => sum + Number(e.amountFormatted), 0);

  const stats = [
    {
      label: "Total Escrows",
      value: escrowCount,
      icon: "📊",
    },
    {
      label: "Active",
      value: activeEscrows,
      icon: "⏳",
      color: "text-yellow-400",
    },
    {
      label: "Completed",
      value: completedEscrows,
      icon: "✅",
      color: "text-green-400",
    },
    {
      label: "Total Volume",
      value: `${totalVolume.toFixed(4)} ETH`,
      icon: "💰",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-800 border border-slate-700 rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{stat.icon}</span>
              <span className="text-slate-400 text-sm">{stat.label}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.color || "text-slate-200"}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Contract Info */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-200 mb-4">Contract Info</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <span className="text-slate-400 text-sm">Contract Address</span>
            <a
              href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-indigo-400 hover:text-indigo-300 font-mono mt-1"
            >
              {truncateAddress(CONTRACT_ADDRESS)}
            </a>
          </div>
          <div>
            <span className="text-slate-400 text-sm">Arbitrator</span>
            <a
              href={`https://sepolia.etherscan.io/address/${arbitrator}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-indigo-400 hover:text-indigo-300 font-mono mt-1"
            >
              {arbitrator ? truncateAddress(arbitrator) : "Loading..."}
            </a>
          </div>
          <div>
            <span className="text-slate-400 text-sm">Fee</span>
            <p className="text-slate-200 font-mono mt-1">{feePercentage}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
