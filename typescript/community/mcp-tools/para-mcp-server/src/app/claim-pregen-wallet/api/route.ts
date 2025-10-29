import { NextResponse } from "next/server";
import { getParaClient } from "@/lib/para-client";

export async function POST(request: Request) {
  try {
    const { userShare } = await request.json();

    if (!userShare) {
      return NextResponse.json(
        { error: "User share is required" },
        { status: 400 },
      );
    }

    // Initialize Para client
    const para = getParaClient();

    // Check if user is fully authenticated
    const isAuthenticated = await para.isFullyLoggedIn();

    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "User must be fully authenticated with Para" },
        { status: 401 },
      );
    }

    // Load the user share into Para client
    await para.setUserShare(userShare);

    // Claim the pregenerated wallet
    const recoverySecret = await para.claimPregenWallets();

    return NextResponse.json({
      success: true,
      recoverySecret,
      message: "Wallet claimed successfully",
    });
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
