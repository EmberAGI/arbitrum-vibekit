import { z } from 'zod';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PaymentRequirementsSchema, VerifyResponseSchema, ChainIdToNetwork, evm } from 'x402/types';
import { CallToolResultSchema, type CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Account } from 'viem';
import { createPaymentHeader, selectPaymentRequirements } from 'x402/client';

/**
 * The response from the X402 payment when there is an error
 */
const XError = z.object({
  x402Version: z.number(),
  error: z.string().optional(),
  accepts: z.array(PaymentRequirementsSchema),
  payer: VerifyResponseSchema.shape.payer.optional(),
});

export type X402PaymentResponse = z.infer<typeof XError>;

/**
 * Calls a tool using the provided client and parameters, handling payment requirements if necessary.
 *
 * This function attempts to call the tool with the given parameters. If the initial call fails due to
 * payment requirements, it parses the error, selects the appropriate payment requirements based on the
 * wallet's chain/network, and constructs a payment header. It then retries the call with the payment
 * information included.
 *
 * @param client - The client instance used to call the tool.
 * @param params - The parameters for the tool call, matching the expected request shape.
 * @param walletClient - The wallet client or account used for signing and payment, must be compatible with EVM.
 * @param maxValue - The maximum allowed payment amount (in smallest denomination, e.g., wei or cents). Defaults to 0.10 USDC.
 * @returns The result of the tool call, either from the initial attempt or after handling payment requirements.
 * @throws If the required payment amount exceeds the specified `maxValue`.
 */
export async function callXTool(
  client: Client,
  params: CallToolRequest['params'],
  walletClient: typeof evm.SignerWallet | Account,
  maxValue: bigint = BigInt(0.1 * 10 ** 6) // Default to 0.10 USDC
) {
  const result = await client.callTool(params);
  if (!result.isError) {
    return result;
  }

  const callToolResult = await CallToolResultSchema.safeParseAsync(result);
  if (
    !callToolResult.success ||
    callToolResult.data.content.length === 0 ||
    callToolResult.data.content[0]?.type !== 'text'
  ) {
    return result;
  }

  const xError = await XError.safeParseAsync(callToolResult.data.content[0].text);
  if (!xError.success) {
    return result;
  }
  console.log('Tools is protected by X402 payment, attempting to pay...');
  const { x402Version, accepts } = xError.data;

  console.log('Payment requirements:', accepts);
  const parsedPaymentRequirements = accepts.map(x => PaymentRequirementsSchema.parse(x));

  const chainId = evm.isSignerWallet(walletClient) ? walletClient.chain?.id : undefined;
  const selectedPaymentRequirements = selectPaymentRequirements(
    parsedPaymentRequirements,
    chainId ? ChainIdToNetwork[chainId] : undefined,
    'exact'
  );

  if (BigInt(selectedPaymentRequirements.maxAmountRequired) > maxValue) {
    console.log(
      'Payment amount exceeds maximum allowed:',
      selectedPaymentRequirements.maxAmountRequired,
      'maxValue:',
      maxValue
    );
    throw new Error('Payment amount exceeds maximum allowed');
  }

  const paymentHeader = await createPaymentHeader(
    walletClient,
    x402Version,
    selectedPaymentRequirements
  );

  const paramsWithXPayment = {
    ...params,
    XPayment: paymentHeader,
  };
  console.log('Creating payment header:', paymentHeader, ', attempting to call tool again...');
  const secondResponse = await client.callTool(paramsWithXPayment);
  return secondResponse;
}

export { decodeXPaymentResponse } from 'x402/shared';
