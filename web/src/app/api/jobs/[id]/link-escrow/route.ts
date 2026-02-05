import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { linkEscrowToJob, getJob } from "@/lib/jobs";
import { getArbitrator } from "@/lib/contract";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // This 'id' is the jobId

  let body: {
    escrowId: number;
    signerAddress: string;
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

  const { escrowId, signerAddress, signature } = body;

  if (!escrowId || !signerAddress || !signature) {
    return NextResponse.json(
      { error: "Missing required fields: escrowId, signerAddress, signature" },
      { status: 400 }
    );
  }

  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const message = `Themis: link escrow to job ${id}`;
    const sigHex = signature as `0x${string}`;

    let isAuthorized = false;

    // Check if signer is the job poster
    if (job.posterAddress.toLowerCase() === signerAddress.toLowerCase()) {
      const isValidPoster = await verifyMessage({
        address: signerAddress as `0x${string}`,
        message,
        signature: sigHex,
      });
      if (isValidPoster) {
        isAuthorized = true;
      }
    }

    // Check if signer is the arbitrator
    if (!isAuthorized) {
      const arbitrator = await getArbitrator();
      if (arbitrator.toLowerCase() === signerAddress.toLowerCase()) {
        const isValidArbitrator = await verifyMessage({
          address: signerAddress as `0x${string}`,
          message,
          signature: sigHex,
        });
        if (isValidArbitrator) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized: signer must be job poster or arbitrator" },
        { status: 403 }
      );
    }

    const linked = await linkEscrowToJob(id, escrowId);
    if (!linked) {
      return NextResponse.json(
        { error: "Failed to link escrow to job" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, jobId: id, escrowId });
  } catch (error) {
    console.error(`[API] Link escrow to job ${id} error:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to link escrow to job: ${msg}` },
      { status: 500 }
    );
  }
}
