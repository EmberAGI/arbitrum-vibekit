import { z } from 'zod';

/**
 * Chain ID schema - supports Ethereum mainnet and Arbitrum
 */
export const ChainIdSchema = z.union([
  z.literal(1), // Ethereum mainnet
  z.literal(42161), // Arbitrum One
  z.literal(11155111), // Ethereum Sepolia
  z.literal(421614), // Arbitrum Sepolia
]);

export type ChainId = z.infer<typeof ChainIdSchema>;

/**
 * Token address schema with validation
 */
export const TokenAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address format');

export type TokenAddress = z.infer<typeof TokenAddressSchema>;

/**
 * Amount schema - accepts string or bigint, converts to bigint
 */
export const AmountSchema = z.union([
  z.string().transform((val) => BigInt(val)),
  z.bigint(),
  z.number().transform((val) => BigInt(Math.floor(val))),
]);

export type Amount = bigint;

/**
 * Slippage tolerance schema (percentage as string, e.g., "0.5" for 0.5%)
 */
export const SlippageToleranceSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Invalid slippage format')
  .transform((val) => parseFloat(val));

export type SlippageTolerance = number;

/**
 * Swap quote request schema
 */
export const GetSwapQuoteRequestSchema = z.object({
  tokenIn: TokenAddressSchema,
  tokenOut: TokenAddressSchema,
  amount: AmountSchema,
  chainId: ChainIdSchema,
  slippageTolerance: SlippageToleranceSchema.optional(),
});

export type GetSwapQuoteRequest = z.infer<typeof GetSwapQuoteRequestSchema>;

/**
 * Route hop schema
 */
export const RouteHopSchema = z.object({
  tokenIn: TokenAddressSchema,
  tokenOut: TokenAddressSchema,
  poolAddress: TokenAddressSchema,
  fee: z.number().int().positive(),
  type: z.enum(['v2', 'v3']),
});

export type RouteHop = z.infer<typeof RouteHopSchema>;

/**
 * Route summary schema
 */
export const RouteSummarySchema = z.object({
  hops: z.array(RouteHopSchema),
  totalFee: z.string(),
  priceImpact: z.string(),
});

export type RouteSummary = z.infer<typeof RouteSummarySchema>;

/**
 * Swap quote response schema
 */
export const GetSwapQuoteResponseSchema = z.object({
  expectedAmountOut: z.string(),
  priceImpact: z.string(),
  routeSummary: RouteSummarySchema,
  effectivePrice: z.string(),
  minimumAmountOut: z.string(),
});

export type GetSwapQuoteResponse = z.infer<typeof GetSwapQuoteResponseSchema>;

/**
 * Get best route request schema
 */
export const GetBestRouteRequestSchema = z.object({
  tokenIn: TokenAddressSchema,
  tokenOut: TokenAddressSchema,
  amount: AmountSchema,
  chainId: ChainIdSchema,
});

export type GetBestRouteRequest = z.infer<typeof GetBestRouteRequestSchema>;

/**
 * Get best route response schema
 */
export const GetBestRouteResponseSchema = z.object({
  route: RouteSummarySchema,
  estimatedGas: z.string().optional(),
});

export type GetBestRouteResponse = z.infer<typeof GetBestRouteResponseSchema>;

/**
 * Generate swap transaction request schema
 */
export const GenerateSwapTransactionRequestSchema = z.object({
  route: RouteSummarySchema,
  amountIn: AmountSchema.optional(),
  amountOut: AmountSchema.optional(),
  slippageTolerance: SlippageToleranceSchema,
  recipient: TokenAddressSchema,
  chainId: ChainIdSchema,
  deadline: z.number().int().positive().optional(),
});

export type GenerateSwapTransactionRequest = z.infer<
  typeof GenerateSwapTransactionRequestSchema
>;

/**
 * Generate swap transaction response schema
 */
export const GenerateSwapTransactionResponseSchema = z.object({
  to: TokenAddressSchema,
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid calldata format'),
  value: z.string(),
  gasEstimate: z.string(),
  deadline: z.number().int().positive(),
});

export type GenerateSwapTransactionResponse = z.infer<
  typeof GenerateSwapTransactionResponseSchema
>;

/**
 * Validate swap feasibility request schema
 */
export const ValidateSwapFeasibilityRequestSchema = z.object({
  tokenIn: TokenAddressSchema,
  tokenOut: TokenAddressSchema,
  amount: AmountSchema,
  chainId: ChainIdSchema,
  userAddress: TokenAddressSchema,
  slippageTolerance: SlippageToleranceSchema.optional(),
});

export type ValidateSwapFeasibilityRequest = z.infer<
  typeof ValidateSwapFeasibilityRequestSchema
>;

/**
 * Validation result schema
 */
export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  requiresApproval: z.boolean(),
  currentAllowance: z.string().optional(),
  userBalance: z.string(),
  estimatedAmountOut: z.string().optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Process swap intent request schema
 */
export const ProcessSwapIntentRequestSchema = z.object({
  intent: z.string().min(1, 'Intent cannot be empty'),
  chainId: ChainIdSchema,
  userAddress: TokenAddressSchema.optional(),
});

export type ProcessSwapIntentRequest = z.infer<
  typeof ProcessSwapIntentRequestSchema
>;

/**
 * Process swap intent response schema
 */
export const ProcessSwapIntentResponseSchema = z.object({
  tokenIn: TokenAddressSchema,
  tokenOut: TokenAddressSchema,
  amount: z.string(),
  slippageTolerance: SlippageToleranceSchema.optional(),
  quote: GetSwapQuoteResponseSchema.optional(),
  transaction: GenerateSwapTransactionResponseSchema.optional(),
  validation: ValidationResultSchema.optional(),
});

export type ProcessSwapIntentResponse = z.infer<
  typeof ProcessSwapIntentResponseSchema
>;

