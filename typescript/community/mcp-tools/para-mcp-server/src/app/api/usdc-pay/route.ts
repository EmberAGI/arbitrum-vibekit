import { NextRequest, NextResponse } from "next/server";

/**
 * USDC Payment API with x402 Protocol
 *
 * Simple implementation that works directly with PayAI facilitator
 * for gasless USDC transfers on Base Sepolia
 */

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6;
const PAYAI_FACILITATOR_ADDRESS = "0xc6699d2aada6c36dfea5c248dd70f9cb0235cb63";

// Use our own facilitator proxy that includes proper EIP-712 details
const getLocalFacilitatorUrl = (request: NextRequest) => {
  // Get the host from the request to build the facilitator URL
  const host = request.headers.get("host") || "localhost:3012";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/facilitator`;
};

// Helper function to add CORS headers
function getCorsHeaders(origin: string | null) {
  const allowedOrigins = ["http://localhost:3012", "http://localhost:3000"];

  // Allow any localhost origin for development
  const isAllowedOrigin =
    origin &&
    (allowedOrigins.includes(origin) ||
      /^http:\/\/localhost:\d+$/.test(origin));

  const corsOrigin = isAllowedOrigin ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Payment, x-payment, X-Requested-With, Accept, Origin",
    "Access-Control-Expose-Headers":
      "X-Facilitator-Url, X-Payment-Response, Content-Type",
    "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
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
  // Get CORS headers first, before any potential errors
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Get the facilitator URL for this request
  const localFacilitatorUrl = getLocalFacilitatorUrl(request);

  try {
    // Get payment data from X-PAYMENT header
    const paymentData = request.headers.get("x-payment");

    // Parse request body
    const body = await request.json();
    const { to, amount } = body;

    console.log("[USDC Pay] Request received:", { to, amount, hasPayment: !!paymentData });

    // Validate required parameters
    if (!to || !amount) {
      return NextResponse.json(
        { error: "Missing required parameters: to, amount" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Validate 'to' address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      return NextResponse.json(
        { error: "Invalid recipient address format" },
        { status: 400, headers: corsHeaders },
      );
    }

    // For Base Sepolia only
    const networkName = "base-sepolia";
    const chainId = 84532;
    const usdcAddress = USDC_BASE_SEPOLIA;

    // Convert amount to atomic units
    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { error: "Invalid amount. Must be a positive number." },
        { status: 400, headers: corsHeaders },
      );
    }

    const atomicAmount = Math.floor(
      amountFloat * Math.pow(10, USDC_DECIMALS),
    ).toString();

    // Get resource URL
    const resourceUrl = new URL(
      request.url || "/api/usdc-pay",
      `http://${request.headers.get("host") || "localhost:3012"}`,
    ).toString();

    // Construct payment requirements per x402 spec
    // x402 client reads extra.name and extra.version for EIP-712 domain
    const amountUSD = (amountFloat * 0.01).toFixed(2); // Approximate USD conversion
    const paymentRequirements = {
      scheme: "exact" as const,
      network: networkName,
      maxAmountRequired: atomicAmount,
      resource: resourceUrl,
      description: "USDC Payment",
      mimeType: "application/json",
      payTo: to,
      maxTimeoutSeconds: 300,
      asset: usdcAddress,
      outputSchema: {
        input: {
          type: "http",
          method: "POST",
          discoverable: true,
        },
      },
      extra: {
        name: "USDC", // Required for EIP-712 domain.name
        version: "2", // Required for EIP-712 domain.version
        title: `USDC Transfer: ${amountFloat} USDC`,
        category: "Payment",
        tags: ["Payment", "USDC", "Transfer"],
        serviceName: "USDC Gasless Transfer",
        serviceDescription: `Transfer ${amountFloat} USDC to ${to}`,
        gasLimit: "1000000",
        pricing: {
          currency: "USD",
          amount: amountUSD,
          display: `$${amountUSD}`,
        },
      },
    };

    console.log("[USDC Pay] Payment requirements:", JSON.stringify(paymentRequirements, null, 2));

    // If no payment data, return 402 Payment Required
    if (!paymentData) {
      const headers = new Headers();

      // Set CORS headers
      headers.set(
        "Access-Control-Allow-Origin",
        corsHeaders["Access-Control-Allow-Origin"],
      );
      headers.set(
        "Access-Control-Allow-Methods",
        corsHeaders["Access-Control-Allow-Methods"],
      );
      headers.set(
        "Access-Control-Allow-Headers",
        corsHeaders["Access-Control-Allow-Headers"],
      );
      headers.set(
        "Access-Control-Expose-Headers",
        corsHeaders["Access-Control-Expose-Headers"],
      );
      headers.set(
        "Access-Control-Max-Age",
        corsHeaders["Access-Control-Max-Age"],
      );

      // Set content type
      headers.set("Content-Type", "application/json");

      // Set x402 specific header
      headers.set("X-Facilitator-Url", localFacilitatorUrl);

      return NextResponse.json(
        {
          x402Version: 1,
          error: "payment_required",
          errorMessage: "Payment required to process USDC transfer",
          accepts: [paymentRequirements],
        },
        { status: 402, headers },
      );
    }

    // Decode payment data
    const decodedPayment = JSON.parse(
      Buffer.from(paymentData, "base64").toString("utf-8"),
    );

    // Verify payment with PayAI
    const verifyPayload = {
      x402Version: 1,
      paymentPayload: decodedPayment,
      paymentRequirements: paymentRequirements,
    };

    // Use our local facilitator proxy which forwards to PayAI
    const verifyResponse = await fetch(`${localFacilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyPayload),
    });

    const verifyResult = await verifyResponse.json();
    console.log("[USDC Pay] Verify result:", JSON.stringify(verifyResult, null, 2));

    if (!verifyResult.isValid) {
      console.log("[USDC Pay] Verification failed:", verifyResult);
      return NextResponse.json(
        {
          x402Version: 1,
          error: verifyResult.invalidReason || "payment_verification_failed",
          errorMessage:
            verifyResult.errorMessage || "Payment verification failed",
          accepts: [paymentRequirements],
        },
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Settle payment via our facilitator proxy
    const settleResponse = await fetch(`${localFacilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: decodedPayment,
        paymentRequirements: paymentRequirements,
      }),
    });

    const settleResult = await settleResponse.json();
    console.log("[USDC Pay] Settle result:", JSON.stringify(settleResult, null, 2));

    if (!settleResult.success) {
      console.log("[USDC Pay] Settlement failed:", settleResult);
      return NextResponse.json(
        {
          error: "Payment settlement failed",
          errorReason: settleResult.errorReason,
          details:
            settleResult.errorMessage ||
            settleResult.errorReason ||
            "Unknown error",
        },
        { status: 500, headers: corsHeaders },
      );
    }

    // Return success with explicit headers
    const headers = new Headers();

    // Set CORS headers
    headers.set(
      "Access-Control-Allow-Origin",
      corsHeaders["Access-Control-Allow-Origin"],
    );
    headers.set(
      "Access-Control-Allow-Methods",
      corsHeaders["Access-Control-Allow-Methods"],
    );
    headers.set(
      "Access-Control-Allow-Headers",
      corsHeaders["Access-Control-Allow-Headers"],
    );
    headers.set(
      "Access-Control-Expose-Headers",
      corsHeaders["Access-Control-Expose-Headers"],
    );
    headers.set(
      "Access-Control-Max-Age",
      corsHeaders["Access-Control-Max-Age"],
    );

    // Set content type
    headers.set("Content-Type", "application/json");

    // Set x402 payment response header
    headers.set(
      "X-Payment-Response",
      Buffer.from(
        JSON.stringify({
          success: true,
          transaction: settleResult.transaction,
          network: networkName,
          payer: verifyResult.payer,
        }),
      ).toString("base64"),
    );

    return NextResponse.json(
      {
        success: true,
        message: "Payment processed successfully",
        transaction: settleResult.transaction,
        network: networkName,
      },
      { status: 200, headers },
    );
  } catch (error) {
    console.error("Error processing payment:", error);
    return NextResponse.json(
      {
        error: "Failed to process payment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}
