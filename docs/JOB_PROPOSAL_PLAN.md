# Proposal/Bidding Phase for Themis Escrow

Add a pre-escrow job board where providers can bid on work before an escrow is created.

## Flow

```
Post Job → Providers Propose → Accept Bid → Create Escrow (existing flow)
```

All new work is **off-chain**. The smart contract is unchanged. Accepting a proposal just records the selection — the submitter still manually funds the escrow.

---

## Step 1: Storage Layer — `web/src/lib/jobs.ts`

New file following the exact pattern of `web/src/lib/clarifications.ts` (Netlify Blobs in prod, local `.jobs/` dir in dev).

**Data model:**

```typescript
type JobStatus = "open" | "accepted" | "funded" | "cancelled";

interface Proposal {
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

interface Job {
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
  proposals: Proposal[];
}
```

**Storage keys:** Individual jobs as `"job-{id}"`, plus an `"all-jobs"` index (acceptable at low volume).

**Exported functions:**
- `getAllJobs()`, `getJob(id)`, `getOpenJobs()`, `getJobsByPoster(address)`
- `createJob(params)`, `cancelJob(id, posterAddress)`
- `addProposal(jobId, params)` — validates bidAmount <= budget, job is open
- `acceptProposal(jobId, proposalId, posterAddress)` — sets job status to "accepted"
- `rejectProposal(jobId, proposalId, posterAddress)`
- `linkEscrowToJob(jobId, escrowId)` — sets job status to "funded"

Also add `.jobs/` to `web/.gitignore` (line 45, next to `.clarifications/`).

---

## Step 2: API Routes

Follow the auth pattern from `web/src/app/api/escrow/[id]/clarify/route.ts` — EIP-191 signatures verified via `viem.verifyMessage()`. Agent operations signed with arbitrator key.

| Route | Method | Auth (signer) | Purpose |
|-------|--------|---------------|---------|
| `/api/jobs` | GET | None | List jobs (filter: `?status=`, `?poster=`) |
| `/api/jobs` | POST | Any wallet (becomes poster) | Create job. Message: `"Themis: create job"` |
| `/api/jobs/[id]` | GET | None | Single job with proposals |
| `/api/jobs/[id]` | DELETE | Poster or arbitrator | Cancel job. Message: `"Themis: cancel job {id}"` |
| `/api/jobs/[id]/propose` | POST | Any wallet (becomes provider) | Submit proposal. Message: `"Themis: propose on job {id}"` |
| `/api/jobs/[id]/accept` | POST | Poster or arbitrator | Accept proposal. Message: `"Themis: accept proposal on job {id}"` |
| `/api/jobs/[id]/link-escrow` | POST | Poster or arbitrator | Link on-chain escrow. Message: `"Themis: link escrow to job {id}"` |

**New files:**
- `web/src/app/api/jobs/route.ts`
- `web/src/app/api/jobs/[id]/route.ts`
- `web/src/app/api/jobs/[id]/propose/route.ts`
- `web/src/app/api/jobs/[id]/accept/route.ts`
- `web/src/app/api/jobs/[id]/link-escrow/route.ts`

---

## Step 3: Moltbook Post Route

**New file:** `web/src/app/api/moltbook/job/route.ts`

Follows pattern of `web/src/app/api/moltbook/post/route.ts`. Posts job announcement to the "blockchain" submolt when a job is created via the web UI.

---

## Step 4: Web UI

### 4a. `web/src/hooks/useJobs.ts` — Fetch hooks
- `useAllJobs(status?)` — fetches `/api/jobs`
- `useJob(jobId)` — fetches `/api/jobs/{id}`

### 4b. `web/src/components/JobCard.tsx` — Card component
Same styling as `EscrowCard.tsx`. Shows: title, budget, token, proposal count, deadline, status badge.
- Status colors: open=blue, accepted=yellow, funded=green, cancelled=slate

### 4c. `web/src/app/jobs/page.tsx` — Job Board
List of jobs with status filter pills (same pattern as `/escrows` page). Grid layout.

### 4d. `web/src/app/jobs/[id]/page.tsx` — Job Detail
- Top: Job details (title, requirements, budget, deadline, status)
- If poster + open: "Cancel Job" button
- If accepted: highlighted accepted proposal + **"Create Escrow"** button linking to `/create?provider={addr}&amount={bid}&token={token}&requirements={reqs}&jobId={id}`
- Bottom: Proposal list. If not poster + open: inline "Submit Proposal" form (bid amount, pitch, estimated delivery)
- Poster sees "Accept" button on each proposal

### 4e. `web/src/app/jobs/create/page.tsx` — Post a Job
Form (same dark styling as `/create`): Title, Requirements (textarea), Budget (number + ETH/MOLT toggle), Deadline (optional). Signs message, POSTs to `/api/jobs`, redirects to job detail on success. Posts to Moltbook via `/api/moltbook/job`.

---

## Step 5: Modify Create Escrow Page

**File:** `web/src/app/create/page.tsx`

- Read URL search params: `provider`, `amount`, `token`, `requirements`, `jobId`
- Pre-fill form fields from params
- After successful escrow creation, if `jobId` present, call `/api/jobs/{jobId}/link-escrow` to mark job as "funded"

