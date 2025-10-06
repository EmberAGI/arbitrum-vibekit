import { fetch } from 'undici';
import { z } from 'zod';
import type {
  NftPlugin,
  GetAssetParams,
  GetListingsParams,
  GetOffersParams,
  ListParams,
  BuyParams,
  OfferParams,
  CancelOfferParams,
  TransferParams,
  WrapParams,
  UnwrapParams,
  BulkCancelParams,
  NftPrimitive as NftPrimitiveType,
} from '@vibekit/onchain-actions-nft';

const BASE = process.env.OPENSEA_BASE_URL || 'https://api.opensea.io';

async function osFetch<T = unknown>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: {
      'x-api-key': process.env.OPENSEA_API_KEY || '',
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenSea API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export const OpenSeaPlugin: NftPlugin = {
  id: 'opensea',
  async getAsset(params: GetAssetParams): Promise<NftPrimitiveType> {
    const chain = params.chainId === 42161 ? 'arbitrum' : 'ethereum';
    const data = await osFetch<any>(`/api/v2/chain/${chain}/contract/${params.contractAddress}/nfts/${params.tokenId}`);
    return {
      contractAddress: params.contractAddress,
      tokenId: String(params.tokenId),
      tokenStandard: data?.nft?.token_standard === 'erc1155' ? 'ERC1155' : 'ERC721',
      owner: data?.nft?.owner ?? undefined,
      name: data?.nft?.name ?? undefined,
      description: data?.nft?.description ?? undefined,
      image: data?.nft?.image_url ?? undefined,
      collectionSlug: data?.nft?.collection?.slug ?? undefined,
      collectionName: data?.nft?.collection?.name ?? undefined,
      collectionVerified: Boolean(data?.nft?.collection?.is_verified),
      chainId: params.chainId,
    };
  },
  async getListings(params: GetListingsParams): Promise<any[]> {
    const chain = params.chainId === 42161 ? 'arbitrum' : 'ethereum';
    const res = await osFetch<any>(`/api/v2/orders/${chain}/seaport/listings`, {
      asset_contract_address: params.contractAddress,
      token_ids: String(params.tokenId),
    });
    return res?.orders ?? [];
  },
  async getOffers(params: GetOffersParams): Promise<any[]> {
    const chain = params.chainId === 42161 ? 'arbitrum' : 'ethereum';
    const res = await osFetch<any>(`/api/v2/orders/${chain}/seaport/offers`, {
      asset_contract_address: params.contractAddress,
      token_ids: String(params.tokenId),
    });
    return res?.orders ?? [];
  },
  async list(params: ListParams): Promise<any> {
    return { prepared: 'seaport-listing', params };
  },
  async buy(params: BuyParams): Promise<any> {
    return { prepared: 'seaport-buy', params };
  },
  async offer(params: OfferParams): Promise<any> {
    return { prepared: 'seaport-offer', params };
  },
  async cancelOffer(params: CancelOfferParams): Promise<any> {
    return { prepared: 'seaport-cancel-offer', params };
  },
  async transfer(params: TransferParams): Promise<any> {
    return { prepared: 'nft-transfer', params };
  },
  async wrap(params: WrapParams): Promise<any> {
    return { prepared: 'wrap-weth', params };
  },
  async unwrap(params: UnwrapParams): Promise<any> {
    return { prepared: 'unwrap-weth', params };
  },
  async bulkCancel(params: BulkCancelParams): Promise<any> {
    return { prepared: 'bulk-cancel', params };
  },
};

export default OpenSeaPlugin;


