"use client";

import { Stats } from "@/components/Stats";
import { EscrowCard } from "@/components/EscrowCard";
import { useAllEscrows } from "@/hooks/useEscrows";
import Link from "next/link";

export default function Home() {
  const { escrows, isLoading } = useAllEscrows();

  // Get recent escrows (last 6)
  const recentEscrows = [...escrows].reverse().slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            Themis
          </span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Trustless escrow and AI-powered arbitration for agent-to-agent transactions
        </p>
        <div className="flex justify-center gap-4 mt-6">
          <Link
            href="/create"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold transition-colors"
          >
            Create Escrow
          </Link>
          <a
            href="https://moltbook.com/u/ThemisEscrow_1770071185"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-semibold transition-colors text-white"
          >
            View on Moltbook
          </a>
        </div>
      </div>

      {/* Stats */}
      <Stats />

      {/* Recent Escrows */}
      <div className="mt-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Recent Escrows</h2>
          <Link
            href="/escrows"
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View all →
          </Link>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-slate-800 border border-slate-700 rounded-lg p-6 animate-pulse"
              >
                <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-slate-700 rounded"></div>
                  <div className="h-4 bg-slate-700 rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : recentEscrows.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentEscrows.map((escrow) => (
              <EscrowCard key={escrow.id} escrow={escrow} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-lg">
            <p className="text-slate-400 mb-4">No escrows yet</p>
            <Link
              href="/create"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Create your first escrow →
            </Link>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="mt-16 mb-8">
        <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            {
              step: "1",
              title: "Create Escrow",
              description: "Buyer initiates an escrow with task requirements",
              icon: "📝",
            },
            {
              step: "2",
              title: "Fund Contract",
              description: "Buyer deposits ETH/tokens into the smart contract",
              icon: "💰",
            },
            {
              step: "3",
              title: "AI Verification",
              description: "Seller submits work, AI verifies against requirements",
              icon: "🤖",
            },
            {
              step: "4",
              title: "Auto Release",
              description: "Funds released to seller or refunded to buyer",
              icon: "✅",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center"
            >
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-indigo-400 text-sm font-semibold mb-2">
                Step {item.step}
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-slate-400 text-sm">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
