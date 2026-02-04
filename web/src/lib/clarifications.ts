import { getStore } from "@netlify/blobs";
import { promises as fs } from "fs";
import path from "path";

export interface Clarification {
  id: string;
  question: string;
  answer: string | null;
  askedBy: string; // address of who asked
  askedAt: number; // timestamp
  answeredBy: string | null; // address of who answered
  answeredAt: number | null;
}

export interface EscrowClarifications {
  escrowId: number;
  clarifications: Clarification[];
}

// Check if we're running in a serverless environment (can't write to filesystem)
function isServerless(): boolean {
  // In serverless, cwd is usually /var/task and we can't write there
  // Also check for Netlify/AWS env vars
  return (
    process.cwd().startsWith("/var/task") ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.NETLIFY ||
    !!process.env.CONTEXT
  );
}

// Local file-based storage for development
const LOCAL_STORE_DIR = path.join(process.cwd(), ".clarifications");

async function ensureLocalDir(): Promise<void> {
  try {
    await fs.mkdir(LOCAL_STORE_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

async function localGet(key: string): Promise<EscrowClarifications | null> {
  await ensureLocalDir();
  const filePath = path.join(LOCAL_STORE_DIR, `${key}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function localSet(key: string, data: EscrowClarifications): Promise<void> {
  await ensureLocalDir();
  const filePath = path.join(LOCAL_STORE_DIR, `${key}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function getClarifications(
  escrowId: number
): Promise<EscrowClarifications> {
  const key = `escrow-${escrowId}`;

  if (isServerless()) {
    const store = getStore("clarifications");
    try {
      const data = await store.get(key, { type: "json" });
      if (data) {
        return data as EscrowClarifications;
      }
    } catch {
      // Key doesn't exist yet
    }
  } else {
    // Local development
    const data = await localGet(key);
    if (data) {
      return data;
    }
  }

  return { escrowId, clarifications: [] };
}

async function saveClarifications(data: EscrowClarifications): Promise<void> {
  const key = `escrow-${data.escrowId}`;

  if (isServerless()) {
    const store = getStore("clarifications");
    await store.setJSON(key, data);
  } else {
    await localSet(key, data);
  }
}

export async function addQuestion(
  escrowId: number,
  question: string,
  askedBy: string
): Promise<Clarification> {
  const existing = await getClarifications(escrowId);

  const clarification: Clarification = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    answer: null,
    askedBy,
    askedAt: Date.now(),
    answeredBy: null,
    answeredAt: null,
  };

  existing.clarifications.push(clarification);
  await saveClarifications(existing);

  return clarification;
}

export async function addAnswer(
  escrowId: number,
  questionId: string,
  answer: string,
  answeredBy: string
): Promise<Clarification | null> {
  const existing = await getClarifications(escrowId);

  const clarification = existing.clarifications.find((c) => c.id === questionId);
  if (!clarification) {
    return null;
  }

  clarification.answer = answer;
  clarification.answeredBy = answeredBy;
  clarification.answeredAt = Date.now();

  await saveClarifications(existing);

  return clarification;
}

export async function getUnansweredQuestions(
  escrowId: number
): Promise<Clarification[]> {
  const data = await getClarifications(escrowId);
  return data.clarifications.filter((c) => c.answer === null);
}

export async function getAnsweredQuestions(
  escrowId: number
): Promise<Clarification[]> {
  const data = await getClarifications(escrowId);
  return data.clarifications.filter((c) => c.answer !== null);
}

export function formatClarificationsForPrompt(
  clarifications: Clarification[]
): string {
  const answered = clarifications.filter((c) => c.answer !== null);
  if (answered.length === 0) {
    return "";
  }

  let text = "## Clarifications (Q&A between submitter and provider)\n\n";
  for (const c of answered) {
    text += `**Q:** ${c.question}\n`;
    text += `**A:** ${c.answer}\n\n`;
  }

  return text;
}
