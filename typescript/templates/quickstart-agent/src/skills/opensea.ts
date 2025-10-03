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

// Write actions tools
const ApproveTokenParams = z.object({
  contract_address: z.string().describe('NFT contract address to approve'),
  token_type: z.enum(['erc721', 'erc1155']).optional().default('erc721').describe('Token standard'),
  operator: z.string().optional().describe('Address to approve (defaults to OpenSea conduit)'),
})
const approveTokenTool: VibkitToolDefinition<typeof ApproveTokenParams> = {
  name: 'approve-token',
  description: 'Approve NFT contract for trading on OpenSea (Arbitrum only)',
  parameters: ApproveTokenParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'approve_token', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

const ListNftParams = z.object({
  contract_address: z.string().describe('NFT contract address'),
  token_id: z.union([z.string(), z.number()]).describe('Token ID to list'),
  price: z.string().describe('Listing price in ETH'),
  duration: z.number().optional().default(30).describe('Listing duration in days'),
  currency: z.string().optional().default('0x0000000000000000000000000000000000000000').describe('Payment token address'),
})
const listNftTool: VibkitToolDefinition<typeof ListNftParams> = {
  name: 'list-nft',
  description: 'Create a fixed-price listing for an NFT on OpenSea (Arbitrum only)',
  parameters: ListNftParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'list_nft', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

const BuyNftParams = z.object({
  contract_address: z.string().describe('NFT contract address'),
  token_id: z.union([z.string(), z.number()]).describe('Token ID to buy'),
  max_price: z.string().optional().describe('Maximum price willing to pay in ETH'),
  currency: z.string().optional().default('0x0000000000000000000000000000000000000000').describe('Payment token address'),
})
const buyNftTool: VibkitToolDefinition<typeof BuyNftParams> = {
  name: 'buy-nft',
  description: 'Purchase a listed NFT on OpenSea (Arbitrum only)',
  parameters: BuyNftParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'buy_nft', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

// Phase 2 tools
const MakeOfferParams = z.object({
  contract_address: z.string().describe('NFT contract address'),
  token_id: z.union([z.string(), z.number()]).optional().describe('Token ID (optional for collection offers)'),
  price: z.string().describe('Offer price in ETH'),
  duration: z.number().optional().default(7).describe('Offer duration in days'),
  offer_type: z.enum(['asset', 'collection']).optional().default('asset').describe('Offer type: asset or collection'),
  currency: z.string().optional().default('0x0000000000000000000000000000000000000000').describe('Payment token address'),
})
const makeOfferTool: VibkitToolDefinition<typeof MakeOfferParams> = {
  name: 'make-offer',
  description: 'Create an offer for an NFT asset or collection on OpenSea (Arbitrum only)',
  parameters: MakeOfferParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'make_offer', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

const CancelOfferParams = z.object({
  contract_address: z.string().describe('NFT contract address'),
  token_id: z.union([z.string(), z.number()]).optional().describe('Token ID (optional for collection offers)'),
  offer_id: z.string().describe('Offer ID to cancel'),
})
const cancelOfferTool: VibkitToolDefinition<typeof CancelOfferParams> = {
  name: 'cancel-offer',
  description: 'Cancel an existing offer on OpenSea (Arbitrum only)',
  parameters: CancelOfferParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'cancel_offer', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

const TransferNftParams = z.object({
  contract_address: z.string().describe('NFT contract address'),
  token_id: z.union([z.string(), z.number()]).describe('Token ID to transfer'),
  to_address: z.string().describe('Recipient wallet address'),
  from_address: z.string().optional().describe('Sender wallet address (if different from signer)'),
})
const transferNftTool: VibkitToolDefinition<typeof TransferNftParams> = {
  name: 'transfer-nft',
  description: 'Transfer an NFT to another wallet on Arbitrum',
  parameters: TransferNftParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'transfer_nft', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

const WrapWethParams = z.object({
  amount: z.string().describe('Amount of ETH to wrap (e.g., "1.0")'),
})
const wrapWethTool: VibkitToolDefinition<typeof WrapWethParams> = {
  name: 'wrap-weth',
  description: 'Wrap ETH to WETH on Arbitrum',
  parameters: WrapWethParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'wrap_weth', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

const UnwrapWethParams = z.object({
  amount: z.string().describe('Amount of WETH to unwrap (e.g., "1.0")'),
})
const unwrapWethTool: VibkitToolDefinition<typeof UnwrapWethParams> = {
  name: 'unwrap-weth',
  description: 'Unwrap WETH to ETH on Arbitrum',
  parameters: UnwrapWethParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'unwrap_weth', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

const BulkCancelParams = z.object({
  order_ids: z.array(z.string()).describe('Array of order IDs to cancel'),
  order_type: z.enum(['listings', 'offers', 'all']).optional().default('all').describe('Type of orders to cancel'),
})
const bulkCancelTool: VibkitToolDefinition<typeof BulkCancelParams> = {
  name: 'bulk-cancel',
  description: 'Cancel multiple orders at once on OpenSea (Arbitrum only)',
  parameters: BulkCancelParams,
  execute: async (args, context) => {
    const client = context.mcpClients?.['opensea-actions-mcp-server']
    if (!client) throw new Error('OpenSea Actions MCP client not available')
    const res = await client.callTool({ name: 'bulk_cancel', arguments: args as any })
    return createSuccessTask('opensea-actions', undefined, JSON.stringify(res))
  }
}

// Read-only skill (unchanged)
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

// Write actions skill (complete with Phase 1 & 2)
export const openseaActionsSkill = defineSkill({
  id: 'opensea-arbitrum-actions',
  name: 'OpenSea Arbitrum (Actions)',
  description: 'Execute NFT trading actions on Arbitrum (approvals, listings, purchases, offers, transfers, WETH operations)',
  tags: ['nft', 'opensea', 'arbitrum', 'trading'],
  examples: [
    'Approve NFT contract for trading',
    'List NFT for 1 ETH',
    'Buy NFT from listing',
    'Make offer on NFT',
    'Cancel offer',
    'Transfer NFT to another wallet',
    'Wrap ETH to WETH',
    'Unwrap WETH to ETH',
    'Bulk cancel orders'
  ],
  inputSchema: z.object({ instruction: z.string() }),
  tools: [
    approveTokenTool,
    listNftTool,
    buyNftTool,
    makeOfferTool,
    cancelOfferTool,
    transferNftTool,
    wrapWethTool,
    unwrapWethTool,
    bulkCancelTool
  ],
  mcpServers: {
    'opensea-actions-mcp-server': {
      command: 'node',
      moduleName: '@vibekit/opensea-actions-mcp-server',
      env: {
        ...process.env as any,
        ARBITRUM_RPC_URL: process.env.ARBITRUM_RPC_URL || 'https://arbitrum.llamarpc.com',
        ENABLE_OPENSEA_WRITE: process.env.ENABLE_OPENSEA_WRITE || 'false'
      },
      disabled: !process.env.ARBITRUM_RPC_URL
    }
  }
})


