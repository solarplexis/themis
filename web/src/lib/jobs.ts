import { getStore } from "@netlify/blobs";
import { promises as fs } from "fs";
import path from "path";

export type JobStatus = "open" | "accepted" | "funded" | "cancelled";

export interface Proposal {
  id: string;                     // "p-{timestamp}-{random6}"
  providerAddress: string;
  providerUsername: string | null;
  bidAmount: number;              // <= job.budget
  token: string;                  // "ETH" | "MOLT"
  pitch: string;
  estimatedDelivery: string | null;
  submittedAt: number;
  status: "pending" | "accepted" | "rejected";
}

export type MoltbookStatus = "pending" | "posted" | "failed";

export interface Job {
  id: string;                     // "job-{timestamp}-{random6}"
  posterAddress: string;
  posterUsername: string | null;
  title: string;
  requirements: string;           // text or IPFS CID
  budget: number;
  token: string;
  deadline: string | null;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  acceptedProposalId: string | null;
  escrowId: number | null;
  moltbookPostId: string | null;
  moltbookStatus: MoltbookStatus; // Track posting queue status
  moltbookRetries: number;        // Track retry attempts
  proposals: Proposal[];
}

// Check if we're running in a serverless environment (can't write to filesystem)
function isServerless(): boolean {
  return (
    process.cwd().startsWith("/var/task") ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.NETLIFY ||
    !!process.env.CONTEXT
  );
}

// Local file-based storage for development
const LOCAL_STORE_DIR = path.join(process.cwd(), ".jobs");

async function ensureLocalDir(): Promise<void> {
  try {
    await fs.mkdir(LOCAL_STORE_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

async function localGet(key: string): Promise<Job | null> {
  await ensureLocalDir();
  const filePath = path.join(LOCAL_STORE_DIR, `${key}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function localGetAll(): Promise<Job[]> {
  await ensureLocalDir();
  const files = await fs.readdir(LOCAL_STORE_DIR);
  const jobs: Job[] = [];
  for (const file of files) {
    if (file.startsWith("job-") && file.endsWith(".json")) {
      const data = await fs.readFile(path.join(LOCAL_STORE_DIR, file), "utf-8");
      jobs.push(JSON.parse(data));
    }
  }
  return jobs;
}

async function localSet(key: string, data: Job): Promise<void> {
  await ensureLocalDir();
  const filePath = path.join(LOCAL_STORE_DIR, `${key}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function localDelete(key: string): Promise<void> {
  await ensureLocalDir();
  const filePath = path.join(LOCAL_STORE_DIR, `${key}.json`);
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') { // Ignore file not found errors
      throw error;
    }
  }
}


// Netlify Blob Store functions
const getJobsStore = () => getStore("jobs");

// Exported functions

export async function getAllJobs(): Promise<Job[]> {
  if (isServerless()) {
    const store = getJobsStore();
    const { blobs } = await store.list();
    const jobs: Job[] = [];
    for (const blob of blobs) {
      if (blob.key.startsWith("job-")) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) jobs.push(data as Job);
      }
    }
    return jobs;
  } else {
    return localGetAll();
  }
}

export async function getJob(id: string): Promise<Job | null> {
  const key = id;
  if (isServerless()) {
    const store = getJobsStore();
    try {
      const data = await store.get(key, { type: "json" });
      return data ? (data as Job) : null;
    } catch {
      return null;
    }
  } else {
    return localGet(key);
  }
}

export async function getOpenJobs(): Promise<Job[]> {
  const jobs = await getAllJobs();
  return jobs.filter(job => job.status === "open");
}

export async function getJobsByPoster(address: string): Promise<Job[]> {
  const jobs = await getAllJobs();
  return jobs.filter(job => job.posterAddress.toLowerCase() === address.toLowerCase());
}

interface CreateJobParams {
  posterAddress: string;
  posterUsername: string | null;
  title: string;
  requirements: string;
  budget: number;
  token: string;
  deadline: string | null;
}

export async function createJob(params: CreateJobParams): Promise<Job> {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = {
    id,
    ...params,
    status: "open",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    acceptedProposalId: null,
    escrowId: null,
    moltbookPostId: null,
    moltbookStatus: "pending",
    moltbookRetries: 0,
    proposals: [],
  };

  const key = id;
  if (isServerless()) {
    await getJobsStore().setJSON(key, job);
  } else {
    await localSet(key, job);
  }
  return job;
}

export async function updateJobMoltbookPostId(jobId: string, postId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job) {
    return false;
  }

  job.moltbookPostId = postId;
  job.moltbookStatus = "posted";
  job.updatedAt = Date.now();

  const key = jobId;
  if (isServerless()) {
    await getJobsStore().setJSON(key, job);
  } else {
    await localSet(key, job);
  }
  return true;
}

