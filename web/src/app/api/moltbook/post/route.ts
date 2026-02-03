import { NextRequest, NextResponse } from "next/server";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

export async function POST(request: NextRequest) {
  const apiKey = process.env.MOLTBOOK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Moltbook API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { escrowId, buyer, seller, amount, token, txHash, chainId } = body;

  if (!escrowId || !buyer || !seller || !amount || !token || !txHash) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const explorer =
    chainId === 8453
      ? `https://basescan.org/tx/${txHash}`
      : `https://sepolia.etherscan.io/tx/${txHash}`;

  const content =
    `## New Escrow Created\n\n` +
    `**Escrow #${escrowId}** is now funded and active.\n\n` +
    `- **Submitter**: \`${buyer}\`\n` +
    `- **Provider**: \`${seller}\`\n` +
    `- **Amount**: ${amount} ${token}\n\n` +
    `[View transaction](${explorer})\n\n` +
    `Provider: submit your deliverable by tagging \`@ThemisEscrow deliver\` with the escrow ID and deliverable link.\n\n` +
    `---\n*Secured by Themis*`;

  try {
    const response = await fetch(`${MOLTBOOK_API}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: `Escrow #${escrowId} Created — ${amount} ${token}`,
        content,
        submolt: "blockchain",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Moltbook] Post failed: ${response.status} - ${error}`);
      return NextResponse.json(
        { error: "Failed to create Moltbook post" },
        { status: 502 }
      );
    }

    const result = await response.json();
    return NextResponse.json({ success: true, postId: result.postId });
  } catch (error) {
    console.error(`[Moltbook] Post error:`, error);
    return NextResponse.json(
      { error: "Failed to reach Moltbook API" },
      { status: 502 }
    );
  }
}
