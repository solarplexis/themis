import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "themis.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_posts (
    post_id TEXT PRIMARY KEY,
    processed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pending_escrows (
    key TEXT PRIMARY KEY,
    submitter TEXT,
    provider_address TEXT,
    provider_username TEXT,
    amount REAL,
    token TEXT,
    requirements TEXT,
    post_id TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS escrow_providers (
    escrow_id INTEGER PRIMARY KEY,
    username TEXT
  );

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Prepared statements
const stmts = {
  isProcessed: db.prepare("SELECT 1 FROM processed_posts WHERE post_id = ?"),
  markProcessed: db.prepare("INSERT OR IGNORE INTO processed_posts (post_id) VALUES (?)"),

  getPending: db.prepare("SELECT * FROM pending_escrows"),
  addPending: db.prepare(`
    INSERT OR REPLACE INTO pending_escrows
    (key, submitter, provider_address, provider_username, amount, token, requirements, post_id, created_at)
    VALUES (@key, @submitter, @providerAddress, @providerUsername, @amount, @token, @requirements, @postId, @createdAt)
  `),
  deletePending: db.prepare("DELETE FROM pending_escrows WHERE key = ?"),

  getProvider: db.prepare("SELECT username FROM escrow_providers WHERE escrow_id = ?"),
  setProvider: db.prepare("INSERT OR REPLACE INTO escrow_providers (escrow_id, username) VALUES (?, ?)"),

  getKV: db.prepare("SELECT value FROM kv WHERE key = ?"),
  setKV: db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)"),
};

// --- Processed Posts ---

export function isPostProcessed(postId) {
  return !!stmts.isProcessed.get(postId);
}

export function markPostProcessed(postId) {
  stmts.markProcessed.run(postId);
}

// --- Pending Escrows ---

export function getPendingEscrows() {
  const rows = stmts.getPending.all();
  const map = new Map();
  for (const row of rows) {
    map.set(row.key, {
      submitter: row.submitter,
      providerAddress: row.provider_address,
      providerUsername: row.provider_username,
      amount: row.amount,
      token: row.token,
      requirements: row.requirements,
      postId: row.post_id,
      createdAt: row.created_at,
    });
  }
  return map;
}

export function addPendingEscrow(key, data) {
  stmts.addPending.run({
    key,
    submitter: data.submitter,
    providerAddress: data.providerAddress,
    providerUsername: data.providerUsername,
    amount: data.amount,
    token: data.token,
    requirements: data.requirements,
    postId: data.postId,
    createdAt: data.createdAt,
  });
}

export function deletePendingEscrow(key) {
  stmts.deletePending.run(key);
}

export function hasPendingEscrows() {
  return stmts.getPending.all().length > 0;
}

// --- Escrow Providers ---

export function getEscrowProvider(escrowId) {
  const row = stmts.getProvider.get(escrowId);
  return row ? row.username : null;
}

export function setEscrowProvider(escrowId, username) {
  stmts.setProvider.run(escrowId, username);
}

// --- Key-Value Store ---

export function getKV(key) {
  const row = stmts.getKV.get(key);
  return row ? row.value : null;
}

export function setKV(key, value) {
  stmts.setKV.run(key, value);
}

export function closeDb() {
  db.close();
}