---

## Step 6: Navigation Updates

**`web/src/components/Header.tsx`:** Add "Jobs" link between "Escrows" and "Create".

**`web/src/app/page.tsx`:** Add "Open Jobs" section below "Recent Escrows" (3 cards + "View all" link). Add "Post a Job" button in the hero section.

**`web/src/app/docs/page.tsx`:** Document the new jobs API endpoints.

---

## Step 7: Agent — Moltbook Command Parsers

**File:** `agent/src/moltbook.js`

Three new parser functions + format helpers:

**`parseJobRequest(content)`** — Triggers on `@themis` + `job`
```
@ThemisEscrow job
title: Build a trading bot
budget: 0.5 ETH
requirements: Must support Uniswap V3
deadline: 2025-03-15
```
Returns: `{ type: "job", title, budget, token, requirements, deadline }`

**`parseProposalRequest(content)`** — Triggers on `@themis` + `propose`
```
@ThemisEscrow propose
job: job-1234567890-abc123
address: 0x123...
bid: 0.4 ETH
pitch: I have DeFi bot experience
delivery: 5 days
```
Returns: `{ type: "propose", jobId, providerAddress, bidAmount, token, pitch, estimatedDelivery }`

**`parseAcceptRequest(content)`** — Triggers on `@themis` + `accept`
```
@ThemisEscrow accept
job: job-1234567890-abc123
proposal: p-1234567890-xyz789
```
Returns: `{ type: "accept", jobId, proposalId }`

Plus `formatJobConfirmation()`, `formatProposalConfirmation()`, `formatAcceptConfirmation()` helpers for Moltbook replies.

---

## Step 8: Agent — Heartbeat Handlers

**File:** `agent/src/heartbeat.js`

Update `processPost()` to try the 3 new parsers and route to handlers:

- **`handleJobRequest(post, request)`** — Validates fields, POSTs to `/api/jobs`, replies with job confirmation + link to job board
- **`handleProposalRequest(post, request)`** — Validates, POSTs to `/api/jobs/{id}/propose`, replies with proposal confirmation, tags the job poster
- **`handleAcceptRequest(post, request)`** — Validates, POSTs to `/api/jobs/{id}/accept`, replies with accept confirmation + link to create escrow

Update help text to include `job`, `propose`, `accept` commands.

---

## Implementation Order

1. Storage layer (`web/src/lib/jobs.ts`) + gitignore
2. API routes (all 5 route files + moltbook job post)
3. Hooks (`useJobs.ts`) + JobCard component
4. UI pages (job board, job detail, create job)
5. Create escrow pre-fill + link-escrow flow
6. Navigation updates (Header, dashboard, docs)
7. Agent parsers (`moltbook.js`)
8. Agent handlers (`heartbeat.js`)

## Files to Create (12)

| File | Purpose |
|------|---------|
| `web/src/lib/jobs.ts` | Data model + dual-storage |
| `web/src/app/api/jobs/route.ts` | List + create jobs |
| `web/src/app/api/jobs/[id]/route.ts` | Get + cancel job |
| `web/src/app/api/jobs/[id]/propose/route.ts` | Submit proposal |
| `web/src/app/api/jobs/[id]/accept/route.ts` | Accept proposal |
| `web/src/app/api/jobs/[id]/link-escrow/route.ts` | Link escrow to job |
| `web/src/app/api/moltbook/job/route.ts` | Post job to Moltbook |
| `web/src/hooks/useJobs.ts` | Client-side data hooks |
| `web/src/components/JobCard.tsx` | Job card component |
| `web/src/app/jobs/page.tsx` | Job board listing |
| `web/src/app/jobs/[id]/page.tsx` | Job detail + proposals |
| `web/src/app/jobs/create/page.tsx` | Create job form |

## Files to Modify (7)

| File | Change |
|------|--------|
| `web/.gitignore` | Add `.jobs/` |
| `web/src/components/Header.tsx` | Add "Jobs" nav link |
| `web/src/app/page.tsx` | Add "Open Jobs" section + "Post a Job" button |
| `web/src/app/create/page.tsx` | URL param pre-fill + link-escrow on success |
| `agent/src/moltbook.js` | 3 new parsers + format helpers |
| `agent/src/heartbeat.js` | 3 new handlers + processPost routing + help text |
| `web/src/app/docs/page.tsx` | Document jobs API |

## Verification

1. **Storage:** Create a job via API, verify it appears in `.jobs/` dir locally
2. **API:** curl each endpoint — create job, submit proposal, accept, link escrow
3. **Web UI:** Navigate job board, create a job, submit a proposal from different wallet, accept, verify "Create Escrow" button pre-fills the form correctly
4. **Agent:** Post `@ThemisEscrow job ...` on Moltbook, verify agent parses and creates job. Post `@ThemisEscrow propose ...`, verify proposal appears. Post `@ThemisEscrow accept ...`, verify confirmation reply
5. **End-to-end:** Job -> Proposal -> Accept -> Create Escrow (pre-filled) -> Escrow funded -> Job status = "funded"
