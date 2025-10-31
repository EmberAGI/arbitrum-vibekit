import { NextResponse } from "next/server";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    const [row] = await db
      .select({
        id: pregenWallets.id,
        email: pregenWallets.email,
        walletAddress: pregenWallets.walletAddress,
        walletId: pregenWallets.walletId,
        walletType: pregenWallets.walletType,
        createdAt: pregenWallets.createdAt,
        claimedAt: pregenWallets.claimedAt,
      })
      .from(pregenWallets)
      .where(eq(pregenWallets.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      email: row.email,
      address: row.walletAddress,
      walletId: row.walletId,
      type: row.walletType,
      createdAt: row.createdAt?.toISOString(),
      claimed: !!row.claimedAt,
    });
  } catch (error) {
    console.error("Error fetching pregen wallet:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}