export async function updateJobMoltbookStatus(jobId: string, status: MoltbookStatus): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job) {
    return false;
  }

  job.moltbookStatus = status;
  if (status === "failed") {
    job.moltbookRetries = (job.moltbookRetries || 0) + 1;
  }
  job.updatedAt = Date.now();

  const key = jobId;
  if (isServerless()) {
    await getJobsStore().setJSON(key, job);
  } else {
    await localSet(key, job);
  }
  return true;
}

export async function getPendingMoltbookJobs(): Promise<Job[]> {
  const jobs = await getAllJobs();
  // Include both pending and failed jobs (failed will be retried)
  // Exclude jobs that have been retried too many times (>5 attempts)
  return jobs.filter(job => 
    (job.moltbookStatus === "pending" || job.moltbookStatus === "failed") &&
    (job.moltbookRetries || 0) < 5
  );
}

export async function cancelJob(id: string, posterAddress: string): Promise<boolean> {
  const job = await getJob(id);
  if (!job || job.posterAddress.toLowerCase() !== posterAddress.toLowerCase()) {
    return false;
  }

  job.status = "cancelled";
  job.updatedAt = Date.now();

  const key = id;
  if (isServerless()) {
    await getJobsStore().setJSON(key, job);
  } else {
    await localSet(key, job);
  }
  return true;
}

interface AddProposalParams {
  providerAddress: string;
  providerUsername: string | null;
  bidAmount: number;
  token: string;
  pitch: string;
  estimatedDelivery: string | null;
}

export async function addProposal(jobId: string, params: AddProposalParams): Promise<Proposal | null> {
  const job = await getJob(jobId);
  if (!job || job.status !== "open" || params.bidAmount > job.budget) {
    return null;
  }

  const proposal: Proposal = {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    submittedAt: Date.now(),
    status: "pending",
  };

  job.proposals.push(proposal); // Temporarily add for local update
  const updatedJob = {
    ...job,
    proposals: [...job.proposals], // Create a new array to ensure immutability
    updatedAt: Date.now(),
  };

  const key = jobId;
  if (isServerless()) {
    await getJobsStore().setJSON(key, updatedJob);
  } else {
    await localSet(key, updatedJob);
  }
  return proposal;
}

export async function acceptProposal(jobId: string, proposalId: string, posterAddress: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job || job.posterAddress.toLowerCase() !== posterAddress.toLowerCase() || job.status !== "open") {
    return false;
  }

  const proposal = job.proposals.find(p => p.id === proposalId);
  if (!proposal) {
    return false;
  }

  job.status = "accepted";
  job.acceptedProposalId = proposalId;
  job.updatedAt = Date.now();
  proposal.status = "accepted";

  // Reject all other proposals
  job.proposals.forEach(p => {
    if (p.id !== proposalId) {
      p.status = "rejected";
    }
  });

  const updatedJob: Job = {
    ...job,
    status: "accepted" as JobStatus,
    acceptedProposalId: proposalId,
    updatedAt: Date.now(),
    proposals: job.proposals.map(p => p.id === proposalId ? { ...p, status: "accepted" as const } : p)
  };

  const key = jobId;
  if (isServerless()) {
    await getJobsStore().setJSON(key, updatedJob);
  } else {
    await localSet(key, updatedJob);
  }
  return true;
}

export async function rejectProposal(jobId: string, proposalId: string, posterAddress: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job || job.posterAddress.toLowerCase() !== posterAddress.toLowerCase() || job.status !== "open") {
    return false;
  }

  const proposal = job.proposals.find(p => p.id === proposalId);
  if (!proposal) {
    return false;
  }

  proposal.status = "rejected";
  job.updatedAt = Date.now();

  const updatedJob: Job = {
    ...job,
    updatedAt: Date.now(),
    proposals: job.proposals.map(p => p.id === proposalId ? { ...p, status: "rejected" as const } : p)
  };

  const key = jobId;
  if (isServerless()) {
    await getJobsStore().setJSON(key, updatedJob);
  } else {
    await localSet(key, updatedJob);
  }
  return true;
}

export async function linkEscrowToJob(jobId: string, escrowId: number): Promise<boolean> {
  const job = await getJob(jobId);
  // Allow linking escrow even if job is not "accepted" to cover edge cases
  if (!job) {
    return false;
  }

  job.status = "funded";
  job.escrowId = escrowId;
  job.updatedAt = Date.now();

  const updatedJob: Job = {
    ...job,
    status: "funded" as JobStatus,
    escrowId: escrowId,
    updatedAt: Date.now(),
  };

  const key = jobId;
  if (isServerless()) {
    await getJobsStore().setJSON(key, updatedJob);
  } else {
    await localSet(key, updatedJob);
  }
  return true;
}
