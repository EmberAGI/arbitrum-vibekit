import { config } from "dotenv";
import { exact } from "x402/schemes";
import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  Price,
  Resource,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { processPriceToAtomicAmount } from "x402/shared";
import z, { ZodRawShape, ZodTypeAny } from "zod";
import { X402PaymentResponse } from "./client";
import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";

config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}`;

if (!facilitatorUrl || !payTo) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const { verify, settle } = useFacilitator({ url: facilitatorUrl });
const x402Version = 1;

/**
 * Creates payment requirements for a given price and network
 *
 * @param price - The price to be paid for the resource
 * @param network - The blockchain network to use for payment
 * @param resource - The resource being accessed
 * @param description - Optional description of the payment
 * @returns An array of payment requirements
 */
function createExactPaymentRequirements(
  price: Price,
  network: Network,
  resource: Resource,
  description = "",
): PaymentRequirements {
  const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
  if ("error" in atomicAmountForAsset) {
    throw new Error(atomicAmountForAsset.error);
  }
  const { maxAmountRequired, asset } = atomicAmountForAsset;

  return {
    scheme: "exact",
    network,
    maxAmountRequired,
    resource,
    description,
    mimeType: "",
    payTo: payTo,
    maxTimeoutSeconds: 60,
    asset: asset.address,
    outputSchema: undefined,
    extra: {
      name: asset.eip712.name,
      version: asset.eip712.version,
    },
  };
}

/**
 * Verifies a payment and handles the response
 *
 * @param payment - The payment details for x402.
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A promise that resolves to true if payment is valid, false otherwise
 */
async function verifyPayment(
  payment: string | undefined,
  paymentRequirements: PaymentRequirements[],
): Promise<X402PaymentResponse | undefined> {
  if (!payment || paymentRequirements.length === 0) {
    return {
      x402Version,
      error: "X-PAYMENT header is required",
      accepts: paymentRequirements,
    };
  }

  let decodedPayment: PaymentPayload;
  try {
    decodedPayment = exact.evm.decodePayment(payment);
    decodedPayment.x402Version = x402Version;
  } catch (error) {
    return {
      x402Version,
      error:
        (error as string | undefined) || "Invalid or malformed payment header",
      accepts: paymentRequirements,
    };
  }

  try {
    // Null coerce paymentRequirements[0] because we know it exists
    const response = await verify(decodedPayment, paymentRequirements[0]!);
    if (!response.isValid) {
      return {
        x402Version,
        error: response.invalidReason,
        accepts: paymentRequirements,
        payer: response.payer,
      };
    }
  } catch (error) {
    return {
      x402Version,
      error: error as string,
      accepts: paymentRequirements,
    };
  }
}

type XPaymentKey = {
  XPayment: z.ZodOptional<z.ZodString>;
};

/**
 * @param shape The Zod schema for the tool's input
 * @returns The modified shape with the XPayment key added
 */
export function addX402Key<Shape extends ZodRawShape>(
  shape: Shape,
): Shape & XPaymentKey {
  return {
    ...shape,
    XPayment: z.string().optional(),
  };
}

/**
 * This adds a new tool to the MCP with X402 middleware running before the tool.
 * @param name The name of the tool
 * @param description The description of the tool
 * @param schema The Zod schema for the tool's input
 * @param tool The function that implements the tool
 * @param price The price for using the tool
 * @param network The network to use for payment
 */
export function getX402PayedTool<Shape extends ZodRawShape>(
  tool: ToolCallback<Shape & XPaymentKey>,
  price: string,
  network: Network,
): ToolCallback<Shape & XPaymentKey> {
  const requirement = createExactPaymentRequirements(
    price,
    network,
    "x402://tool/",
  );
  // @ts-ignore
  return async (params, extra) => {
    if (!("XPayment" in params)) {
      throw new Error("XPayment is required. Use the addX402Key function");
    }
    const xpayment = params.XPayment as string | undefined;

    const errorValidatingPayment = await verifyPayment(xpayment, [requirement]);
    if (errorValidatingPayment) {
      return errorValidatingPayment;
    }
    await settle(exact.evm.decodePayment(xpayment!), requirement);
    const toolResult = await tool(params, extra);
    return toolResult;
  };
}
