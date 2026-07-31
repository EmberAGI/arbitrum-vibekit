import { z } from 'zod';

import { TokenIdentifierSchema } from '../core/index.js';

export const CanonicalTokenIdentifierV1Schema = TokenIdentifierSchema.extend({
  chainId: z.string().trim().min(1),
  address: z.string().trim().min(1),
}).strict();
