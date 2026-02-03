# We're not on the same architecture / design page. Here are my questions / concerns

1. How do agents know / find out about ThemeEscrow? I would assume that the agent should be doing some of its own 'marketing' via posts, no?

> Right now, ThemisEscrow is completely passive -- it sits and waits for @mentions. No agent will ever find it unless they already know it exists. The agent should:
>
> - **Have a skill.json** hosted somewhere (per the Moltbook skill spec) so agents with skill discovery can find it programmatically.
> - **Post periodically** to relevant submolts (m/blockchain, m/agent-commerce, m/general) explaining what it does and how to use it. Not spam -- maybe once a day or when there's activity to report ("Escrow #6 completed, 0.1 ETH released to seller"). This doubles as marketing and a trust signal.
> - **Have a clear profile description** (already done) so agents browsing profiles can understand the service.
> - **Respond helpfully to unrecognized mentions** (the heartbeat already does this with a usage guide, though the reply method was broken until now).
>
> The heartbeat could include a "marketing" tick -- if no posts in X hours, post a status update or service advertisement.

2. I don't like the terms 'buyer' and 'seller'... they're too confusing. In this context, it should be something like submitter and provider

> Agreed. In the context of agent-to-agent task escrow:
>
> - **Submitter** = the agent requesting work and putting up funds
> - **Provider** = the agent doing the work and delivering results
>
> "Buyer/seller" implies a simple goods transaction. "Submitter/provider" better reflects the task-based workflow: one agent submits a task with requirements and funds, the other provides the deliverable.
>
> This is a rename across the codebase -- smart contract variable names are immutable on-chain, but we can alias them in the agent code, API, Moltbook posts, and frontend. The contract's `buyer`/`seller` fields would just map to `submitter`/`provider` everywhere user-facing.

3. How does the actual payment work between agents? Do agents have access to crypto funds (ETH, MOLT)? If so, how does token payment approval work between agents?

> This is the hardest practical question. Right now the contract assumes:
>
> 1. The submitter has a wallet with ETH or MOLT
> 2. The submitter calls `createEscrowETH` (sending ETH directly) or approves + calls `createEscrowERC20`
> 3. Themis releases/refunds from the contract
>
> For agent-to-agent use, agents need:
>
> - **A wallet with a private key** they control (many agent frameworks support this -- the Themis agent itself has one)
> - **Funds in that wallet** (ETH for gas + payment token)
> - **For ERC20 (MOLT)**: the agent must first call `approve()` on the token contract, then call `createEscrowERC20`. This is two transactions.
>
> The approval step is a friction point. Options to reduce it:
>
> - **Themis could wrap the flow**: the submitter agent sends funds directly to Themis (via a simple transfer or a Moltbook-mediated request), and Themis creates the escrow on their behalf. This removes the need for the submitter to interact with the contract directly.
> - **Permit-based approval (EIP-2612)**: if the MOLT token supports `permit()`, the agent can sign an off-chain approval message instead of a separate transaction. One tx instead of two.
> - **Just use ETH**: for simplicity, ETH escrows are single-transaction. No approval needed.
>
> The bigger question is whether most Moltbook agents even have wallets and funds. If not, the Moltbook-mediated flow (agent posts a request, Themis handles the on-chain parts) might be the only practical path initially.

4. I'm wondering if we really need a m/blockchain post when the escrow is created. If not, how do the agents know the result of the escrow? If we don't have a post on successful escrow creation, how is ThemeEscrow broadcasting its skills / availability?

> The post serves multiple purposes:
>
> - **Notification**: the provider agent knows the escrow is live and funded, and can start work. Without the post, the provider has no idea unless they're polling the contract.
> - **Public record**: other agents can see Themis is active, handling real escrows. This builds trust.
> - **Discoverability**: agents browsing m/blockchain see Themis in action and learn about the service.
>
> That said, posting to m/blockchain for every escrow could get noisy. Alternatives:
>
> - **Reply to the original request post** instead of creating a new top-level post. If agent A requested the escrow via a Moltbook mention, Themis replies to that thread with the confirmation. Keeps the context together.
> - **DM / messaging** if Moltbook supports it (the skill docs mention MESSAGING.md). Direct notification to the provider without public noise.
> - **Post only for significant events** -- creation confirmation as a reply, but post top-level only for completions/disputes (which are more interesting to the public).
>
> For availability/marketing, a separate periodic "status" post makes more sense than piggybacking on escrow creation posts.

5. Are there other mechanisms / skills that we should consider for ThemisEscrow?

> A few ideas:
>
> - **Reputation tracking**: Themis sees every escrow outcome. It could maintain a public reputation score for agents -- how many escrows completed, refund rate, dispute rate. Post periodic leaderboards to Moltbook. Other agents could query Themis before agreeing to work with someone.
> - **Milestone escrows**: instead of all-or-nothing, support multi-step escrows where funds release incrementally as milestones are verified. More complex but better for larger tasks.
> - **Escrow templates**: pre-defined task types (code review, content creation, data analysis) with standard verification criteria, so agents don't have to define requirements from scratch every time.
> - **Dispute mediation with evidence**: right now disputes are just flagged. Themis could collect evidence from both parties (via Moltbook thread replies), run AI analysis on both sides, and post a reasoned ruling.
> - **Moltbook messaging integration**: use DMs for sensitive escrow details (wallet addresses, private task requirements) instead of public posts.
> - **Auto-discovery via skill.json**: publish a Moltbook-compatible skill manifest so agent frameworks can auto-integrate with Themis.

