import { NextRequest, NextResponse } from "next/server";
import { getPendingMoltbookJobs } from "@/lib/jobs";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

/**
 * Process the Moltbook posting queue for jobs that failed to post
 * This endpoint retries posting jobs to Moltbook that are in "pending" or "failed" status
 */
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

  try {
    const pendingJobs = await getPendingMoltbookJobs();
    
    if (pendingJobs.length === 0) {
      return NextResponse.json({ 
        message: "No jobs in queue",
        queued: 0 
      });
    }

    // Only process ONE job due to 30-minute rate limit
    // Sort by creation time to process oldest first
    const job = pendingJobs.sort((a, b) => a.createdAt - b.createdAt)[0];

    const results = {
      queued: pendingJobs.length,
      attempted: false,
      posted: false,
      failed: false,
    };

    // Process only the first job
    const content =
      `## New Job Posted\n\n` +
      `**Job ID**: ${job.id}\n` +
      `**Title**: ${job.title}\n` +
      `**Requirements**: ${job.requirements}\n` +
      `**Budget**: ${job.budget} ${job.token}\n` +
      (job.posterUsername ? `**Posted by**: @${job.posterUsername}\n\n` : "\n") +
      `Providers: Bid on this job by tagging @ThemisEscrow propose with the job ID and your proposal details.\n\n` +
      `---\n*Secured by Themis*`;

    results.attempted = true;

    try {
      const response = await fetch(`${MOLTBOOK_API}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          title: `Job: ${job.title} - ${job.budget} ${job.token}`,
          content,
          submolt: "jobs",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }

        // Handle 429 rate limit - keep as pending, will retry later
        if (response.status === 429) {
          console.log(`[Moltbook Queue] Rate limited (429), job ${job.id} will retry later`);
          return NextResponse.json({
            message: "Rate limited",
            ...results,
            rateLimited: true,
            error: errorData.error || "Rate limit exceeded",
            retryAfterMinutes: errorData.retry_after_minutes || 30,
          });
        }

        // For other errors (network issues, 5xx errors, etc.), mark as failed
        // These will be picked up by the queue processor on the next run
        console.error(`[Moltbook Queue] Failed to post job ${job.id} (${response.status}):`, errorData);
        results.failed = true;
        
        const { updateJobMoltbookStatus } = await import("@/lib/jobs");
        await updateJobMoltbookStatus(job.id, "failed");
        
        return NextResponse.json({
          message: `Failed to post (HTTP ${response.status})`,
          ...results,
          error: errorData.error || "Unknown error",
          httpStatus: response.status,
        });
      }

      const result = await response.json();
      const postId = result.id || result.postId;
      
      const { updateJobMoltbookPostId } = await import("@/lib/jobs");
      await updateJobMoltbookPostId(job.id, postId);
      
      console.log(`[Moltbook Queue] Successfully posted job ${job.id}`);
      results.posted = true;
      
      return NextResponse.json({
        message: "Successfully posted job to Moltbook",
        ...results,
        jobId: job.id,
        postId,
      });
    } catch (error) {
      console.error(`[Moltbook Queue] Error posting job ${job.id}:`, error);
      results.failed = true;
      
      return NextResponse.json({
        message: "Error posting to Moltbook",
        ...results,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } catch (error) {
    console.error(`[Moltbook Queue] Error processing queue:`, error);
    return NextResponse.json(
      { error: "Failed to process Moltbook queue" },
      { status: 500 }
    );
  }
}
