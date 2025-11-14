import { eq } from "drizzle-orm";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";

const APP_JWT_SECRET = process.env.APP_JWT_SECRET as string;
if (!APP_JWT_SECRET) {
  throw new Error("APP_JWT_SECRET environment variable is not set");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    const [row] = await db
      .select({
        id: pregenWallets.id,
        email: pregenWallets.email,
        walletAddress: pregenWallets.walletAddress,
        walletId: pregenWallets.walletId,
        walletType: pregenWallets.walletType,
        userShare: pregenWallets.userShare,
        createdAt: pregenWallets.createdAt,
        claimedAt: pregenWallets.claimedAt,
      })
      .from(pregenWallets)
      .where(eq(pregenWallets.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (row.email.toLowerCase() !== authedEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "Unauthorized: Email does not match wallet" },
        { status: 403 },
      );
    }

    return NextResponse.json({
      id: row.id,
      email: row.email,
      address: row.walletAddress,
      walletId: row.walletId,
      type: row.walletType,
      createdAt: row.createdAt?.toISOString(),
      claimed: !!row.claimedAt,
      userShare: row.userShare,
    });
  } catch (error) {
    console.error("Error fetching pregen wallet:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}
