import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Missing email" },
        { status: 400 },
      );
    }

    const walletRecord = await db.query.pregenWallets.findFirst({
      where: and(eq(pregenWallets.email, email), isNull(pregenWallets.claimedAt)),
    });

    if (!walletRecord) {
      return NextResponse.json(
        { error: "Pregenerated wallet not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: walletRecord.id,
      email: walletRecord.email,
      walletId: walletRecord.walletId,
    });
  } catch (error) {
    console.error("Error resolving pregen wallet by email:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to resolve wallet by email",
      },
      { status: 500 },
    );
  }
}
