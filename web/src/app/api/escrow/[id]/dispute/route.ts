import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { getEscrow, getArbitrator } from "@/lib/contract";

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

  let body: { reason?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { reason, signature } = body;
  if (!reason || !signature) {
    return NextResponse.json(
      { error: "Missing required fields: reason, signature" },
      { status: 400 }
    );
  }

  try {
    const escrow = await getEscrow(escrowId);

    if (escrow.status !== 1) {
      return NextResponse.json(
        { error: `Escrow is not funded (status: ${escrow.statusName})` },
        { status: 400 }
      );
    }

    // Verify signature — signer must be buyer or seller
    const message = `Themis: dispute escrow #${escrowId}`;
    const sigHex = signature as `0x${string}`;

    const isBuyer = await verifyMessage({
      address: escrow.buyer,
      message,
      signature: sigHex,
    });

    const isSeller = await verifyMessage({
      address: escrow.seller,
      message,
      signature: sigHex,
    });

    if (!isBuyer && !isSeller) {
      const arbitrator = await getArbitrator();
      const isArbitrator = await verifyMessage({
        address: arbitrator,
        message,
        signature: sigHex,
      });

      if (!isArbitrator) {
        return NextResponse.json(
          { error: "Invalid signature — signer is not a party to this escrow" },
          { status: 403 }
        );
      }
    }

    // For now: acknowledge the dispute (full resolution is Phase 4)
    return NextResponse.json({
      success: true,
      escrowId,
      reason,
    });
  } catch (error) {
    console.error(`[API] Dispute error for escrow ${escrowId}:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Dispute failed: ${msg}` },
      { status: 500 }
    );
  }
}
