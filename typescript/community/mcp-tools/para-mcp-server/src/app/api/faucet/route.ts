import { CdpClient } from "@coinbase/cdp-sdk";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { address, network, token } = await request.json();

    if (!address || !network || !token) {
      return NextResponse.json(
        { error: "Missing required fields: address, network, token" },
        { status: 400 },
      );
    }

    // Check CDP API credentials
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      return NextResponse.json(
        {
          error:
            "CDP API credentials not configured. Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET in your .env file",
        },
        { status: 500 },
      );
    }

    // Initialize CDP client with credentials
    const cdp = new CdpClient({
      apiKeyId,
      apiKeySecret,
    });

    // Request faucet funds using CDP SDK
    const faucetResponse = await cdp.evm.requestFaucet({
      address,
      network,
      token,
    });

    return NextResponse.json({
      transactionHash: faucetResponse.transactionHash,
    });
  } catch (error) {
    console.error("Faucet request error:", error);
    return NextResponse.json(
      {
        error: "Faucet request failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
