import { privateKeyToAccount } from "viem/accounts";

// Mock private keys for testing (DO NOT use in production)
const POSTER_PRIVATE_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123" as const;
const PROVIDER_PRIVATE_KEY = "0x1234567890123456789012345678901234567890123456789012345678901234" as const;

const posterAccount = privateKeyToAccount(POSTER_PRIVATE_KEY);
const providerAccount = privateKeyToAccount(PROVIDER_PRIVATE_KEY);

const POSTER_ADDRESS = posterAccount.address;
const PROVIDER_ADDRESS = providerAccount.address;

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function signMessage(privateKey: `0x${string}`, message: string): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey);
  return account.signMessage({ message });
}

async function runTest() {
  console.log("=".repeat(60));
  console.log("Starting E2E Job Workflow Test");
  console.log("=".repeat(60));

  let jobId: string;
  let proposalId: string;
  const mockEscrowId = 999;

  try {
    // Step 1: Create Job
    console.log("\n[1/5] Creating job...");
    const createJobMessage = "Themis: create job";
    const createJobSignature = await signMessage(POSTER_PRIVATE_KEY, createJobMessage);

    const createJobRes = await fetch(`${BASE_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posterAddress: POSTER_ADDRESS,
        posterUsername: "testPoster",
        title: "E2E Test: Give me a general social sentiment towards AI in the last 24 hours",
        requirements: "Your response should include:\n- A brief summary of the overall sentiment (positive, negative, neutral)\n- Key themes or topics people are discussing related to AI\n- Any notable trends or changes in sentiment compared to previous days\n- Please provide data from Twitter and Reddit",
        budget: 0.0001,
        token: "ETH",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        signature: createJobSignature,
      }),
    });

    if (!createJobRes.ok) {
      const error = await createJobRes.json();
      throw new Error(`Failed to create job: ${error.error}`);
    }

    const createJobData = await createJobRes.json();
    jobId = createJobData.job.id;
    console.log(`✓ Job created: ${jobId}`);

    // Note: Moltbook posting happens asynchronously and may be queued due to rate limits
    // The job is fully functional on Themis regardless of Moltbook posting status

    // Step 2: Submit Proposal
    console.log("\n[2/5] Submitting proposal...");
    const proposeMessage = `Themis: propose on job ${jobId}`;
    const proposeSignature = await signMessage(PROVIDER_PRIVATE_KEY, proposeMessage);

    const submitProposalRes = await fetch(`${BASE_URL}/api/jobs/${jobId}/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerAddress: PROVIDER_ADDRESS,
        providerUsername: "testProvider",
        bidAmount: 0.00008,
        token: "ETH",
        pitch: "I can deliver this component in 3 days, meeting all requirements.",
        estimatedDelivery: "3 days",
        signature: proposeSignature,
      }),
    });

    if (!submitProposalRes.ok) {
      const error = await submitProposalRes.json();
      throw new Error(`Failed to submit proposal: ${error.error}`);
    }

    const submitProposalData = await submitProposalRes.json();
    proposalId = submitProposalData.proposal.id;
    console.log(`✓ Proposal submitted: ${proposalId}`);
    console.log(`  ℹ️  Proposal posted as Moltbook comment on job post`);

    // Step 3: Accept Proposal
    console.log("\n[3/5] Accepting proposal...");
    const acceptMessage = `Themis: accept proposal on job ${jobId}`;
    const acceptSignature = await signMessage(POSTER_PRIVATE_KEY, acceptMessage);

    const acceptProposalRes = await fetch(`${BASE_URL}/api/jobs/${jobId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId: proposalId,
        signerAddress: POSTER_ADDRESS,
        signature: acceptSignature,
      }),
    });

    if (!acceptProposalRes.ok) {
      const error = await acceptProposalRes.json();
      throw new Error(`Failed to accept proposal: ${error.error}`);
    }

    console.log(`✓ Proposal accepted`);

    // Step 4: Link Escrow to Job
    console.log("\n[4/5] Linking escrow to job...");
    const linkEscrowMessage = `Themis: link escrow to job ${jobId}`;
    const linkEscrowSignature = await signMessage(POSTER_PRIVATE_KEY, linkEscrowMessage);

    const linkEscrowRes = await fetch(`${BASE_URL}/api/jobs/${jobId}/link-escrow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escrowId: mockEscrowId,
        signerAddress: POSTER_ADDRESS,
        signature: linkEscrowSignature,
      }),
    });

    if (!linkEscrowRes.ok) {
      const error = await linkEscrowRes.json();
      throw new Error(`Failed to link escrow: ${error.error}`);
    }

    console.log(`✓ Escrow linked`);

    // Step 5: Verify Job Status
    console.log("\n[5/5] Verifying final job status...");
    const verifyJobRes = await fetch(`${BASE_URL}/api/jobs/${jobId}`);
    
    if (!verifyJobRes.ok) {
      throw new Error(`Failed to fetch job for verification`);
    }

    const verifyJobData = await verifyJobRes.json();
    const job = verifyJobData.job;

    if (job.status !== "funded") {
      throw new Error(`Job status is '${job.status}', expected 'funded'`);
    }
    if (job.escrowId !== mockEscrowId) {
      throw new Error(`Job escrowId is '${job.escrowId}', expected '${mockEscrowId}'`);
    }
    if (job.acceptedProposalId !== proposalId) {
      throw new Error(`Accepted proposal ID is '${job.acceptedProposalId}', expected '${proposalId}'`);
    }

    console.log(`✓ Job verified successfully`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ E2E Job Workflow Test PASSED!");
    console.log("=".repeat(60));
    console.log(`\nJob ID: ${jobId}`);
    console.log(`Proposal ID: ${proposalId}`);
    console.log(`Escrow ID: ${mockEscrowId}`);
    console.log(`Status: ${job.status}`);
    
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ E2E Job Workflow Test FAILED!");
    console.error("=".repeat(60));
    console.error(error);
    process.exit(1);
  }
}

runTest();
