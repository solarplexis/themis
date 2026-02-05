import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { addProposal, getJob } from "@/lib/jobs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await params here

  let body: {
    providerAddress: string;
    providerUsername: string | null;
    bidAmount: number;
    token: string;
    pitch: string;
    estimatedDelivery: string | null;
    signature: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    providerAddress,
    providerUsername,
    bidAmount,
    token,
    pitch,
    estimatedDelivery,
    signature,
  } = body;

  if (
    !providerAddress ||
    !bidAmount ||
    !token ||
    !pitch ||
    !signature
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "open") {
      return NextResponse.json(
        { error: `Cannot propose on a job with status "${job.status}"` },
        { status: 400 }
      );
    }
    if (bidAmount > job.budget) {
        return NextResponse.json(
            { error: `Bid amount (${bidAmount}) cannot exceed job budget (${job.budget})`},
            { status: 400 }
        );
    }
    if (token !== job.token) {
        return NextResponse.json(
            { error: `Bid token (${token}) must match job token (${job.token})`},
            { status: 400 }
        );
    }

    const message = `Themis: propose on job ${id}`;
    const sigHex = signature as `0x${string}`;

    const isValid = await verifyMessage({
      address: providerAddress as `0x${string}`,
      message,
      signature: sigHex,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 403 }
      );
    }

    const proposal = await addProposal(id, {
      providerAddress,
      providerUsername,
      bidAmount,
      token,
      pitch,
      estimatedDelivery,
    });

    if (!proposal) {
        return NextResponse.json(
            { error: "Failed to add proposal, possibly due to job status or bid amount" },
            { status: 500 }
        );
    }

    // Post proposal as a comment on Moltbook if job has a post ID
    if (job.moltbookPostId) {
      try {
        const moltbookRes = await fetch(`${request.nextUrl.origin}/api/moltbook/proposal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId: job.moltbookPostId,
            jobId: id,
            proposalId: proposal.id,
            providerUsername,
            bidAmount,
            token,
            pitch,
            estimatedDelivery,
          }),
        });
        
        if (!moltbookRes.ok) {
          console.error("Failed to post proposal to Moltbook");
        }
      } catch (error) {
        console.error("Error posting proposal to Moltbook:", error);
      }
    }

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error(`[API] Propose on job ${id} error:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to submit proposal: ${msg}` },
      { status: 500 }
    );
  }
}
