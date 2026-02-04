#!/usr/bin/env node

import dotenv from "dotenv";
import { ethers } from "ethers";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY;
const THEMIS_API = process.env.THEMIS_API_URL || "https://themis-escrow.netlify.app";

async function main() {
  const command = process.argv[2];
  const escrowId = process.argv[3];

  if (!command || !escrowId || command === "help" || command === "--help") {
    console.log(`
  Themis Clarification Tester

  Usage:
    node scripts/test-clarify.js ask <escrowId> "<question>"
    node scripts/test-clarify.js answer <escrowId> <questionId> "<answer>"
    node scripts/test-clarify.js list <escrowId>

  Examples:
    node scripts/test-clarify.js ask 16 "Does 'this year' mean 2026?"
    node scripts/test-clarify.js answer 16 q-1234-abc "Yes, 2026 Stanley Cup"
    node scripts/test-clarify.js list 16

  Environment:
    THEMIS_API_URL  API endpoint (default: https://themis-escrow.netlify.app)
`);
    process.exit(1);
  }

  if (!PRIVATE_KEY) {
    console.error("  Error: No TESTNET_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(PRIVATE_KEY);

  if (command === "ask") {
    const question = process.argv[4];
    if (!question) {
      console.error("  Error: Missing question argument");
      process.exit(1);
    }

    const message = `Themis: clarify escrow #${escrowId}`;
    const signature = await wallet.signMessage(message);

    console.log(`\n  Asking clarification for Escrow #${escrowId}`);
    console.log(`  Question: "${question}"`);
    console.log(`  Signer: ${wallet.address}\n`);

    const res = await fetch(`${THEMIS_API}/api/escrow/${escrowId}/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, signature }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.log(`  Error (${res.status}): ${result.error}\n`);
      process.exit(1);
    }

    console.log(`  Success!`);
    console.log(`  Question ID: ${result.clarification.id}`);
    console.log(`  Use this to answer: node scripts/test-clarify.js answer ${escrowId} ${result.clarification.id} "Your answer"\n`);

  } else if (command === "answer") {
    const questionId = process.argv[4];
    const answer = process.argv[5];
    if (!questionId || !answer) {
      console.error("  Error: Missing questionId or answer argument");
      process.exit(1);
    }

    const message = `Themis: answer escrow #${escrowId}`;
    const signature = await wallet.signMessage(message);

    console.log(`\n  Answering clarification for Escrow #${escrowId}`);
    console.log(`  Question ID: ${questionId}`);
    console.log(`  Answer: "${answer}"`);
    console.log(`  Signer: ${wallet.address}\n`);

    const res = await fetch(`${THEMIS_API}/api/escrow/${escrowId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, answer, signature }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.log(`  Error (${res.status}): ${result.error}\n`);
      process.exit(1);
    }

    console.log(`  Success!`);
    console.log(`  Q: ${result.clarification.question}`);
    console.log(`  A: ${result.clarification.answer}\n`);

  } else if (command === "list") {
    console.log(`\n  Clarifications for Escrow #${escrowId}\n`);

    const res = await fetch(`${THEMIS_API}/api/escrow/${escrowId}/answer`);
    const result = await res.json();

    if (!res.ok) {
      console.log(`  Error (${res.status}): ${result.error}\n`);
      process.exit(1);
    }

    if (result.clarifications.length === 0) {
      console.log("  No clarifications yet.\n");
    } else {
      for (const c of result.clarifications) {
        console.log(`  [${c.id}]`);
        console.log(`    Q: ${c.question}`);
        console.log(`    A: ${c.answer || "(unanswered)"}`);
        console.log();
      }
    }

  } else {
    console.error(`  Unknown command: ${command}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`  Error: ${err.message}`);
  process.exit(1);
});
