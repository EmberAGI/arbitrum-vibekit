import type {
  PaymentRequirements,
  Network,
  PaymentPayload} from 'x402/types';
import {
  NetworkSchema as x402NetworkSchema,
  PaymentRequirementsSchema as x402PaymentRequirementsSchema,
  PaymentPayloadSchema as x402PayloadPaymentSchema
} from 'x402/types';
import { z } from 'zod';

/**
 * Key for x402 payment status in metadata
 */
export const X402_STATUS_KEY = 'x402.payment.status';

/**
 * Key for x402 payment requirements in metadata
 */
export const X402_REQUIREMENTS_KEY = 'x402.payment.required';

/**
 * The payload key.
 */
export const X402_PAYMENT_PAYLOAD_KEY = 'x402.payment.payload';

/**
 * Key for x402 payment receipts in metadata
 */
export const X402_RECEIPTS_KEY = 'x402.payment.receipts';

/**
 * Key for x402 payment error code in metadata
 */
export const X402_ERROR_KEY = 'x402.payment.error';

/**
 * Key for x402 payment failure stage in metadata
 */
export const X402_FAILURE_STAGE_KEY = 'x402.payment.failure_stage';

/**
 * Failure stages for x402 payment processing
 */
export type X402FailureStage =
  | 'requirements-load'
  | 'payload-parse'
  | 'verify'
  | 'settle'
  | 'internal-error';

/**
 * Payment failure receipt following x402 spec
 */
export interface X402FailureReceipt {
  success: false;
  errorReason: string;
  network?: string;
  transaction?: string;
}

/**
 * Complete failure metadata structure following x402 spec
 */
export interface X402FailureMetadata extends Record<string, unknown> {
  [X402_STATUS_KEY]: 'payment-failed';
  [X402_ERROR_KEY]: string;
  [X402_FAILURE_STAGE_KEY]: X402FailureStage;
  [X402_RECEIPTS_KEY]: X402FailureReceipt[];
  http_status?: number;
  facilitator_url?: string;
  facilitator_response?: unknown;
  payment_requirements?: PaymentRequirements;
  payment_payload?: PaymentPayload;
}

/**
 * Payment scheme options - uses a flexible record schema that infers to PaymentRequirements type
 */
// We wrap the upstream x402 schema so we can (a) coerce its type to our local PaymentRequirements
// and (b) surface ALL underlying validation issues instead of a single opaque custom error.
// Using a simple refine() only emits one generic issue; superRefine lets us replay nested issues
// which dramatically improves debuggability when an element inside `accepts` is malformed.
export const PaymentRequirementsSchema: z.ZodType<PaymentRequirements> = z
  .any()
  .superRefine((data, ctx) => {
    const parsed = x402PaymentRequirementsSchema.safeParse(data);
    if (!parsed.success) {
      // Replay every underlying issue so callers see the precise field failures.
      for (const issue of parsed.error.issues) {
        // ctx.addIssue only accepts a subset of issue codes; fall back to 'custom' when outside the allowed set.
        ctx.addIssue({
          code: 'custom',
          message: `[x402] ${issue.code}: ${issue.message}`,
          path: issue.path, // Will be automatically prefixed by parent path (e.g., accepts.[index])
        });
      }
    }
  });

/**
 * Status values for x402 payments
 */
export const x402StatusSchmea = z.enum([
  'payment-required',
  'payment-submitted',
  'payment-completed',
  'payment-rejected',
]);

/**
 * x402 version schema
 */
export const x402VersionSchema = z.union([z.literal(1)]);

/**
 * x402 payment requirements schema
 */
export const x402RequirementsSchema = z.object({
  x402Version: x402VersionSchema,
  accepts: z.array(PaymentRequirementsSchema),
});
export type X402Requirements = z.infer<typeof x402RequirementsSchema>;

/**
 * EIP3009 Authorization interface schema
 */
export const EIP3009AuthorizationSchema = z.object({
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.number(),
  validBefore: z.number(),
  nonce: z.string(),
});

/**
 * x402 network schema
 */
export const NetworkSchema: z.ZodType<Network> = z
  .any()
  .refine((data) => x402NetworkSchema.safeParse(data).success);
// We wrap the upstream x402 payload schema just like payment requirements so we can
// (a) coerce its type locally and (b) surface ALL nested validation issues instead of one.
// Using superRefine lets us replay each issue with a clear prefix for easier debugging.
export const PayloadPaymentSchema: z.ZodType<PaymentPayload> = z.any().superRefine((data, ctx) => {
  const parsed = x402PayloadPaymentSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: 'custom',
        // Mirror formatting used in PaymentRequirementsSchema for consistency
        message: `[x402] ${issue.code}: ${issue.message}`,
        path: issue.path,
      });
    }
  }
});

export const x402PaymentPayloadSchema: z.ZodType<PaymentPayload> = PayloadPaymentSchema;
export type X402PaymentPayload = PaymentPayload;

/**
 * Payment receipt schema
 */
export const PaymentReceiptSchema = z.object({
  success: z.boolean(),
  transaction: z.string().optional(),
  network: z.string().optional(),
  payer: z.string().optional(),
});

export type PaymentReceipt = z.infer<typeof PaymentReceiptSchema>;
