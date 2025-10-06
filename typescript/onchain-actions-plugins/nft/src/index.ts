import { z } from 'zod';

export const EthAddress = z
  .string()
  .transform(v => v.trim())
  .refine(v => /^0x[a-fA-F0-9]{40}$/.test(v), 'Invalid address');

export const TokenId = z.union([z.string(), z.number()]).transform(v => String(v));

export const ChainId = z.number();

export const NftPrimitive = z.object({
  contractAddress: EthAddress,
  tokenId: TokenId,
  tokenStandard: z.enum(['ERC721', 'ERC1155']),
  owner: EthAddress.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  attributes: z
    .array(
      z.object({
        trait_type: z.string(),
        value: z.union([z.string(), z.number()]),
      })
    )
    .optional(),
  isListed: z.boolean().optional(),
  isOffered: z.boolean().optional(),
  currentPrice: z.string().optional(),
  floorPrice: z.string().optional(),
  lastSalePrice: z.string().optional(),
  offerPrice: z.string().optional(),
  collectionSlug: z.string().optional(),
  collectionName: z.string().optional(),
  collectionVerified: z.boolean().optional(),
  chainId: ChainId,
});

export type NftPrimitive = z.infer<typeof NftPrimitive>;

// Read interfaces
export const GetAssetParams = z.object({
  contractAddress: EthAddress,
  tokenId: TokenId,
  chainId: ChainId,
});
export type GetAssetParams = z.infer<typeof GetAssetParams>;

export const GetListingsParams = GetAssetParams;
export type GetListingsParams = z.infer<typeof GetListingsParams>;

export const GetOffersParams = GetAssetParams;
export type GetOffersParams = z.infer<typeof GetOffersParams>;

// Write interfaces
export const ListParams = z.object({
  contractAddress: EthAddress,
  tokenId: TokenId,
  chainId: ChainId,
  price: z.string(),
  currency: z.string().default('ETH'),
});
export type ListParams = z.infer<typeof ListParams>;

export const BuyParams = z.object({
  contractAddress: EthAddress,
  tokenId: TokenId,
  chainId: ChainId,
  price: z.string(),
});
export type BuyParams = z.infer<typeof BuyParams>;

export const OfferParams = z.object({
  contractAddress: EthAddress,
  tokenId: TokenId,
  chainId: ChainId,
  price: z.string(),
  currency: z.string().default('WETH'),
});
export type OfferParams = z.infer<typeof OfferParams>;

export const CancelOfferParams = z.object({
  chainId: ChainId,
  offerId: z.string(),
});
export type CancelOfferParams = z.infer<typeof CancelOfferParams>;

export const TransferParams = z.object({
  contractAddress: EthAddress,
  tokenId: TokenId,
  chainId: ChainId,
  to: EthAddress,
});
export type TransferParams = z.infer<typeof TransferParams>;

export const WrapParams = z.object({ amount: z.string(), chainId: ChainId });
export type WrapParams = z.infer<typeof WrapParams>;
export const UnwrapParams = WrapParams;
export type UnwrapParams = z.infer<typeof UnwrapParams>;

export const BulkCancelParams = z.object({
  chainId: ChainId,
  orderIds: z.array(z.string()).min(1),
});
export type BulkCancelParams = z.infer<typeof BulkCancelParams>;

// Registry
export interface NftPlugin {
  id: string;
  getAsset(params: GetAssetParams): Promise<NftPrimitive>;
  getListings(params: GetListingsParams): Promise<any[]>;
  getOffers(params: GetOffersParams): Promise<any[]>;
  list(params: ListParams): Promise<any>;
  buy(params: BuyParams): Promise<any>;
  offer(params: OfferParams): Promise<any>;
  cancelOffer(params: CancelOfferParams): Promise<any>;
  transfer(params: TransferParams): Promise<any>;
  wrap(params: WrapParams): Promise<any>;
  unwrap(params: UnwrapParams): Promise<any>;
  bulkCancel(params: BulkCancelParams): Promise<any>;
}

const registry = new Map<string, NftPlugin>();

export function registerNftPlugin(plugin: NftPlugin): void {
  registry.set(plugin.id, plugin);
}

export function getNftPlugin(id: string): NftPlugin | undefined {
  return registry.get(id);
}


