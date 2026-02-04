import { NextRequest, NextResponse } from "next/server";
import { getEscrow } from "@/lib/contract";

export async function GET(
  _request: NextRequest,
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
    const escrow = await getEscrow(escrowId);

    if (escrow.status === 0) {
      return NextResponse.json(
        { error: "Escrow not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: escrow.id,
      buyer: escrow.buyer,
      seller: escrow.seller,
      token: escrow.token,
      amount: escrow.amount,
      taskCID: escrow.taskCID,
      deadline: escrow.deadline,
      status: escrow.status,
      statusName: escrow.statusName,
    });
  } catch (error) {
    console.error(`[API] Error fetching escrow ${escrowId}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch escrow" },
      { status: 500 }
    );
  }
}
