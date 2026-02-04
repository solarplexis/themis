"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-slate-700 bg-slate-900 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">⚖️</span>
              <span className="text-xl font-bold text-white">Themis</span>
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link
                href="/"
                className="text-slate-300 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/escrows"
                className="text-slate-300 hover:text-white transition-colors"
              >
                Escrows
              </Link>
              <Link
                href="/create"
                className="text-slate-300 hover:text-white transition-colors"
              >
                Create
              </Link>
              <Link
                href="/docs"
                className="text-slate-300 hover:text-white transition-colors"
              >
                API
              </Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
