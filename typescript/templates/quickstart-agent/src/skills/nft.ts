import { defineSkill, createSuccessTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core'
import { z } from 'zod'
import { getNftPlugin } from '@vibekit/onchain-actions-nft'

const GetAssetParams = z.object({
  plugin: z.enum(['opensea', 'magic-eden']).default('opensea'),
  contractAddress: z.string(),
  tokenId: z.union([z.string(), z.number()]),
  chainId: z.number().default(42161)
})

const getAssetTool: VibkitToolDefinition<typeof GetAssetParams> = {
  name: 'get-asset',
  description: 'Fetch NFT asset via plugin registry',
  parameters: GetAssetParams,
  execute: async (args) => {
    const plugin = getNftPlugin(args.plugin)
    if (!plugin) throw new Error(`NFT plugin not registered: ${args.plugin}`)
    const asset = await plugin.getAsset({
      contractAddress: args.contractAddress,
      tokenId: String(args.tokenId),
      chainId: args.chainId
    })
    return createSuccessTask('nft', undefined, JSON.stringify(asset))
  }
}

export const nftSkill = defineSkill({
  id: 'nft-plugin-skill',
  name: 'NFT Plugin Skill',
  description: 'Use NFT plugin registry (OpenSea, Magic Eden) to fetch NFTs',
  tags: ['nft', 'plugins'],
  examples: ['Fetch an NFT asset via OpenSea plugin'],
  inputSchema: z.object({ instruction: z.string() }),
  tools: [getAssetTool]
})


