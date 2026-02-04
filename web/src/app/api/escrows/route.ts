import { NextRequest, NextResponse } from "next/server";
import { getEscrow, getEscrowCount } from "@/lib/contract";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const statusFilter = searchParams.get("status");
  const addressFilter = searchParams.get("address")?.toLowerCase();

  try {
    const count = await getEscrowCount();

    const escrows = [];
    for (let i = 1; i <= count; i++) {
      const escrow = await getEscrow(i);

      if (escrow.status === 0) continue;

      if (statusFilter !== null) {
        const s = Number(statusFilter);
        if (escrow.status !== s) continue;
      }

      if (addressFilter) {
        const matches =
          escrow.buyer.toLowerCase() === addressFilter ||
          escrow.seller.toLowerCase() === addressFilter;
        if (!matches) continue;
      }

      escrows.push({
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
    }

    return NextResponse.json({ escrows, total: escrows.length });
  } catch (error) {
    console.error("[API] Error listing escrows:", error);
    return NextResponse.json(
      { error: "Failed to list escrows" },
      { status: 500 }
    );
  }
}
