import { z } from 'zod';

import type { TokenIdentifier } from '../core/index.js';
import { CanonicalTokenIdentifierV1Schema } from '../internal/canonical-token.js';
import {
  createFreshDataResultV1Schema,
  PositiveDecimalStringSchema,
} from '../internal/fresh-data.js';

export const TokenUsdPriceValueV1Schema = z
  .object({
    price_usd: PositiveDecimalStringSchema,
  })
  .strict();

export type TokenUsdPriceValueV1 = z.infer<typeof TokenUsdPriceValueV1Schema>;

export const TokenPriceReadResultV1Schema = createFreshDataResultV1Schema(
  CanonicalTokenIdentifierV1Schema,
  TokenUsdPriceValueV1Schema,
);

export type TokenPriceReadResultV1 = z.infer<typeof TokenPriceReadResultV1Schema>;

export interface TokenPriceReader {
  readTokenPrices(tokenUids: readonly TokenIdentifier[]): Promise<TokenPriceReadResultV1[]>;
}
