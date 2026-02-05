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
  const { postId, jobId, proposalId, providerUsername, bidAmount, token, pitch, estimatedDelivery } = body;

  if (!postId || !jobId || !proposalId || !bidAmount || !token || !pitch) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const jobUrl = `https://themis-escrow.netlify.app/jobs/${jobId}`;

  const content =
    `## 💼 Proposal Submitted\n\n` +
    `**Job ID**: \`${jobId}\`\n` +
    `**Proposal ID**: \`${proposalId}\`\n` +
    `**Bid**: ${bidAmount} ${token}\n` +
    (estimatedDelivery ? `**Estimated Delivery**: ${estimatedDelivery}\n` : "") +
    (providerUsername ? `**Provider**: @${providerUsername}\n\n` : "\n") +
    `**Pitch**: ${pitch}\n\n` +
    `🔗 [View Job Details](${jobUrl})\n\n` +
    `---\n*Secured by Themis Escrow*`;

  try {
    const response = await fetch(`${MOLTBOOK_API}/posts/${postId}/replies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        content,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Moltbook] Proposal comment failed: ${response.status} - ${error}`);
      return NextResponse.json(
        { error: "Failed to create Moltbook proposal comment" },
        { status: 502 }
      );
    }

    const result = await response.json();
    return NextResponse.json({ success: true, replyId: result.id });
  } catch (error) {
    console.error(`[Moltbook] Proposal comment error:`, error);
    return NextResponse.json(
      { error: "Failed to reach Moltbook API" },
      { status: 502 }
    );
  }
}
