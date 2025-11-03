import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    // Accept flexible payloads. We don't rely on recoverySecret here.
    // Clients may send { pregenId } (preferred) or { walletId } or nothing.
    let pregenId: string | undefined;
    let walletId: string | undefined;
    try {
      const body = await request.json();
      pregenId = body?.pregenId;
      walletId = body?.walletId;
    } catch {
      // no JSON body provided; proceed with generic revalidation
    }

    // If we have a pregenId, mark the wallet as claimed in the database
    if (pregenId) {
      await db
        .update(pregenWallets)
        .set({ claimedAt: sql`now()` })
        .where(
          and(eq(pregenWallets.id, pregenId), isNull(pregenWallets.claimedAt)),
        );
    } else if (walletId) {
      // If we only have walletId, update by walletId
      await db
        .update(pregenWallets)
        .set({ claimedAt: sql`now()` })
        .where(
          and(
            eq(pregenWallets.walletId, walletId),
            isNull(pregenWallets.claimedAt),
          ),
        );
    }

    // Invalidate cached wallet details so subsequent loads refresh
    revalidateTag("pregen-wallet", "max");
    if (pregenId) revalidateTag(`pregen-wallet:${pregenId}`, "max");
    // Optionally, if you tag by walletId elsewhere, revalidate here too
    if (walletId) revalidateTag(`pregen-wallet:wallet:${walletId}`, "max");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error claiming wallet:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to claim wallet",
      },
      { status: 500 },
    );
  }
}
