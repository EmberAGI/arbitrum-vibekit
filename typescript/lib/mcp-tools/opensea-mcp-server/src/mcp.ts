// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { fetch } from 'undici'
import pRetry, { AbortError } from 'p-retry'
import type { FailedAttemptError } from 'p-retry'

type OpenSeaDeps = { apiKey: string }

const BASE = process.env.OPENSEA_BASE_URL || 'https://api.opensea.io'

const RETRY_CONFIG = { factor: 2, minTimeout: 500, maxTimeout: 4000, randomize: true }

export function isRateLimitOrTransient(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /429|5\d\d|rate|timeout|network/i.test(error.message)
}

type RateLimitInfo = {
  limit: string | null
  remaining: string | null
  reset: string | null
}

function extractRateLimit(headers: Headers): RateLimitInfo {
  return {
    limit: headers.get('x-ratelimit-limit'),
    remaining: headers.get('x-ratelimit-remaining'),
    reset: headers.get('x-ratelimit-reset'),
  }
}

type FetchResult<T = unknown> = { data: T; rateLimit: RateLimitInfo }

async function osFetch<T = unknown>(path: string, apiKey: string, searchParams?: Record<string, string | number | undefined>): Promise<FetchResult<T>> {
  const url = new URL(path, BASE)
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  return pRetry(
    async () => {
      try {
        const res = await fetch(url, {
          headers: {
            'x-api-key': apiKey,
            'accept': 'application/json'
          }
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          const err = new Error(`OpenSea API error ${res.status}: ${text}`)
          if (res.status === 429 || res.status >= 500) {
            throw err
          }
          throw new AbortError(err)
        }
        const data = (await res.json()) as T
        const rateLimit = extractRateLimit(res.headers)
        return { data, rateLimit }
      } catch (err) {
        if (isRateLimitOrTransient(err)) {
          throw err
        }
        throw new AbortError(err as Error)
      }
    },
    {
      ...RETRY_CONFIG,
      retries: 4,
      onFailedAttempt: (e: FailedAttemptError) => {
        console.error(`OpenSea fetch failed (attempt ${e.attemptNumber}, left ${e.retriesLeft}): ${e.message}`)
      }
    }
  )
}

export async function createServer(deps: OpenSeaDeps) {
  const server = new McpServer({ name: 'opensea-arbitrum-mcp-server', version: '0.1.0' })

  // Arbitrum-focused server - all operations default to Arbitrum chain
  const ARBITRUM_CHAIN = 'arbitrum' as const
  const DEFAULTS = {
    wallet: (process.env.DEFAULT_ARBITRUM_WALLET || '0xc9d7a0d7136277a4b1ffda1cadb0f1f114865af1').toLowerCase(),
    collection_slug: 'alchemy-denver2025-blue',
    contract: '0xe6270e46c9f99f00d459ca707298d8679f44b9ae',
    token_id: '13',
  } as const

  // Normalizers and schemas
  const EthAddressSchema = z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string().regex(/^0x[a-f0-9]{40}$/i, 'address must be a 42-char 0x-prefixed hex string')
  )

  const TokenIdSchema = z.preprocess(
    (v) => (typeof v === 'number' || typeof v === 'string' ? String(v).trim() : v),
    z.string({ required_error: 'token_id is required' }).min(1, 'token_id cannot be empty')
  )

  const CollectionSlugSchema = z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string({ required_error: 'collection_slug is required' }).min(1, 'collection_slug cannot be empty')
  )

  // 1) get_wallet_nfts - Arbitrum only
  const GetWalletNftsSchemaRaw = z
    .object({
      address: z.unknown().optional().describe('Wallet address to fetch NFTs for on Arbitrum'),
      wallet: z.unknown().optional(),
      wallet_address: z.unknown().optional(),
      walletAddress: z.unknown().optional(),
      owner: z.unknown().optional(),
      account: z.unknown().optional(),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
    })
    .transform((i) => {
      const cand = [i.address, i.wallet, i.wallet_address, (i as any).walletAddress, i.owner, i.account]
        .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
        .find((v) => typeof v === 'string' && v.length > 0)
      const fallback = (process.env.DEFAULT_ARBITRUM_WALLET || '0xc9d7a0d7136277a4b1ffda1cadb0f1f114865af1').toLowerCase()
      return { address: (cand || fallback) as string, cursor: i.cursor }
    })
    .superRefine((o, ctx) => {
      if (!/^0x[a-f0-9]{40}$/i.test(o.address)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'address must be a 42-char 0x-prefixed hex string', path: ['address'] })
      }
    })

  const GetWalletNftsDisplayShape = {
    address: z.string().optional(),
    wallet: z.string().optional(),
    owner: z.string().optional(),
    account: z.string().optional(),
    cursor: z.string().optional(),
  } as const

  server.tool(
    'get_wallet_nfts',
    'Fetch NFTs owned by a wallet on Arbitrum.',
    GetWalletNftsDisplayShape,
    async (unparsed: any) => {
      const parsed = GetWalletNftsSchemaRaw.safeParse(unparsed)
      const address = parsed.success ? parsed.data.address : DEFAULTS.wallet
      const cursor = parsed.success ? parsed.data.cursor : undefined
      const result = await osFetch(`/api/v2/chain/${ARBITRUM_CHAIN}/account/${address}/nfts`, deps.apiKey, { cursor })
      const nextCursor = (result.data as any)?.next ?? (result.data as any)?.next_cursor ?? null
      return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: result.rateLimit, nextCursor, data: result.data }, null, 2) }] }
    }
  )

  // 2) get_collection - Arbitrum focused
  const GetCollectionSchemaRaw = z
    .object({
      collection_slug: CollectionSlugSchema.optional(),
      collectionSlug: CollectionSlugSchema.optional(),
      slug: CollectionSlugSchema.optional(),
      collection: CollectionSlugSchema.optional(),
    })
    .transform((i) => ({
      collection_slug: (i.collection_slug ?? i.collectionSlug ?? i.slug ?? i.collection) as string,
    }))
    .superRefine((o, ctx) => {
      if (!o.collection_slug) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'collection_slug is required', path: ['collection_slug'] })
      }
    })

  const GetCollectionDisplayShape = {
    collection_slug: z.string().optional(),
    collectionSlug: z.string().optional(),
    slug: z.string().optional(),
    collection: z.string().optional(),
  } as const

  server.tool(
    'get_collection',
    'Fetch OpenSea collection metadata by slug (Arbitrum collections only).',
    GetCollectionDisplayShape,
    async (unparsed: any) => {
      const parsed = GetCollectionSchemaRaw.safeParse(unparsed)
      const collection_slug = parsed.success ? parsed.data.collection_slug : DEFAULTS.collection_slug
      const result = await osFetch(`/api/v2/collections/${collection_slug}`, deps.apiKey)
      return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: result.rateLimit, data: result.data }, null, 2) }] }
    }
  )

  // 3) list_arbitrum_collections - Arbitrum only
  const ListCollectionsSchema = z.object({
    limit: z.number().min(1).max(50).default(20).describe('Number of collections to return (max 50)'),
    cursor: z.string().optional().describe('Pagination cursor from previous response')
  })
  type ListCollectionsArgs = z.infer<typeof ListCollectionsSchema>

  server.tool(
    'list_arbitrum_collections',
    'List collections available on Arbitrum.',
    ListCollectionsSchema.shape,
    async ({ limit, cursor }: ListCollectionsArgs) => {
      const params: Record<string, string | number> = { limit }
      if (cursor) params['next'] = cursor
      const result = await osFetch(`/api/v2/collections`, deps.apiKey, params)
      const nextCursor = (result.data as any)?.next ?? null

      // Filter to only include Arbitrum collections
      const arbitrumCollections = {
        ...(result.data as any),
        collections: ((result.data as any)?.collections || []).filter((collection: any) =>
          collection.contracts?.some((contract: any) => contract.chain === ARBITRUM_CHAIN)
        )
      }

      return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: result.rateLimit, nextCursor, data: arbitrumCollections }, null, 2) }] }
    }
  )

  // 4) get_listings_by_collection - Arbitrum only
  const GetListingsSchemaRaw = z
    .object({
      collection_slug: CollectionSlugSchema.optional(),
      collectionSlug: CollectionSlugSchema.optional(),
      slug: CollectionSlugSchema.optional(),
      collection: CollectionSlugSchema.optional(),
      limit: z.number().optional().describe('Max results'),
      cursor: z.string().optional().describe('Pagination cursor from previous response')
    })
    .transform((i) => ({
      collection_slug: (i.collection_slug ?? i.collectionSlug ?? i.slug ?? i.collection) as string,
      limit: i.limit,
      cursor: i.cursor,
    }))
    .superRefine((o, ctx) => {
      if (!o.collection_slug) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'collection_slug is required', path: ['collection_slug'] })
      }
    })

  // Display shape for tool registration (no transforms)
  const GetListingsDisplayShape = {
    collection_slug: z.string().optional(),
    collectionSlug: z.string().optional(),
    slug: z.string().optional(),
    collection: z.string().optional(),
    limit: z.number().optional(),
    cursor: z.string().optional(),
  } as const

  server.tool(
    'get_listings_by_collection',
    'Get active listings for a collection on Arbitrum.',
    GetListingsDisplayShape,
    async (unparsed: any) => {
      const parsed = GetListingsSchemaRaw.safeParse(unparsed)
      const collection_slug = parsed.success && parsed.data.collection_slug ? parsed.data.collection_slug : DEFAULTS.collection_slug
      const limit = parsed.success ? parsed.data.limit : undefined
      const cursor = parsed.success ? parsed.data.cursor : undefined
      const params: Record<string, string | number> = { collection_slug }
      if (limit !== undefined) params['limit'] = limit
      if (cursor !== undefined) params['next'] = cursor
      const result = await osFetch(`/api/v2/orders/${ARBITRUM_CHAIN}/seaport/listings`, deps.apiKey, params)
      const nextCursor = (result.data as any)?.next ?? (result.data as any)?.next_cursor ?? null
      return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: result.rateLimit, nextCursor, data: result.data }, null, 2) }] }
    }
  )

  // 5) get_listings_by_asset - Arbitrum only
  const GetAssetListingsSchemaRaw = z
    .object({
      contract_address: EthAddressSchema.optional(),
      contractAddress: EthAddressSchema.optional(),
      token_id: TokenIdSchema.optional(),
      tokenId: TokenIdSchema.optional(),
      collection_slug: CollectionSlugSchema.optional(),
      collectionSlug: CollectionSlugSchema.optional(),
      fallback_to_collection: z.boolean().optional(),
      fallbackToCollection: z.boolean().optional(),
      limit: z.number().optional().describe('Max results'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
    })
    .transform((i) => ({
      contract_address: (i.contract_address ?? i.contractAddress) as string,
      token_id: (i.token_id ?? i.tokenId) as string,
      collection_slug: (i.collection_slug ?? i.collectionSlug) as string | undefined,
      fallback_to_collection: (i.fallback_to_collection ?? i.fallbackToCollection) as boolean | undefined,
      limit: i.limit,
      cursor: i.cursor,
    }))
    .superRefine((o, ctx) => {
      if (!o.contract_address) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'contract_address is required', path: ['contract_address'] })
      if (!o.token_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'token_id is required', path: ['token_id'] })
    })

  const GetAssetListingsDisplayShape = {
    contract_address: z.string().optional(),
    contractAddress: z.string().optional(),
    token_id: z.union([z.string(), z.number()]).optional(),
    tokenId: z.union([z.string(), z.number()]).optional(),
    collection_slug: z.string().optional(),
    collectionSlug: z.string().optional(),
    fallback_to_collection: z.boolean().optional(),
    fallbackToCollection: z.boolean().optional(),
    limit: z.number().optional(),
    cursor: z.string().optional(),
  } as const

  server.tool(
    'get_listings_by_asset',
    'Get active listings for a specific NFT asset on Arbitrum.',
    GetAssetListingsDisplayShape,
    async (unparsed: any) => {
      const parsed = GetAssetListingsSchemaRaw.safeParse(unparsed)
      const contract_address = parsed.success && parsed.data.contract_address ? parsed.data.contract_address : DEFAULTS.contract
      const token_id = parsed.success && parsed.data.token_id ? parsed.data.token_id : DEFAULTS.token_id
      const collection_slug = parsed.success ? parsed.data.collection_slug : undefined
      const fallback_to_collection = parsed.success ? parsed.data.fallback_to_collection : undefined
      const limit = parsed.success ? parsed.data.limit : undefined
      const cursor = parsed.success ? parsed.data.cursor : undefined
      const params: Record<string, string | number> = {
        asset_contract_address: contract_address,
        token_ids: String(token_id),
      }
      if (limit !== undefined) params['limit'] = limit
      if (cursor !== undefined) params['next'] = cursor
      const result = await osFetch(`/api/v2/orders/${ARBITRUM_CHAIN}/seaport/listings`, deps.apiKey, params)
      let nextCursor = (result.data as any)?.next ?? (result.data as any)?.next_cursor ?? null
      if ((Array.isArray((result.data as any)?.orders) && (result.data as any).orders.length === 0) && fallback_to_collection && collection_slug) {
        const colParams: Record<string, string | number> = { collection_slug }
        if (limit !== undefined) colParams['limit'] = limit
        if (cursor !== undefined) colParams['next'] = cursor
        const colResult = await osFetch(`/api/v2/orders/${ARBITRUM_CHAIN}/seaport/listings`, deps.apiKey, colParams)
        nextCursor = (colResult.data as any)?.next ?? (colResult.data as any)?.next_cursor ?? null
        return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: colResult.rateLimit, nextCursor, data: colResult.data, fallback: 'collection_listings' }, null, 2) }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: result.rateLimit, nextCursor, data: result.data }, null, 2) }] }
    }
  )

  // 6) get_offers_by_asset - Arbitrum only
  const GetAssetOffersSchemaRaw = z
    .object({
      contract_address: EthAddressSchema.optional(),
      contractAddress: EthAddressSchema.optional(),
      token_id: TokenIdSchema.optional(),
      tokenId: TokenIdSchema.optional(),
      collection_slug: CollectionSlugSchema.optional(),
      collectionSlug: CollectionSlugSchema.optional(),
      fallback_to_collection: z.boolean().optional(),
      fallbackToCollection: z.boolean().optional(),
      limit: z.number().optional().describe('Max results'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
    })
    .transform((i) => ({
      contract_address: (i.contract_address ?? i.contractAddress) as string,
      token_id: (i.token_id ?? i.tokenId) as string,
      collection_slug: (i.collection_slug ?? i.collectionSlug) as string | undefined,
      fallback_to_collection: (i.fallback_to_collection ?? i.fallbackToCollection) as boolean | undefined,
      limit: i.limit,
      cursor: i.cursor,
    }))
    .superRefine((o, ctx) => {
      if (!o.contract_address) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'contract_address is required', path: ['contract_address'] })
      if (!o.token_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'token_id is required', path: ['token_id'] })
    })

  const GetAssetOffersDisplayShape = {
    contract_address: z.string().optional(),
    contractAddress: z.string().optional(),
    token_id: z.union([z.string(), z.number()]).optional(),
    tokenId: z.union([z.string(), z.number()]).optional(),
    collection_slug: z.string().optional(),
    collectionSlug: z.string().optional(),
    fallback_to_collection: z.boolean().optional(),
    fallbackToCollection: z.boolean().optional(),
    limit: z.number().optional(),
    cursor: z.string().optional(),
  } as const

  server.tool(
    'get_offers_by_asset',
    'Get active offers for a specific NFT asset on Arbitrum.',
    GetAssetOffersDisplayShape,
    async (unparsed: any) => {
      const parsed = GetAssetOffersSchemaRaw.safeParse(unparsed)
      const contract_address = parsed.success && parsed.data.contract_address ? parsed.data.contract_address : DEFAULTS.contract
      const token_id = parsed.success && parsed.data.token_id ? parsed.data.token_id : DEFAULTS.token_id
      const collection_slug = parsed.success ? parsed.data.collection_slug : undefined
      const fallback_to_collection = parsed.success ? parsed.data.fallback_to_collection : undefined
      const limit = parsed.success ? parsed.data.limit : undefined
      const cursor = parsed.success ? parsed.data.cursor : undefined
      const params: Record<string, string | number> = {
        asset_contract_address: contract_address,
        token_ids: String(token_id),
      }
      if (limit !== undefined) params['limit'] = limit
      if (cursor !== undefined) params['next'] = cursor
      const result = await osFetch(`/api/v2/orders/${ARBITRUM_CHAIN}/seaport/offers`, deps.apiKey, params)
      let nextCursor = (result.data as any)?.next ?? (result.data as any)?.next_cursor ?? null
      if ((Array.isArray((result.data as any)?.orders) && (result.data as any).orders.length === 0) && fallback_to_collection && collection_slug) {
        const colParams: Record<string, string | number> = { collection_slug }
        if (limit !== undefined) colParams['limit'] = limit
        if (cursor !== undefined) colParams['next'] = cursor
        const colResult = await osFetch(`/api/v2/orders/${ARBITRUM_CHAIN}/seaport/offers`, deps.apiKey, colParams)
        nextCursor = (colResult.data as any)?.next ?? (colResult.data as any)?.next_cursor ?? null
        return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: colResult.rateLimit, nextCursor, data: colResult.data, fallback: 'collection_offers' }, null, 2) }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ rateLimit: result.rateLimit, nextCursor, data: result.data }, null, 2) }] }
    }
  )

  return server
}


