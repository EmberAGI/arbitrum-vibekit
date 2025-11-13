import { and, eq, isNull, sql } from "drizzle-orm";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { getParaServerClient } from "@/lib/para-server-client";

export async function POST(request: Request) {
  try {
    // Accept flexible payloads
    // For DB updates, clients must also send { session } exported from Para client.
    let pregenId: string | undefined;
    let walletId: string | undefined;
    let session: string | undefined;
    try {
      const body = await request.json();
      pregenId = body?.pregenId;
      walletId = body?.walletId;
      session = body?.session;
    } catch {
      // no JSON body provided; proceed with generic revalidation
    }

    const shouldModify = !!pregenId || !!walletId;

    if (shouldModify) {
      if (!session || typeof session !== "string") {
        return NextResponse.json({ error: "Missing session" }, { status: 401 });
      }

      const para = getParaServerClient();

      try {
        await para.importSession(session);
      } catch {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }

      const isActive = await para.isSessionActive();
      if (!isActive) {
        return NextResponse.json({ error: "Session expired" }, { status: 401 });
      }

      let authedEmail: string | undefined;
      try {
        const { token } = await para.issueJwt();
        const decoded = jwt.decode(token) as
          | (JwtPayload & {
              data?: { email?: string };
            })
          | null
          | string;
        authedEmail =
          decoded && typeof decoded !== "string"
            ? decoded.data?.email
            : undefined;
      } catch {
        // fallthrough
      }

      if (!authedEmail) {
        return NextResponse.json(
          { error: "Unable to determine authenticated email" },
          { status: 401 },
        );
      }

      const walletRecord = await db.query.pregenWallets.findFirst({
        where: pregenId
          ? eq(pregenWallets.id, pregenId)
          : eq(pregenWallets.walletId, walletId as string),
      });

      if (!walletRecord) {
        return NextResponse.json(
          { error: "Wallet not found" },
          { status: 404 },
        );
      }

      if (walletRecord.email.toLowerCase() !== authedEmail.toLowerCase()) {
        return NextResponse.json(
          { error: "Unauthorized: Email does not match wallet" },
          { status: 403 },
        );
      }

      if (pregenId) {
        await db
          .update(pregenWallets)
          .set({ claimedAt: sql`now()` })
          .where(
            and(
              eq(pregenWallets.id, pregenId),
              isNull(pregenWallets.claimedAt),
            ),
          );
      } else if (walletId) {
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
    }

    revalidateTag("pregen-wallet", "max");
    if (pregenId) revalidateTag(`pregen-wallet:${pregenId}`, "max");
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
