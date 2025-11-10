import type { z } from 'zod';
import type {
  MarketTokenizedYieldRequest,
  MarketTokenizedYieldResponseSchema,
  TokenizedYieldUserPositionsRequest,
  TokenizedYieldUserPositionsResponseSchema,
} from '../schemas/tokenizedYield.js';

// Queries for tokenized yield plugin
export type TokenizedYieldGetMarkets = (
  request: MarketTokenizedYieldRequest,
) => Promise<z.infer<typeof MarketTokenizedYieldResponseSchema>>;

export type TokenizedYieldGetUserPositions = (
  request: TokenizedYieldUserPositionsRequest,
) => Promise<z.infer<typeof TokenizedYieldUserPositionsResponseSchema>>;

export type TokenizedYieldQueries = {
  getTokenizedYieldMarkets: TokenizedYieldGetMarkets;
  getUserPositions: TokenizedYieldGetUserPositions;
};
