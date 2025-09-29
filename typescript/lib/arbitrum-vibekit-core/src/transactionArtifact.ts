import {
  TransactionPlanSchema,
  type TransactionPlan,
} from "ember-schemas";
import { z, type ZodType } from "zod";

/**
 * Creates a Zod schema for a transaction artifact.
 * This artifact includes a plan (an array of transactions) and a preview object.
 *
 * @template P - The Zod type of the preview object.
 * @param {P} previewSchema - The Zod schema for the preview object.
 * @returns A Zod schema for the transaction artifact.
 */
export function createTransactionArtifactSchema<P extends ZodType<unknown>>(
  previewSchema: P
) {
  return z.object({
    txPlan: z
      .array(TransactionPlanSchema)
      .describe(
        "An array of transaction plans that can be executed on-chain. Each plan includes 'to', 'data', 'value', and 'chainId'."
      ),
    txPreview: previewSchema.describe(
      "A preview of the transaction's outcome or related domain-specific information."
    ),
  });
}

/**
 * Represents a transaction artifact, which includes a plan and a preview.
 *
 * @template PreviewType - The type of the preview object.
 */
export interface TransactionArtifact<PreviewType> {
  /** An array of transaction plans that can be executed on-chain. */
  txPlan: TransactionPlan[];
  /** A preview of the transaction's outcome or related domain-specific information. */
  txPreview: PreviewType;
}
