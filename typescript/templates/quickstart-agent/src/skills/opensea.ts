import { defineSkill, createSuccessTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core'
import { z } from 'zod'

const GetWalletNftsParams = z.object({
  address: z.string().describe('Wallet address on Arbitrum'),
  cursor: z.string().optional(),
})

const getWalletNftsTool: VibkitToolDefinition<typeof GetWalletNftsParams> = {
  name: 'get-wallet-nfts',
  description: 'Fetch NFTs owned by a wallet on Arbitrum',
  parameters: GetWalletNftsParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-arbitrum-mcp-server']
    if (!client) throw new Error('OpenSea MCP client not available')
    const res = await client.callTool({ name: 'get_wallet_nfts', arguments: args as any })
    return createSuccessTask('opensea', undefined, JSON.stringify(res))
  }
}

const ListCollectionsParams = z.object({
  limit: z.number().min(1).max(50).default(20).describe('Number of collections to return'),
  cursor: z.string().optional().describe('Pagination cursor from previous response')
})
const listCollectionsTool: VibkitToolDefinition<typeof ListCollectionsParams> = {
  name: 'list-arbitrum-collections',
  description: 'List collections available on Arbitrum',
  parameters: ListCollectionsParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-arbitrum-mcp-server']
    if (!client) throw new Error('OpenSea MCP client not available')
    const res = await client.callTool({ name: 'list_arbitrum_collections', arguments: args as any })
    return createSuccessTask('opensea', undefined, JSON.stringify(res))
  }
}

const GetCollectionParams = z.object({ collection_slug: z.string().describe('Arbitrum collection slug') })
const getCollectionTool: VibkitToolDefinition<typeof GetCollectionParams> = {
  name: 'get-collection',
  description: 'Get collection metadata for Arbitrum collections',
  parameters: GetCollectionParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-arbitrum-mcp-server']
    if (!client) throw new Error('OpenSea MCP client not available')
    const res = await client.callTool({ name: 'get_collection', arguments: args as any })
    return createSuccessTask('opensea', undefined, JSON.stringify(res))
  }
}

const GetListingsByCollectionParams = z.object({
  collection_slug: z.string().describe('Arbitrum collection slug'),
  limit: z.number().optional().describe('Max results'),
  cursor: z.string().optional().describe('Pagination cursor')
})
const getListingsByCollectionTool: VibkitToolDefinition<typeof GetListingsByCollectionParams> = {
  name: 'get-listings-by-collection',
  description: 'Get listings for a collection on Arbitrum',
  parameters: GetListingsByCollectionParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-arbitrum-mcp-server']
    if (!client) throw new Error('OpenSea MCP client not available')
    const res = await client.callTool({ name: 'get_listings_by_collection', arguments: args as any })
    return createSuccessTask('opensea', undefined, JSON.stringify(res))
  }
}

const GetListingsByAssetParams = z.object({
  contract_address: z.string().describe('NFT contract address on Arbitrum'),
  token_id: z.union([z.string(), z.number()]).describe('Token ID'),
  limit: z.number().optional().describe('Max results'),
  cursor: z.string().optional().describe('Pagination cursor')
})
const getListingsByAssetTool: VibkitToolDefinition<typeof GetListingsByAssetParams> = {
  name: 'get-listings-by-asset',
  description: 'Get listings for an asset on Arbitrum',
  parameters: GetListingsByAssetParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-arbitrum-mcp-server']
    if (!client) throw new Error('OpenSea MCP client not available')
    const res = await client.callTool({ name: 'get_listings_by_asset', arguments: args as any })
    return createSuccessTask('opensea', undefined, JSON.stringify(res))
  }
}

const GetOffersByAssetParams = z.object({
  contract_address: z.string().describe('NFT contract address on Arbitrum'),
  token_id: z.union([z.string(), z.number()]).describe('Token ID'),
  limit: z.number().optional().describe('Max results'),
  cursor: z.string().optional().describe('Pagination cursor')
})
const getOffersByAssetTool: VibkitToolDefinition<typeof GetOffersByAssetParams> = {
  name: 'get-offers-by-asset',
  description: 'Get offers for an asset on Arbitrum',
  parameters: GetOffersByAssetParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-arbitrum-mcp-server']
    if (!client) throw new Error('OpenSea MCP client not available')
    const res = await client.callTool({ name: 'get_offers_by_asset', arguments: args as any })
    return createSuccessTask('opensea', undefined, JSON.stringify(res))
  }
}

export const openseaSkill = defineSkill({
  id: 'opensea-arbitrum-readonly',
  name: 'OpenSea Arbitrum (Read-only)',
  description: 'Browse NFTs, collections, listings and offers on Arbitrum via OpenSea API',
  tags: ['nft', 'opensea', 'arbitrum'],
  examples: ['Show my Arbitrum NFTs', 'List Arbitrum collections', 'Get listings for smol-brains on Arbitrum'],
  inputSchema: z.object({ instruction: z.string() }),
  tools: [getWalletNftsTool, listCollectionsTool, getCollectionTool, getListingsByCollectionTool, getListingsByAssetTool, getOffersByAssetTool],
  mcpServers: {
    'opensea-arbitrum-mcp-server': {
      command: 'node',
      moduleName: '@vibekit/opensea-mcp-server',
      env: {
        ...process.env as any,
        OPENSEA_API_KEY: process.env.OPENSEA_API_KEY || ''
      },
      disabled: !process.env.OPENSEA_API_KEY
    }
  }
})


