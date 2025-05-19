import { config } from "dotenv";
import { exact } from "x402/schemes";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  Price,
  Resource,
  VerifyResponse,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { processPriceToAtomicAmount } from "x402/shared";
import z, { type ZodRawShape } from "zod";
import type {
  McpServer,
  RegisteredTool,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";

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
 * The response from the X402 payment when there is an error
 */
export interface X402PaymentResponse {
  x402Version: number;
  error?: string;
  payer?: VerifyResponse["payer"];
  accepts: PaymentRequirements[];
}

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
  if (
    !payment ||
    paymentRequirements.length === 0 ||
    typeof payment !== "string"
  ) {
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

/**
 * @param shape The Zod schema for the tool's input
 * @returns The modified shape with the XPayment key added
 */
export function addX402Key(shape: ZodRawShape): ZodRawShape {
  return {
    ...shape,
    XPayment: z.string().optional(),
  };
}

export function xServerTool<Args extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  price: string,
  network: Network,
  shape: Args,
  cb: ToolCallback<Args>,
): RegisteredTool {
  const xShape = addX402Key(shape);
  const requirement = createExactPaymentRequirements(
    price,
    network,
    `x402://tool/${name}`,
  );
  return server.tool(name, description, xShape, async (params, extra) => {
    const xpayment = params.XPayment as string | undefined;

    const errorValidatingPayment = await verifyPayment(xpayment, [requirement]);
    if (errorValidatingPayment) {
      return {
        content: [
          { type: "text", text: JSON.stringify(errorValidatingPayment) },
        ],
      };
    }
    await settle(exact.evm.decodePayment(xpayment!), requirement);
    const toolResult = await cb(params, extra);
    return toolResult;
  });
}
