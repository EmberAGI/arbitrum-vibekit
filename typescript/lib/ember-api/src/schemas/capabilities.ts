import { z } from 'zod';
import { TokenSchema } from './core.js';

export const SwapCapabilitySchema = z.object({
  capabilityId: z.string(),
  supportedTokens: z.array(TokenSchema),
});
export type SwapCapability = z.infer<typeof SwapCapabilitySchema>;

export const LendingCapabilitySchema = z.object({
  capabilityId: z.string(),
  underlyingToken: TokenSchema,
});
export type LendingCapability = z.infer<typeof LendingCapabilitySchema>;

export const CapabilitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('swap'),
    swapCapability: SwapCapabilitySchema,
  }),
  z.object({
    type: z.literal('lending'),
    lendingCapability: LendingCapabilitySchema,
  }),
]);
export type Capability = z.infer<typeof CapabilitySchema>;
