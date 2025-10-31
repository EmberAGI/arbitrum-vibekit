import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

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

    // Invalidate cached wallet details so subsequent loads refresh
    revalidateTag("pregen-wallet");
    if (pregenId) revalidateTag(`pregen-wallet:${pregenId}`);
    // Optionally, if you tag by walletId elsewhere, revalidate here too
    if (walletId) revalidateTag(`pregen-wallet:wallet:${walletId}`);

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
