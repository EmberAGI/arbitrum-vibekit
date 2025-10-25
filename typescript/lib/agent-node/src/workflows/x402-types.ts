import {
  NetworkSchema as x402NetworkSchema,
  PaymentRequirements,
  PaymentRequirementsSchema as x402PaymentRequirementsSchema,
  Network,
  PaymentPayloadSchema as x402PayloadPaymentSchema,
  PaymentPayload,
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
 * Payment scheme options - uses a flexible record schema that infers to PaymentRequirements type
 */
export const PaymentRequirementsSchema: z.ZodType<PaymentRequirements> = z.any().refine(
  (data) => x402PaymentRequirementsSchema.safeParse(data).success, // Using payment requirements directly doesn't work
);

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
  accepts: PaymentRequirementsSchema,
});

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

export const PayloadPaymentSchema: z.ZodType<PaymentPayload> = z
  .any()
  .refine((data) => x402PayloadPaymentSchema.safeParse(data).success);

/**
 * x402 payment payload schema
 */
export const x402PaymentPayloadSchema = z.object({
  x402Version: x402VersionSchema,
  scheme: z.string(),
  network: NetworkSchema,
  payload: PayloadPaymentSchema,
});

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
