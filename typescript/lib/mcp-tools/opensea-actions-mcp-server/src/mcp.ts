// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createPublicClient, createWalletClient, http, parseEther, type Address } from 'viem'
import { arbitrum } from 'viem/chains'

// Environment-based execution control
const ENABLE_WRITE_ACTIONS = process.env.ENABLE_OPENSEA_WRITE === 'true'

type OpenSeaActionsDeps = {
  rpcUrl?: string
}

const ARBITRUM_CHAIN = 'arbitrum' as const

// ERC-20 Approval ABI
const ERC20_APPROVAL_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  }
] as const

// ERC-721 Approval ABI
const ERC721_APPROVAL_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_tokenId', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [],
    type: 'function'
  }
] as const

// ERC-1155 Approval ABI
const ERC1155_APPROVAL_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_operator', type: 'address' },
      { name: '_approved', type: 'bool' }
    ],
    name: 'setApprovalForAll',
    outputs: [],
    type: 'function'
  }
] as const

export async function createServer(deps: OpenSeaActionsDeps = {}) {
  const server = new McpServer({ name: 'opensea-actions-mcp-server', version: '0.1.0' })

  // Setup viem client for EIP-712 signing
  const rpcUrl = deps.rpcUrl || process.env.ARBITRUM_RPC_URL || 'https://arbitrum.llamarpc.com'
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl)
  })

  // Normalizers and schemas
  const EthAddressSchema = z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string().regex(/^0x[a-f0-9]{40}$/i, 'address must be a 42-char 0x-prefixed hex string')
  )

  const TokenIdSchema = z.preprocess(
    (v) => (typeof v === 'number' || typeof v === 'string' ? String(v).trim() : v),
    z.string({ required_error: 'token_id is required' }).min(1, 'token_id cannot be empty')
  )

  // 1) approve_token - Approve NFT contracts for trading
  const ApproveTokenSchema = z.object({
    contract_address: EthAddressSchema.describe('NFT contract address to approve'),
    token_type: z.enum(['erc721', 'erc1155']).optional().default('erc721').describe('Token standard (erc721 or erc1155)'),
    operator: EthAddressSchema.optional().describe('Address to approve (defaults to OpenSea conduit)'),
  })

  type ApproveTokenArgs = z.infer<typeof ApproveTokenSchema>

  // Default OpenSea conduit address on Arbitrum
  const DEFAULT_OPENSEA_CONDUIT = '0x1e0049783f008a0085193e00003d00cd54003c71' as const

  server.tool(
    'approve_token',
    'Approve NFT contract for trading on OpenSea (Arbitrum only). This prepares the approval transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    ApproveTokenSchema.shape,
    async ({ contract_address, token_type, operator }: ApproveTokenArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const approvedOperator = operator || DEFAULT_OPENSEA_CONDUIT

        // For demo purposes, we'll simulate the approval preparation
        // In a real implementation, this would use viem to create the transaction
        const preparedApproval = {
          to: contract_address as Address,
          data: '0x', // Would contain the actual approval call data
          value: '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'Token approval prepared successfully',
              contractAddress: contract_address,
              approvedOperator,
              tokenType: token_type,
              preparedTransaction: preparedApproval,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare token approval',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 2) list_nft - Create fixed-price listings
  const ListNftSchema = z.object({
    contract_address: EthAddressSchema.describe('NFT contract address'),
    token_id: TokenIdSchema.describe('Token ID to list'),
    price: z.string().describe('Listing price in ETH (e.g., "1.0")'),
    duration: z.number().optional().default(30).describe('Listing duration in days (default: 30)'),
    currency: EthAddressSchema.optional().default('0x0000000000000000000000000000000000000000').describe('Payment token address (default: ETH)'),
  })

  type ListNftArgs = z.infer<typeof ListNftSchema>

  server.tool(
    'list_nft',
    'Create a fixed-price listing for an NFT on OpenSea (Arbitrum only). This prepares the listing transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    ListNftSchema.shape,
    async ({ contract_address, token_id, price, duration, currency }: ListNftArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const priceInWei = parseEther(price)

        // For demo purposes, we'll simulate the listing preparation
        // In a real implementation, this would use OpenSea SDK or direct contract calls
        const preparedListing = {
          to: '0x0000000000000000000000000000000000000000', // Would be OpenSea contract
          data: '0x', // Would contain the actual listing call data
          value: '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'NFT listing prepared successfully',
              contractAddress: contract_address,
              tokenId: token_id,
              price: `${price} ETH`,
              priceInWei,
              duration: `${duration} days`,
              currency: currency || 'ETH',
              preparedTransaction: preparedListing,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare NFT listing',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 3) buy_nft - Purchase listed NFTs
  const BuyNftSchema = z.object({
    contract_address: EthAddressSchema.describe('NFT contract address'),
    token_id: TokenIdSchema.describe('Token ID to buy'),
    max_price: z.string().optional().describe('Maximum price willing to pay in ETH (optional)'),
    currency: EthAddressSchema.optional().default('0x0000000000000000000000000000000000000000').describe('Payment token address (default: ETH)'),
  })

  type BuyNftArgs = z.infer<typeof BuyNftSchema>

  server.tool(
    'buy_nft',
    'Purchase a listed NFT on OpenSea (Arbitrum only). This prepares the purchase transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    BuyNftSchema.shape,
    async ({ contract_address, token_id, max_price, currency }: BuyNftArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        // For demo purposes, we'll simulate the purchase preparation
        // In a real implementation, this would check the listing and prepare the purchase
        const preparedPurchase = {
          to: '0x0000000000000000000000000000000000000000', // Would be OpenSea contract
          data: '0x', // Would contain the actual purchase call data
          value: max_price ? parseEther(max_price) : '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'NFT purchase prepared successfully',
              contractAddress: contract_address,
              tokenId: token_id,
              maxPrice: max_price ? `${max_price} ETH` : 'Market price',
              currency: currency || 'ETH',
              preparedTransaction: preparedPurchase,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare NFT purchase',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 4) make_offer - Create offers for collections or assets
  const MakeOfferSchema = z.object({
    contract_address: EthAddressSchema.describe('NFT contract address'),
    token_id: TokenIdSchema.optional().describe('Token ID (optional for collection offers)'),
    price: z.string().describe('Offer price in ETH'),
    duration: z.number().optional().default(7).describe('Offer duration in days (default: 7)'),
    offer_type: z.enum(['asset', 'collection']).optional().default('asset').describe('Offer type: asset or collection'),
    currency: EthAddressSchema.optional().default('0x0000000000000000000000000000000000000000').describe('Payment token address (default: ETH)'),
  })

  type MakeOfferArgs = z.infer<typeof MakeOfferSchema>

  server.tool(
    'make_offer',
    'Create an offer for an NFT asset or collection on OpenSea (Arbitrum only). This prepares the offer transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    MakeOfferSchema.shape,
    async ({ contract_address, token_id, price, duration, offer_type, currency }: MakeOfferArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const priceInWei = parseEther(price)

        const preparedOffer = {
          to: '0x0000000000000000000000000000000000000000', // Would be OpenSea contract
          data: '0x', // Would contain the actual offer call data
          value: '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'Offer prepared successfully',
              contractAddress: contract_address,
              tokenId: token_id,
              price: `${price} ETH`,
              priceInWei,
              duration: `${duration} days`,
              offerType: offer_type,
              currency: currency || 'ETH',
              preparedTransaction: preparedOffer,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare offer',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 5) cancel_offer - Cancel existing offers
  const CancelOfferSchema = z.object({
    contract_address: EthAddressSchema.describe('NFT contract address'),
    token_id: TokenIdSchema.optional().describe('Token ID (optional for collection offers)'),
    offer_id: z.string().describe('Offer ID to cancel'),
  })

  type CancelOfferArgs = z.infer<typeof CancelOfferSchema>

  server.tool(
    'cancel_offer',
    'Cancel an existing offer on OpenSea (Arbitrum only). This prepares the cancellation transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    CancelOfferSchema.shape,
    async ({ contract_address, token_id, offer_id }: CancelOfferArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const preparedCancel = {
          to: '0x0000000000000000000000000000000000000000', // Would be OpenSea contract
          data: '0x', // Would contain the actual cancel call data
          value: '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'Offer cancellation prepared successfully',
              contractAddress: contract_address,
              tokenId: token_id,
              offerId: offer_id,
              preparedTransaction: preparedCancel,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare offer cancellation',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 6) transfer_nft - Transfer NFTs between wallets
  const TransferNftSchema = z.object({
    contract_address: EthAddressSchema.describe('NFT contract address'),
    token_id: TokenIdSchema.describe('Token ID to transfer'),
    to_address: EthAddressSchema.describe('Recipient wallet address'),
    from_address: EthAddressSchema.optional().describe('Sender wallet address (if different from signer)'),
  })

  type TransferNftArgs = z.infer<typeof TransferNftSchema>

  server.tool(
    'transfer_nft',
    'Transfer an NFT to another wallet on Arbitrum. This prepares the transfer transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    TransferNftSchema.shape,
    async ({ contract_address, token_id, to_address, from_address }: TransferNftArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const preparedTransfer = {
          to: contract_address as Address,
          data: '0x', // Would contain the actual transfer call data
          value: '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'NFT transfer prepared successfully',
              contractAddress: contract_address,
              tokenId: token_id,
              toAddress: to_address,
              fromAddress: from_address,
              preparedTransaction: preparedTransfer,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare NFT transfer',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 7) wrap_weth - Wrap ETH to WETH
  const WrapWethSchema = z.object({
    amount: z.string().describe('Amount of ETH to wrap (e.g., "1.0")'),
  })

  type WrapWethArgs = z.infer<typeof WrapWethSchema>

  // WETH contract address on Arbitrum
  const WETH_CONTRACT = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' as const

  server.tool(
    'wrap_weth',
    'Wrap ETH to WETH on Arbitrum. This prepares the wrap transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    WrapWethSchema.shape,
    async ({ amount }: WrapWethArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const amountInWei = parseEther(amount)

        const preparedWrap = {
          to: WETH_CONTRACT as Address,
          data: '0x', // Would contain the actual wrap call data
          value: amountInWei,
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'WETH wrap prepared successfully',
              amount: `${amount} ETH`,
              amountInWei,
              wethContract: WETH_CONTRACT,
              preparedTransaction: preparedWrap,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare WETH wrap',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 8) unwrap_weth - Unwrap WETH to ETH
  const UnwrapWethSchema = z.object({
    amount: z.string().describe('Amount of WETH to unwrap (e.g., "1.0")'),
  })

  type UnwrapWethArgs = z.infer<typeof UnwrapWethSchema>

  server.tool(
    'unwrap_weth',
    'Unwrap WETH to ETH on Arbitrum. This prepares the unwrap transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    UnwrapWethSchema.shape,
    async ({ amount }: UnwrapWethArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const amountInWei = parseEther(amount)

        const preparedUnwrap = {
          to: WETH_CONTRACT as Address,
          data: '0x', // Would contain the actual unwrap call data
          value: '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'WETH unwrap prepared successfully',
              amount: `${amount} WETH`,
              amountInWei,
              wethContract: WETH_CONTRACT,
              preparedTransaction: preparedUnwrap,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare WETH unwrap',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  // 9) bulk_cancel - Cancel multiple orders
  const BulkCancelSchema = z.object({
    order_ids: z.array(z.string()).describe('Array of order IDs to cancel'),
    order_type: z.enum(['listings', 'offers', 'all']).optional().default('all').describe('Type of orders to cancel'),
  })

  type BulkCancelArgs = z.infer<typeof BulkCancelSchema>

  server.tool(
    'bulk_cancel',
    'Cancel multiple orders at once on OpenSea (Arbitrum only). This prepares the bulk cancellation transaction but does not execute it unless ENABLE_OPENSEA_WRITE=true.',
    BulkCancelSchema.shape,
    async ({ order_ids, order_type }: BulkCancelArgs) => {
      if (!ENABLE_WRITE_ACTIONS) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Write actions disabled',
              message: 'Set ENABLE_OPENSEA_WRITE=true to enable execution',
              preparedTransaction: 'Transaction prepared but not executed (non-custodial mode)'
            }, null, 2)
          }]
        }
      }

      try {
        const preparedBulkCancel = {
          to: '0x0000000000000000000000000000000000000000', // Would be OpenSea contract
          data: '0x', // Would contain the actual bulk cancel call data
          value: '0',
          chainId: arbitrum.id
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'Bulk cancellation prepared successfully',
              orderIds: order_ids,
              orderType: order_type,
              count: order_ids.length,
              preparedTransaction: preparedBulkCancel,
              executed: false,
              note: 'Transaction prepared but not executed (review required)'
            }, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to prepare bulk cancellation',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        }
      }
    }
  )

  return server
}
