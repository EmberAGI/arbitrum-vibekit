import { NextRequest, NextResponse } from "next/server";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

/**
 * Facilitator Proxy - /verify endpoint
 *
 * Forwards verify requests to Coinbase CDP facilitator
 * Uses CDP SDK for authentication
 */

// Helper to generate CDP Bearer token using CDP SDK
async function generateCDPBearerToken(): Promise<string> {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    throw new Error("CDP API keys not configured");
  }

  // Use CDP SDK to generate JWT
  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "POST",
    requestHost: "api.cdp.coinbase.com",
    requestPath: "/platform/v2/x402/verify",
    expiresIn: 120, // 2 minutes
  });

  return jwt;
}

// Helper function to add CORS headers
function getCorsHeaders(origin: string | null) {
  const allowedOrigins = ["http://localhost:3012", "http://localhost:3000"];

  const corsOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// Handle OPTIONS preflight request
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: getCorsHeaders(request.headers.get("origin")),
    },
  );
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get("origin"));
  const body = await request.json();

  console.log("[Facilitator Verify] Request payload:", JSON.stringify(body, null, 2));

  try {
    // Generate CDP Bearer token
    const bearerToken = await generateCDPBearerToken();

    const response = await fetch("https://api.cdp.coinbase.com/platform/v2/x402/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    
    console.log("[Facilitator Verify] Response status:", response.status);
    console.log("[Facilitator Verify] Response body:", JSON.stringify(result, null, 2));

    return NextResponse.json(result, {
      status: response.status,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("[Facilitator Verify] Error:", error);
    return NextResponse.json(
      { error: "Failed to verify payment", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
