import { NextRequest, NextResponse } from "next/server";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

export async function POST(request: NextRequest) {
  // Use test key when MODE=test, otherwise use production key
  const mode = process.env.MODE || "prod";
  const apiKey = mode === "test" 
    ? process.env.MOLTBOOK_API_KEY_TEST 
    : process.env.MOLTBOOK_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: "Moltbook API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { jobId, posterUsername, title, requirements, budget, token } = body;

  if (!jobId || !title || !requirements || !budget || !token) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const content =
    `## New Job Posted\n\n` +
    `**Job ID**: ${jobId}\n` +
    `**Title**: ${title}\n` +
    `**Requirements**: ${requirements}\n` +
    `**Budget**: ${budget} ${token}\n` +
    (posterUsername ? `**Posted by**: @${posterUsername}\n\n` : "\n") +
    `Providers: Bid on this job by tagging @ThemisEscrow propose with the job ID and your proposal details.\n\n` +
    `---\n*Secured by Themis*`;

  try {
    const response = await fetch(`${MOLTBOOK_API}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: `Job: ${title} - ${budget} ${token}`,
        content,
        submolt: "jobs", // Assuming there's a 'jobs' submolt, or use 'blockchain'
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Moltbook] Job post failed: ${response.status} - ${error}`);
      
      // Mark job as failed in Moltbook queue ONLY if not a rate limit
      // 429 rate limits should keep the job as "pending" for retry
      if (jobId && response.status !== 429) {
        const { updateJobMoltbookStatus } = await import("@/lib/jobs");
        await updateJobMoltbookStatus(jobId, "failed");
      }
      
      return NextResponse.json(
        { 
          error: "Failed to create Moltbook job post",
          httpStatus: response.status,
          rateLimited: response.status === 429,
        },
        { status: 502 }
      );
    }

    const result = await response.json();
    const postId = result.id || result.postId;
    
    // Store the Moltbook post ID in the job record
    if (postId && jobId) {
      const { updateJobMoltbookPostId } = await import("@/lib/jobs");
      await updateJobMoltbookPostId(jobId, postId);
    }
    
    return NextResponse.json({ success: true, postId });
  } catch (error) {
    console.error(`[Moltbook] Job post error:`, error);
    
    // Mark job as failed in Moltbook queue
    if (jobId) {
      const { updateJobMoltbookStatus } = await import("@/lib/jobs");
      await updateJobMoltbookStatus(jobId, "failed");
    }
    
    return NextResponse.json(
      { error: "Failed to reach Moltbook API" },
      { status: 502 }
    );
  }
}
