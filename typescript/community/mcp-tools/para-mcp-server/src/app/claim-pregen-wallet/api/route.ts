import { and, eq, isNull, sql } from "drizzle-orm";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";

const rawAppJwtSecret = process.env.APP_JWT_SECRET;
if (!rawAppJwtSecret) {
  throw new Error("APP_JWT_SECRET environment variable is not set");
}
const APP_JWT_SECRET = rawAppJwtSecret as string;

export async function POST(request: Request) {
  try {
    // Accept flexible payloads
    let pregenId: string | undefined;
    let walletId: string | undefined;
    try {
      const body = await request.json();
      pregenId = body?.pregenId;
      walletId = body?.walletId;
    } catch {
      // no JSON body provided; proceed with generic revalidation
    }

    const shouldModify = !!pregenId || !!walletId;

    if (shouldModify) {
      const authHeader = request.headers.get("authorization");
      const bearerPrefix = "Bearer ";
      if (!authHeader || !authHeader.startsWith(bearerPrefix)) {
        return NextResponse.json(
          { error: "Missing or invalid authorization token" },
          { status: 401 },
        );
      }

      const token = authHeader.slice(bearerPrefix.length).trim();

      let authedEmail: string | undefined;
      try {
        const payload = jwt.verify(token, APP_JWT_SECRET) as JwtPayload & {
          email?: string;
        };
        authedEmail = payload.email;
      } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
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
