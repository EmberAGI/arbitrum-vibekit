import { z } from 'zod';

export const TokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});
export type TokenIdentifier = z.infer<typeof TokenIdentifierSchema>;
