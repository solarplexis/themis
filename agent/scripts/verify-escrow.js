#!/usr/bin/env node

import dotenv from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY || process.env.MAINNET_PRIVATE_KEY;
const THEMIS_API = process.env.THEMIS_API_URL || "https://themis-escrow.netlify.app";

async function main() {
  const escrowId = process.argv[2];
  const deliverable = process.argv[3];

  if (!escrowId || !deliverable) {
    console.log(`
  Themis Escrow Verifier

  Usage: node scripts/verify-escrow.js <escrowId> "<deliverable>"

  Examples:
    node scripts/verify-escrow.js 15 "verified"
    node scripts/verify-escrow.js 12 "Here is the completed haiku..."

  Environment:
    THEMIS_API_URL  API endpoint (default: https://themis-escrow.netlify.app)
    TESTNET_PRIVATE_KEY / MAINNET_PRIVATE_KEY  Arbitrator wallet
`);
    process.exit(1);
  }

  if (!PRIVATE_KEY) {
    console.error("  Error: No private key found in .env (TESTNET_PRIVATE_KEY or MAINNET_PRIVATE_KEY)");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const message = `Themis: deliver escrow #${escrowId}`;

  console.log(`\n  Themis Escrow Verifier\n`);
  console.log(`  Escrow ID:    #${escrowId}`);
  console.log(`  Deliverable:  "${deliverable.slice(0, 50)}${deliverable.length > 50 ? '...' : ''}"`);
  console.log(`  API:          ${THEMIS_API}`);
  console.log(`  Signer:       ${wallet.address}`);
  console.log(`  Message:      "${message}"`);

  // Sign the message
  const signature = await wallet.signMessage(message);
  console.log(`  Signature:    ${signature.slice(0, 20)}...`);

  // Call the API
  const url = `${THEMIS_API}/api/escrow/${escrowId}/deliver`;
  console.log(`\n  POST ${url}\n`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliverable, signature }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.log(`  Error (${res.status}): ${result.error}\n`);
      process.exit(1);
    }

    console.log(`  Result:`);
    console.log(`    Approved:    ${result.approved ? '✓ YES' : '✗ NO'}`);
    console.log(`    Confidence:  ${result.confidence}%`);
    console.log(`    Reason:      ${result.reason}`);
    console.log(`    Tx hash:     ${result.txHash}`);

    if (result.txHash) {
      // Detect network from API or default to Sepolia
      const isMainnet = THEMIS_API.includes('mainnet') || process.env.NETWORK === 'base';
      const explorer = isMainnet
        ? `https://basescan.org/tx/${result.txHash}`
        : `https://sepolia.etherscan.io/tx/${result.txHash}`;
      console.log(`    Explorer:    ${explorer}`);
    }
    console.log();

    process.exit(result.approved ? 0 : 1);
  } catch (error) {
    console.log(`  Request failed: ${error.message}\n`);
    process.exit(1);
  }
}

main();
