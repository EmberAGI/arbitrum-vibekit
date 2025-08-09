import { z } from 'zod';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PaymentRequirementsSchema, ChainIdToNetwork, evm } from 'x402/types';
import { CallToolResultSchema, type CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Account } from 'viem';
import { createPaymentHeader, selectPaymentRequirements } from 'x402/client';

/**
 * The response from the X402 payment when there is an error
 */
const XError = z.object({
  wrappedResponse: z.discriminatedUnion('_x402_type', [
    z.object({
      _x402_type: z.literal('x402_error'),
      x402Version: z.number(),
      error: z.string().optional(),
      accepts: z.array(PaymentRequirementsSchema),
      payer: z.string().optional(),
    }),
    z.object({
      _x402_type: z.literal('success'),
      result: z.unknown(),
    }),
  ]),
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
  if (!callToolResult.success || callToolResult.data.structuredContent === undefined) {
    return result;
  }

  const xError = await XError.safeParseAsync(callToolResult.data.structuredContent);

  // The result wasn't an X402 error, return the original result
  if (!xError.success) {
    return result;
  }

  console.log('Tools is protected by X402 payment, attempting to pay...');
  if (xError.data.wrappedResponse._x402_type === 'success') {
    return {
      ...result,
      structuredContent: xError.data.wrappedResponse.result,
    };
  }

  const { x402Version, accepts } = xError.data.wrappedResponse;

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
    arguments: {
      ...params.arguments,
      XPayment: paymentHeader,
    },
  };
  const secondResponse = await client.callTool(paramsWithXPayment);
  const secondToolResult = await CallToolResultSchema.safeParseAsync(secondResponse);

  // Second response wasn't an X402 response, return the original result
  if (!secondToolResult.success || secondToolResult.data.structuredContent === undefined) {
    return secondResponse;
  }

  const xSecondResponse = await XError.safeParseAsync(secondToolResult.data.structuredContent);

  // Second response wasn't an X402 error, return the original result
  if (!xSecondResponse.success) {
    return secondResponse;
  }

  // If the second response is still an error, payment was not successful or tool failed
  if (xSecondResponse.data.wrappedResponse._x402_type === 'x402_error') {
    // Payment failed, return the error response
    console.log(
      'Second response is an X402 error, returning original result:',
      xSecondResponse.error
    );
    return secondResponse;
  }

  return {
    ...secondResponse,
    structuredContent: xSecondResponse.data.wrappedResponse.result,
  };
}

export { decodeXPaymentResponse } from 'x402/shared';
