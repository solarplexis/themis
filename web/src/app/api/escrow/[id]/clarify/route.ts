import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { getEscrow, getArbitrator } from "@/lib/contract";
import { addQuestion, getUnansweredQuestions } from "@/lib/clarifications";

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

  let body: { question?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { question, signature } = body;
  if (!question || !signature) {
    return NextResponse.json(
      { error: "Missing required fields: question, signature" },
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

    // Verify signature — signer must be the seller (provider) or arbitrator
    const message = `Themis: clarify escrow #${escrowId}`;
    const sigHex = signature as `0x${string}`;

    let signer: string | null = null;

    const isSeller = await verifyMessage({
      address: escrow.seller,
      message,
      signature: sigHex,
    });

    if (isSeller) {
      signer = escrow.seller;
    } else {
      const arbitrator = await getArbitrator();
      const isArbitrator = await verifyMessage({
        address: arbitrator,
        message,
        signature: sigHex,
      });

      if (isArbitrator) {
        signer = arbitrator;
      }
    }

    if (!signer) {
      return NextResponse.json(
        { error: "Invalid signature — signer must be the provider (seller) or arbitrator" },
        { status: 403 }
      );
    }

    // Add the question
    const clarification = await addQuestion(escrowId, question, signer);

    return NextResponse.json({
      success: true,
      escrowId,
      clarification,
    });
  } catch (error) {
    console.error(`[API] Clarify error for escrow ${escrowId}:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Clarify failed: ${msg}` },
      { status: 500 }
    );
  }
}

export async function GET(
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

  try {
    const unanswered = await getUnansweredQuestions(escrowId);
    return NextResponse.json({
      escrowId,
      unanswered,
    });
  } catch (error) {
    console.error(`[API] Get clarifications error for escrow ${escrowId}:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to get clarifications: ${msg}` },
      { status: 500 }
    );
  }
}
