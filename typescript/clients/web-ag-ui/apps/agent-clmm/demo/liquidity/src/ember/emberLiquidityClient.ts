import { readFile } from "node:fs/promises";

import { z } from "zod";

import { EmberEvmTransactionSchema, type EmberEvmTransaction } from "../delegations/emberDelegations.js";

const HTTP_TIMEOUT_MS = 60_000;

export class EmberApiRequestError extends Error {
  readonly status: number;
  readonly url: string;
  readonly bodyText: string;

  constructor(params: { message: string; status: number; url: string; bodyText: string }) {
    super(params.message);
    this.name = "EmberApiRequestError";
    this.status = params.status;
    this.url = params.url;
    this.bodyText = params.bodyText;
  }
}

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

const TokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "address must be an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
});

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

export const EmberSwapRequestSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "walletAddress must be an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
  amount: z.string(),
  amountType: z.enum(["exactIn", "exactOut"]),
  fromTokenUid: TokenIdentifierSchema,
  toTokenUid: TokenIdentifierSchema,
});

export type EmberSwapRequest = z.infer<typeof EmberSwapRequestSchema>;

const EmberLiquidityResponseSchema = z.object({
  poolIdentifier: PoolIdentifierSchema.optional(),
  transactions: z.array(EmberEvmTransactionSchema),
  requestId: z.string().optional(),
});

export type EmberLiquidityResponse = z.infer<typeof EmberLiquidityResponseSchema>;

const EmberWalletPositionsResponseSchema = z.object({
  positions: z
    .array(
      z.object({
        poolIdentifier: PoolIdentifierSchema,
      }),
    )
    .default([]),
});

export type EmberWalletPositionsResponse = z.infer<typeof EmberWalletPositionsResponseSchema>;

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
    throw new EmberApiRequestError({
      message: `Ember API request failed (${response.status}): ${text}`,
      status: response.status,
      url,
      bodyText: text,
    });
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

export async function requestEmberSwapTransactions(params: {
  baseUrl: string;
  request: EmberSwapRequest;
}): Promise<{ response: EmberLiquidityResponse; transactions: EmberEvmTransaction[] }> {
  const response = await fetchEndpoint(params.baseUrl, "/swap", EmberLiquidityResponseSchema, {
    method: "POST",
    body: JSON.stringify(EmberSwapRequestSchema.parse(params.request)),
  });

  return { response, transactions: response.transactions };
}

export async function requestEmberWalletPositions(params: {
  baseUrl: string;
  walletAddress: `0x${string}`;
  chainId: string;
}): Promise<EmberWalletPositionsResponse> {
  const query = new URLSearchParams();
  query.set("chainId", params.chainId);
  return fetchEndpoint(
    params.baseUrl,
    `/liquidity/positions/${params.walletAddress}?${query.toString()}`,
    EmberWalletPositionsResponseSchema,
  );
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
