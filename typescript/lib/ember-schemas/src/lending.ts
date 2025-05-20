/**
 * Lending-related schemas
 */

import { z } from 'zod';
import { TokenSchema } from './token.js';

/**
 * Schema for user reserve data in lending protocols
 */
export const UserReserveSchema = z.object({
  token: TokenSchema,
  underlyingBalance: z.string(),
  totalBorrows: z.string().optional(),
}).passthrough();

/**
 * Schema for lending capability data
 */
export const LendingCapabilitySchema = z.object({
  capabilityId: z.string().optional(),
  currentSupplyApy: z.string().optional(),
  currentBorrowApy: z.string().optional(),
  underlyingToken: TokenSchema.optional(),
  maxLtv: z.string().optional(),
  liquidationThreshold: z.string().optional(),
}).passthrough();

/**
 * Type for user reserve data
 */
export type UserReserve = z.infer<typeof UserReserveSchema>; 