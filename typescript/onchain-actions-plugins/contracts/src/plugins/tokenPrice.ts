import { z } from 'zod';

import {
  CanonicalTokenIdentifierV1Schema,
  type CanonicalTokenIdentifierV1,
} from '../core/index.js';
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
  readTokenPrices(
    tokenUids: readonly CanonicalTokenIdentifierV1[],
  ): Promise<TokenPriceReadResultV1[]>;
}
