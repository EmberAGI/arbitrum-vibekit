import { z } from 'zod';

import { PositionSideSchema } from '../core/schemas/perpetuals.js';
import {
  PaginatedPossibleResultsRequestSchema,
  PaginatedPossibleResultsResponseSchema,
} from './pagination.js';

export const PerpetualsCreatePositionRequestSchema = z.object({
  amount: z.string().describe('The amount of tokens to use for opening the perpetual position'),
  walletAddress: z.string().describe('The wallet address that will create the perpetual position'),
  chain: z
    .string()
    .describe('The blockchain network where the perpetual position will be created'),
  market: z.string().describe('The perpetual futures market to trade (e.g., BTC-USD, ETH-USD)'),
  payToken: z.string().describe('The token used to pay for opening the position'),
  collateralToken: z.string().describe('The token used as collateral for the perpetual position'),
  referralCode: z.string().optional().describe('Optional referral code for fee discounts'),
  limitPrice: z
    .string()
    .optional()
    .describe('Limit price for the order. If not provided, will execute at market price'),
  leverage: z
    .string()
    .describe("The leverage multiplier for the position (e.g., '2', '5', '10')"),
});
export type PerpetualsCreatePositionRequest = z.infer<
  typeof PerpetualsCreatePositionRequestSchema
>;

export const PerpetualsPositionPromptSchema = PerpetualsCreatePositionRequestSchema.pick({
  chain: true,
  market: true,
  payToken: true,
  collateralToken: true,
  walletAddress: true,
}).partial();

export const PossiblePerpetualPositionsRequestSchema =
  PaginatedPossibleResultsRequestSchema.merge(PerpetualsPositionPromptSchema);
export type PossiblePerpetualPositionsRequest = z.infer<
  typeof PossiblePerpetualPositionsRequestSchema
>;

export const PossiblePerpetualPositionsOptionSchema = z.object({
  createRequest: PerpetualsCreatePositionRequestSchema.pick({
    market: true,
    collateralToken: true,
    payToken: true,
    chain: true,
  }),
  data: z.object({
    fundingFee: z.string().describe('The funding fee rate for this perpetual market'),
    borrowingFee: z.string().describe('The borrowing fee rate for this perpetual market'),
  }),
});
export type PossiblePerpetualPositionOption = z.infer<
  typeof PossiblePerpetualPositionsOptionSchema
>;

export const PossiblePerpetualPositionsResponseSchema = z
  .object({
    options: z.array(PossiblePerpetualPositionsOptionSchema),
  })
  .merge(PaginatedPossibleResultsResponseSchema);
export type PossiblePerpetualPositionsResponse = z.infer<
  typeof PossiblePerpetualPositionsResponseSchema
>;

export const CreatePerpetualClosePositionRequestSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet address that owns the perpetual position to close'),
  providerName: z
    .string()
    .describe('The DeFi protocol provider where the position exists (e.g., GMX, dYdX)'),
  market: z.string().describe('The perpetual futures market of the position to close'),
  collateralToken: z.string().describe('The collateral token used in the position'),
  positionSide: PositionSideSchema.describe('Whether the position is long or short'),
  isLimit: z
    .boolean()
    .describe('Whether to close using a limit order (true) or market order (false)'),
});
export type CreatePerpetualClosePositionRequest = z.infer<
  typeof CreatePerpetualClosePositionRequestSchema
>;

export const PerpetualsCloseOrderPromptSchema = CreatePerpetualClosePositionRequestSchema.pick({
  walletAddress: true,
  providerName: true,
  market: true,
  collateralToken: true,
  positionSide: true,
})
  .extend({
    isLimit: z
      .string()
      .describe("Whether to use limit order ('true') or market order ('false') for closing"),
  })
  .partial();

export const PossiblePerpetualCloseRequestSchema =
  PaginatedPossibleResultsRequestSchema.merge(
    CreatePerpetualClosePositionRequestSchema.omit({
      walletAddress: true,
    }).partial(),
  ).extend({
    walletAddress: z
      .string()
      .describe('The wallet address to check for closeable perpetual positions'),
  });
export type PossiblePerpetualCloseRequest = z.infer<
  typeof PossiblePerpetualCloseRequestSchema
>;

export const PositionDataSchema = z.object({
  sizeInUsd: z.string().describe('The size of the position in USD value'),
  increasedAtTime: z.string().describe('Timestamp when the position was last increased'),
  decreasedAtTime: z.string().describe('Timestamp when the position was last decreased'),
  pnl: z.string().describe('Current profit and loss of the position in USD'),
});

export const LimitOrderDataSchema = z.object({
  sizeDeltaUsd: z.string().describe('The USD size change for the limit order'),
  acceptablePrice: z.string().describe('The acceptable execution price for the limit order'),
  triggerPrice: z.string().describe('The trigger price that activates the limit order'),
});

export const TradingPositionDataSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('limit'),
    })
    .merge(LimitOrderDataSchema),
  z
    .object({
      type: z.literal('market'),
    })
    .merge(PositionDataSchema),
]);

export const PerpetualCloseOptionSchema = z.object({
  createRequest: CreatePerpetualClosePositionRequestSchema.pick({
    providerName: true,
    market: true,
    collateralToken: true,
    positionSide: true,
    isLimit: true,
  }),
  data: z.object({
    collateralAmount: z
      .string()
      .describe('The amount of collateral tokens in the position'),
    orderData: TradingPositionDataSchema.describe(
      'Details about the position or order to be closed',
    ),
  }),
});
export type PerpetualCloseOption = z.infer<typeof PerpetualCloseOptionSchema>;

export const PossiblePerpetualCloseResponseSchema = z
  .object({
    options: z
      .array(PerpetualCloseOptionSchema)
      .describe('Available perpetual positions and orders that can be closed'),
  })
  .merge(PaginatedPossibleResultsResponseSchema);

export const CreatePerpetualCloseSimplifiedEndpointRequestSchema = z.object({
  walletAddress: z.string().describe('Wallet owning the perpetual position/order to close'),
  marketAddress: z.string().describe('Perpetual market contract address').min(1),
  positionSide: PositionSideSchema.optional().describe('long or short (optional filter)'),
  isLimit: z
    .boolean()
    .optional()
    .describe(
      'If true, target a limit order; if false, target a market position; if omitted, try market then limit',
    ),
});
export type CreatePerpetualCloseSimplifiedEndpointRequest = z.infer<
  typeof CreatePerpetualCloseSimplifiedEndpointRequestSchema
>;
