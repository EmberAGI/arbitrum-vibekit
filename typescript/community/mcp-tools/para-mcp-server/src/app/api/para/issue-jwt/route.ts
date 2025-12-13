import jwt, { type JwtPayload } from "jsonwebtoken";
import { NextResponse } from "next/server";
import { getParaServerClient } from "@/lib/para-server-client";

const rawAppJwtSecret = process.env.APP_JWT_SECRET;
if (!rawAppJwtSecret) {
  throw new Error("APP_JWT_SECRET environment variable is not set");
}
const APP_JWT_SECRET = rawAppJwtSecret as string;

export async function POST(request: Request) {
  try {
    let session: string | undefined;

    try {
      const body = await request.json();
      session = body?.session;
    } catch {
      // no/invalid JSON body
    }

    if (!session || typeof session !== "string") {
      return NextResponse.json({ error: "Missing session" }, { status: 400 });
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

    let paraToken: string;
    try {
      const result = await para.issueJwt();
      paraToken = result.token;
    } catch (error) {
      console.error("Failed to issue Para JWT:", error);
      return NextResponse.json(
        { error: "Failed to issue Para JWT" },
        { status: 500 },
      );
    }

    const decoded = jwt.decode(paraToken) as
      | (JwtPayload & {
          data?: { email?: string };
        })
      | null
      | string;

    const email =
      decoded && typeof decoded !== "string"
        ? decoded.data?.email
        : undefined;

    if (!email) {
      return NextResponse.json(
        { error: "Unable to determine authenticated email" },
        { status: 401 },
      );
    }

    const appToken = jwt.sign(
      {
        email,
      },
      APP_JWT_SECRET,
      { expiresIn: "1h" },
    );

    return NextResponse.json({ token: appToken, email });
  } catch (error) {
    console.error("Error exchanging Para session for JWT:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}
