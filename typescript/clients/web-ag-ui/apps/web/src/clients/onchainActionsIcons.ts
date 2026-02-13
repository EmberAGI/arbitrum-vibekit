import { z } from 'zod';

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function parseJsonResponse<T>(response: Response, schema: z.ZodSchema<T>): Promise<T> {
  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`Onchain-actions request failed (${response.status}): ${payloadText}`);
  }

  const trimmed = payloadText.trim();
  const payload = trimmed.length > 0 ? (JSON.parse(trimmed) as unknown) : ({} as unknown);
  return schema.parse(payload);
}

const TokenUidSchema = z.object({
  chainId: z.string().min(1),
  address: z.string().min(1),
});

const TokenSchema = z.object({
  tokenUid: TokenUidSchema,
  name: z.string(),
  symbol: z.string(),
  isNative: z.boolean(),
  decimals: z.number().int(),
  iconUri: z.string().nullable().optional(),
  isVetted: z.boolean(),
});

const ChainSchema = z.object({
  chainId: z.string().min(1),
  type: z.enum(['UNSPECIFIED', 'EVM', 'SOLANA', 'COSMOS']),
  name: z.string(),
  iconUri: z.string(),
  httpRpcUrl: z.string(),
  blockExplorerUrls: z.array(z.string()),
  nativeToken: TokenSchema,
});

const ChainsPageSchema = z.object({
  chains: z.array(ChainSchema),
  cursor: z.string(),
  currentPage: z.number().int(),
  totalPages: z.number().int(),
  totalItems: z.number().int(),
});

const TokensPageSchema = z.object({
  tokens: z.array(TokenSchema),
  cursor: z.string(),
  currentPage: z.number().int(),
  totalPages: z.number().int(),
  totalItems: z.number().int(),
});

export type OnchainActionsChain = z.infer<typeof ChainSchema>;
export type OnchainActionsToken = z.infer<typeof TokenSchema>;
export type OnchainActionsChainsPage = z.infer<typeof ChainsPageSchema>;
export type OnchainActionsTokensPage = z.infer<typeof TokensPageSchema>;

export async function fetchOnchainActionsChainsPage(options: {
  baseUrl: string;
  page?: number;
  cursor?: string;
}): Promise<OnchainActionsChainsPage> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = new URL(`${baseUrl}/chains`);
  if (options.page !== undefined) url.searchParams.set('page', String(options.page));
  if (options.cursor) url.searchParams.set('cursor', options.cursor);

  const response = await fetch(url);
  return await parseJsonResponse(response, ChainsPageSchema);
}

export async function fetchOnchainActionsTokensPage(options: {
  baseUrl: string;
  chainIds?: string[];
  page?: number;
  cursor?: string;
}): Promise<OnchainActionsTokensPage> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = new URL(`${baseUrl}/tokens`);
  if (options.page !== undefined) url.searchParams.set('page', String(options.page));
  if (options.cursor) url.searchParams.set('cursor', options.cursor);
  for (const chainId of options.chainIds ?? []) {
    url.searchParams.append('chainIds', chainId);
  }

  const response = await fetch(url);
  return await parseJsonResponse(response, TokensPageSchema);
}

