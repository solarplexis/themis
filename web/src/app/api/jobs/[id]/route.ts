import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { getJob, cancelJob } from "@/lib/jobs";
import { getArbitrator } from "@/lib/contract";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (error) {
    console.error(`[API] Get job ${id} error:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to get job: ${msg}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: {
    signerAddress: string; // This will be the address that signed the message
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

  const { signerAddress, signature } = body;

  if (!signerAddress || !signature) {
    return NextResponse.json(
      { error: "Missing required fields: signerAddress, signature" },
      { status: 400 }
    );
  }

  try {
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const message = `Themis: cancel job ${id}`;
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

    const cancelled = await cancelJob(id, job.posterAddress);
    if (!cancelled) {
      return NextResponse.json(
        { error: "Failed to cancel job" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error(`[API] Delete job ${id} error:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to cancel job: ${msg}` },
      { status: 500 }
    );
  }
}
