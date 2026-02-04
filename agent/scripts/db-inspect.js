#!/usr/bin/env node

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "themis.db");

const db = new Database(DB_PATH, { readonly: true });

function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  return new Date(Number(timestamp)).toISOString();
}

function printTable(title, rows, columns) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);

  if (rows.length === 0) {
    console.log("  (empty)\n");
    return;
  }

  // Print rows
  for (const row of rows) {
    console.log();
    for (const col of columns) {
      const value = col.format ? col.format(row[col.key]) : row[col.key];
      console.log(`  ${col.label.padEnd(20)} ${value}`);
    }
  }
  console.log();
}

function main() {
  const command = process.argv[2] || "all";

  console.log(`\n  Themis SQLite Database Inspector`);
  console.log(`  DB: ${DB_PATH}\n`);

  if (command === "all" || command === "posts") {
    const posts = db.prepare("SELECT * FROM processed_posts ORDER BY processed_at DESC LIMIT 20").all();
    printTable(`Processed Posts (${posts.length} shown, most recent first)`, posts, [
      { key: "post_id", label: "Post ID" },
      { key: "processed_at", label: "Processed At" },
    ]);
  }

  if (command === "all" || command === "pending") {
    const pending = db.prepare("SELECT * FROM pending_escrows ORDER BY created_at DESC").all();
    printTable(`Pending Escrows (${pending.length})`, pending, [
      { key: "key", label: "Key" },
      { key: "submitter", label: "Submitter" },
      { key: "provider_address", label: "Provider Address" },
      { key: "provider_username", label: "Provider Username" },
      { key: "amount", label: "Amount" },
      { key: "token", label: "Token" },
      { key: "requirements", label: "Requirements", format: (v) => v?.slice(0, 50) + (v?.length > 50 ? "..." : "") },
      { key: "post_id", label: "Post ID" },
      { key: "created_at", label: "Created At", format: formatDate },
    ]);
  }

  if (command === "all" || command === "providers") {
    const providers = db.prepare("SELECT * FROM escrow_providers ORDER BY escrow_id DESC LIMIT 20").all();
    printTable(`Escrow Providers (${providers.length} shown)`, providers, [
      { key: "escrow_id", label: "Escrow ID" },
      { key: "username", label: "Username" },
    ]);
  }

  if (command === "all" || command === "kv") {
    const kv = db.prepare("SELECT * FROM kv").all();
    printTable(`Key-Value Store (${kv.length})`, kv, [
      { key: "key", label: "Key" },
      { key: "value", label: "Value", format: (v) => {
        // Format timestamps nicely
        if (/^\d{13}$/.test(v)) {
          return `${v} (${formatDate(v)})`;
        }
        return v;
      }},
    ]);
  }

  if (command === "stats") {
    const postCount = db.prepare("SELECT COUNT(*) as count FROM processed_posts").get();
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM pending_escrows").get();
    const providerCount = db.prepare("SELECT COUNT(*) as count FROM escrow_providers").get();
    const kvCount = db.prepare("SELECT COUNT(*) as count FROM kv").get();

    console.log(`  Stats:`);
    console.log(`    Processed posts:  ${postCount.count}`);
    console.log(`    Pending escrows:  ${pendingCount.count}`);
    console.log(`    Escrow providers: ${providerCount.count}`);
    console.log(`    KV entries:       ${kvCount.count}`);
    console.log();
  }

  if (command === "clear-posts") {
    const readWrite = new Database(DB_PATH);
    const result = readWrite.prepare("DELETE FROM processed_posts").run();
    console.log(`  Cleared ${result.changes} processed posts\n`);
    readWrite.close();
  }

  if (command === "help") {
    console.log(`  Usage: node scripts/db-inspect.js [command]`);
    console.log();
    console.log(`  Commands:`);
    console.log(`    all          Show all tables (default)`);
    console.log(`    posts        Show processed posts`);
    console.log(`    pending      Show pending escrows`);
    console.log(`    providers    Show escrow providers`);
    console.log(`    kv           Show key-value store`);
    console.log(`    stats        Show table counts`);
    console.log(`    clear-posts  Clear processed posts (for testing)`);
    console.log(`    help         Show this help`);
    console.log();
  }

  db.close();
}

main();
