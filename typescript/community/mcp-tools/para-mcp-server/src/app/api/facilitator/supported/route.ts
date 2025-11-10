import { NextRequest, NextResponse } from "next/server";

/**
 * Facilitator Proxy - /supported endpoint
 *
 * This endpoint returns proper EIP-712 asset details for Base Sepolia USDC
 * that x402-axios needs to create correct signatures
 */

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6;

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

export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get("origin"));
  const { searchParams } = new URL(request.url);
  const chainId = searchParams.get("chainId");

  // For Base Sepolia only
  const network = "base-sepolia";
  const usdcAddress = USDC_BASE_SEPOLIA;
  const chainIdNum = 84532;

  // Return proper supported response with full EIP-712 details
  const response = {
    kinds: [
      {
        x402Version: 1,
        scheme: "exact",
        network: network,
        extra: {
          defaultAsset: {
            address: usdcAddress,
            decimals: USDC_DECIMALS,
            eip712: {
              name: "USD Coin",
              version: "2",
              chainId: chainIdNum,
              verifyingContract: usdcAddress,
              primaryType: "TransferWithAuthorization",
            },
          },
          supportedAssets: [
            {
              address: usdcAddress,
              decimals: USDC_DECIMALS,
              eip712: {
                name: "USD Coin",
                version: "2",
                chainId: chainIdNum,
                verifyingContract: usdcAddress,
                primaryType: "TransferWithAuthorization",
              },
            },
          ],
        },
      },
    ],
  };

  return NextResponse.json(response, { headers: corsHeaders });
}
