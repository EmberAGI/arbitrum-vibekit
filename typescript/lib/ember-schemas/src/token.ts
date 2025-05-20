/**
 * Token-related schemas
 */

import { z } from 'zod';

/**
 * Schema for token unique identifier (chain ID + address)
 */
export const TokenUidSchema = z.object({
  chainId: z.string().optional(),
  address: z.string().optional(),
});

/**
 * Schema for token metadata
 */
export const TokenSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().optional(),
  tokenUid: TokenUidSchema.optional(),
}).passthrough();

/**
 * Types derived from schemas
 */
export type TokenUid = z.infer<typeof TokenUidSchema>;
export type Token = z.infer<typeof TokenSchema>; 