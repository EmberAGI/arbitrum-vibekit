import { readFile } from "node:fs/promises";

import { z } from "zod";

import { EmberEvmTransactionSchema, type EmberEvmTransaction } from "../delegations/emberDelegations.js";

const HTTP_TIMEOUT_MS = 60_000;

const PoolIdentifierSchema = z.object({
  chainId: z.string(),
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "address must be an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
});

const PayableTokenSchema = z.object({
  tokenUid: z.object({
    chainId: z.string(),
    address: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/u, "address must be an EVM address")
      .transform((value) => value.toLowerCase() as `0x${string}`),
  }),
  amount: z.string(),
});

const ClmmRangeSchema = z.union([
  z.object({ type: z.literal("full") }),
  z.object({
    type: z.literal("limited"),
    minPrice: z.string(),
    maxPrice: z.string(),
  }),
]);

export const EmberSupplyRequestSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "walletAddress must be an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
  supplyChain: z.string(),
  poolIdentifier: PoolIdentifierSchema,
  range: ClmmRangeSchema,
  payableTokens: z.array(PayableTokenSchema).min(1),
});

export type EmberSupplyRequest = z.infer<typeof EmberSupplyRequestSchema>;

export const EmberWithdrawRequestSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "walletAddress must be an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
  poolTokenUid: PoolIdentifierSchema,
});

export type EmberWithdrawRequest = z.infer<typeof EmberWithdrawRequestSchema>;

const EmberLiquidityResponseSchema = z.object({
  poolIdentifier: PoolIdentifierSchema.optional(),
  transactions: z.array(EmberEvmTransactionSchema),
  requestId: z.string().optional(),
});

export type EmberLiquidityResponse = z.infer<typeof EmberLiquidityResponseSchema>;

async function fetchEndpoint<T>(
  baseUrl: string,
  endpoint: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "No error body");
    throw new Error(`Ember API request failed (${response.status}): ${text}`);
  }

  const json: unknown = await response.json();
  return schema.parseAsync(json);
}

export async function requestEmberSupplyTransactions(params: {
  baseUrl: string;
  request: EmberSupplyRequest;
}): Promise<{ response: EmberLiquidityResponse; transactions: EmberEvmTransaction[] }> {
  const response = await fetchEndpoint(
    params.baseUrl,
    "/liquidity/supply",
    EmberLiquidityResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(EmberSupplyRequestSchema.parse(params.request)),
    },
  );

  return { response, transactions: response.transactions };
}

export async function requestEmberWithdrawTransactions(params: {
  baseUrl: string;
  request: EmberWithdrawRequest;
}): Promise<{ response: EmberLiquidityResponse; transactions: EmberEvmTransaction[] }> {
  const response = await fetchEndpoint(
    params.baseUrl,
    "/liquidity/withdraw",
    EmberLiquidityResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(EmberWithdrawRequestSchema.parse(params.request)),
    },
  );

  return { response, transactions: response.transactions };
}

const JsonFileSchema = z.object({
  jsonFile: z.string().min(1),
});

export async function readJsonFile<T>(params: {
  filePath: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const { jsonFile } = JsonFileSchema.parse({ jsonFile: params.filePath });
  const raw = await readFile(jsonFile, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return params.schema.parse(parsed);
}

