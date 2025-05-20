import { z } from "zod";

// Shared schema for a single transaction plan (raw from MCP) with chainId
export const TransactionPlanSchema = z
  .object({
    to: z.string().describe("Destination contract address"),
    data: z.string().describe("Encoded transaction data payload"),
    value: z
      .string()
      .describe("Amount of native token to send (in atomic units)"),
    chainId: z
      .string()
      .describe("Chain ID where the transaction will be executed"),
  })
  .passthrough();

export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

/**
 * Validates an array of transaction plans using the shared TransactionPlanSchema.
 * @param rawTransactions - The raw transactions array to validate.
 * @returns An array of validated TransactionPlan objects.
 * @throws Error if validation fails.
 */
export function validateTransactionPlans(
  rawTransactions: unknown
): TransactionPlan[] {
  const result = z.array(TransactionPlanSchema).safeParse(rawTransactions);
  if (!result.success) {
    throw new Error(`Invalid transaction plan: ${result.error.message}`);
  }
  return result.data;
}
