"use client";

import { EscrowCard } from "@/components/EscrowCard";
import { useAllEscrows } from "@/hooks/useEscrows";
import { useState } from "react";

type FilterStatus = "all" | "Funded" | "Released" | "Refunded" | "Disputed";

export default function EscrowsPage() {
  const { escrows, isLoading, total } = useAllEscrows();
  const [filter, setFilter] = useState<FilterStatus>("all");

  const filteredEscrows =
    filter === "all"
      ? escrows
      : escrows.filter((e) => e.statusName === filter);

  const sortedEscrows = [...filteredEscrows].reverse();

  const statusCounts = {
    all: total,
    Funded: escrows.filter((e) => e.statusName === "Funded").length,
    Released: escrows.filter((e) => e.statusName === "Released").length,
    Refunded: escrows.filter((e) => e.statusName === "Refunded").length,
    Disputed: escrows.filter((e) => e.statusName === "Disputed").length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">All Escrows</h1>
          <p className="text-gray-400 mt-1">{total} total escrows</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {(["all", "Funded", "Released", "Refunded", "Disputed"] as const).map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === status
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {status === "all" ? "All" : status} ({statusCounts[status]})
            </button>
          )
        )}
      </div>

      {/* Escrow Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 animate-pulse"
            >
              <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : sortedEscrows.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedEscrows.map((escrow) => (
            <EscrowCard key={escrow.id} escrow={escrow} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-800/50 border border-gray-700 rounded-lg">
          <p className="text-gray-400">No escrows found with this filter</p>
        </div>
      )}
    </div>
  );
}
