import { z } from 'zod';

export const TokenUidSchema = z.object({
  chainId: z.string().describe("Chain ID for the token, e.g., '1' for Ethereum mainnet."),
  address: z.string().describe("Contract address of the token."),
});

export const TokenSchema = z.object({
  tokenUid: TokenUidSchema.describe("Unique identifier for the token, if it's not a native token."),
  name: z.string().describe("Full name of the token, e.g., 'Ethereum'."),
  symbol: z.string().describe("Symbol of the token, e.g., 'ETH'."),
  isNative: z.boolean().describe("Whether this is the native token of the chain."),
  decimals: z.number().describe("Number of decimal places the token uses."),
  iconUri: z.string().optional().describe("URI for the token's icon."),
  usdPrice: z.string().optional().describe("Current USD price of the token, as a string to maintain precision."),
  isVetted: z.boolean().describe("Whether this token is considered vetted or trusted."),
});

export type TokenUid = z.infer<typeof TokenUidSchema>;
export type Token = z.infer<typeof TokenSchema>; 