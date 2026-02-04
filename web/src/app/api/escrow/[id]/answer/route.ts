import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { getEscrow, getArbitrator } from "@/lib/contract";
import { addAnswer, getClarifications } from "@/lib/clarifications";

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

  let body: { questionId?: string; answer?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { questionId, answer, signature } = body;
  if (!questionId || !answer || !signature) {
    return NextResponse.json(
      { error: "Missing required fields: questionId, answer, signature" },
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

    // Verify signature — signer must be the buyer (submitter) or arbitrator
    const message = `Themis: answer escrow #${escrowId}`;
    const sigHex = signature as `0x${string}`;

    let signer: string | null = null;

    const isBuyer = await verifyMessage({
      address: escrow.buyer,
      message,
      signature: sigHex,
    });

    if (isBuyer) {
      signer = escrow.buyer;
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
        { error: "Invalid signature — signer must be the submitter (buyer) or arbitrator" },
        { status: 403 }
      );
    }

    // Add the answer
    const clarification = await addAnswer(escrowId, questionId, answer, signer);

    if (!clarification) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      escrowId,
      clarification,
    });
  } catch (error) {
    console.error(`[API] Answer error for escrow ${escrowId}:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Answer failed: ${msg}` },
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
    const data = await getClarifications(escrowId);
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[API] Get clarifications error for escrow ${escrowId}:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to get clarifications: ${msg}` },
      { status: 500 }
    );
  }
}