---

# Execution Plan

## Decisions Made

- **Naming**: Rename buyer/seller to submitter/provider in user-facing text only (Moltbook posts, frontend UI, docs). Internal code and contract fields stay as-is.
- **Payment model**: Agents have their own wallets and interact with the contract directly. Themis arbitrates only. May revisit if agents turn out not to have wallets.
- **Post strategy**: Escrow confirmations are replies to the original request thread, not new top-level posts. Top-level posts are reserved for marketing/status updates.

---

## Phase 1: Fix the Core Loop

*Goal: A working end-to-end escrow flow between two agents on Moltbook.*

### 1.1 Rename buyer/seller to submitter/provider (user-facing)
- Moltbook posts (contract.js `_announceOnMoltbook`, web API route)
- Frontend create page, escrow cards, escrow list
- Heartbeat response messages
- Docs

### 1.2 Switch escrow confirmations from top-level posts to thread replies
- When an escrow is created via Moltbook mention (`handleEscrowRequest`), Themis already replies to the thread -- keep this as-is
- When an escrow is created via the agent's `createEscrowETH`/`createEscrowMOLT` directly (no originating Moltbook post), still create a top-level post (current behavior) since there's no thread to reply to
- Remove the top-level post from the web UI flow -- the frontend-created escrows don't have a Moltbook thread context either, so skip the Moltbook post entirely from the web UI (or keep it as opt-in)

### 1.3 Fix `handleEscrowRequest` to actually create on-chain escrows
- Currently it creates a local "pending" escrow and tells the submitter to fund the contract themselves
- Change: if the submitter provides a wallet address, Themis should track the request and confirm once the submitter funds the contract (poll or event-based)
- The confirmation reply should include escrow ID, amount, tx link, and instructions for the provider

### 1.4 Complete the delivery verification flow
- Provider tags `@ThemisEscrow deliver` with escrow ID and deliverable (IPFS CID or inline)
- Themis fetches requirements + deliverable, runs AI verification
- Themis calls `release()` or `refund()` on-chain
- Themis replies to the delivery post with the verdict, reasoning, and tx link

### 1.5 Test end-to-end on Sepolia
- Agent A posts escrow request on Moltbook
- Agent A funds the escrow on-chain
- ThemisEscrow confirms via thread reply
- Agent B posts deliverable
- ThemisEscrow verifies + releases/refunds
- ThemisEscrow posts result

---

## Phase 2: Discoverability & Marketing

*Goal: Other agents can find ThemisEscrow and understand how to use it.*

### 2.1 Publish skill.json
- Host at a public URL (e.g., on the Themis web app or GitHub)
- Define the skill manifest per Moltbook spec: name, description, capabilities, usage examples

### 2.2 Periodic status posts
- Add a marketing tick to the heartbeat: if no top-level post in 24 hours, post a status update
- Content: active escrow count, total volume processed, recent completions, how to use the service
- Post to m/blockchain or m/agent-commerce

### 2.3 Profile improvements
- Upload an avatar for ThemisEscrow
- Make the profile description include clear usage instructions and a link to skill.json

---

## Phase 3: Reputation System

*Goal: Agents can assess trustworthiness before entering an escrow.*

### 3.1 Track agent reputation
- Store per-agent stats: escrows completed, refunded, disputed, total volume
- Persist to a local database or file (agent currently uses in-memory maps only)

### 3.2 Expose reputation via Moltbook
- When an agent asks `@ThemisEscrow reputation @AgentName`, reply with their stats
- Include in escrow confirmation replies: "Provider @AgentName has completed X escrows with Y% success rate"

### 3.3 Periodic reputation posts
- Weekly leaderboard post: top providers by completion rate, most active submitters, largest escrows

---

## Phase 4: Dispute Resolution

*Goal: Disputes are resolved with evidence and reasoning, not just flagged.*

### 4.1 Evidence collection via thread
- When a dispute is raised, Themis replies asking both parties to present evidence in the thread
- Set a deadline for evidence submission (e.g., 24 hours)

### 4.2 AI-powered ruling
- After the evidence window, Themis collects all thread replies from both parties
- Run AI analysis: compare deliverable against requirements, weigh both arguments
- Call `resolveDispute()` on-chain
- Post a detailed ruling with reasoning to the thread

---

## Phase 5: Advanced Features

*Goal: Expand capabilities beyond basic escrow.*

### 5.1 Milestone escrows
- Support multi-step task definitions with partial releases
- Requires contract changes (new version deployment) or off-chain milestone tracking with sequential release calls

### 5.2 Escrow templates
- Pre-defined task types with standard verification criteria
- Agents can reference a template instead of writing requirements from scratch
- e.g., `@ThemisEscrow escrow template:code-review provider:@AgentB amount:0.05 ETH`

### 5.3 Moltbook messaging integration
- Use DMs for sensitive details (wallet addresses, private requirements)
- Requires MESSAGING.md integration from the Moltbook skill spec

### 5.4 Themis-wrapped payment flow
- For agents without direct contract interaction capability
- Submitter transfers funds to Themis wallet, Themis creates the escrow on their behalf
- Higher trust requirement on Themis but lower friction for agents

