import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { getEscrow, getArbitrator, release, refund } from "@/lib/contract";
import { isIPFSReference, fetchFromIPFS, parseContent } from "@/lib/ipfs";
import { verifyDeliverable } from "@/lib/verify";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const escrowId = Number(id);

  if (isNaN(escrowId) || escrowId < 1) {
    return NextResponse.json(
      { error: "Invalid escrow ID" },
      { status: 400 }
    );
  }

  let body: { deliverable?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { deliverable, signature } = body;
  if (!deliverable || !signature) {
    return NextResponse.json(
      { error: "Missing required fields: deliverable, signature" },
      { status: 400 }
    );
  }

  try {
    // 1. Read escrow from contract
    const escrow = await getEscrow(escrowId);

    if (escrow.status !== 1) {
      return NextResponse.json(
        { error: `Escrow is not funded (status: ${escrow.statusName})` },
        { status: 400 }
      );
    }

    // 2. Verify signature — signer must be the seller or the arbitrator
    const message = `Themis: deliver escrow #${escrowId}`;
    const sigHex = signature as `0x${string}`;

    const isSeller = await verifyMessage({
      address: escrow.seller,
      message,
      signature: sigHex,
    });

    if (!isSeller) {
      const arbitrator = await getArbitrator();
      const isArbitrator = await verifyMessage({
        address: arbitrator,
        message,
        signature: sigHex,
      });

      if (!isArbitrator) {
        return NextResponse.json(
          { error: "Invalid signature — signer is not the seller or arbitrator" },
          { status: 403 }
        );
      }
    }

    // 3. Fetch requirements from taskCID
    let requirements: object;
    if (isIPFSReference(escrow.taskCID)) {
      const raw = await fetchFromIPFS(escrow.taskCID);
      requirements = parseContent(raw);
    } else {
      requirements = parseContent(escrow.taskCID);
    }

    // 4. Parse deliverable
    let deliverableContent: object;
    if (isIPFSReference(deliverable)) {
      const raw = await fetchFromIPFS(deliverable);
      deliverableContent = parseContent(raw);
    } else {
      deliverableContent = parseContent(deliverable);
    }

    // 5. AI verification (includes any clarifications for this escrow)
    const verification = await verifyDeliverable(requirements, deliverableContent, escrowId);

    // 6. Submit on-chain tx based on result
    let txHash: string;
    if (verification.approved && verification.confidence >= 70) {
      txHash = await release(escrowId);
    } else {
      txHash = await refund(escrowId);
    }

    return NextResponse.json({
      approved: verification.approved && verification.confidence >= 70,
      confidence: verification.confidence,
      reason: verification.reason,
      txHash,
    });
  } catch (error) {
    console.error(`[API] Deliver error for escrow ${escrowId}:`, error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Deliver failed: ${message}` },
      { status: 500 }
    );
  }
}
