import type {
  GetPerpetualsMarketsOrdersRequest,
  GetPerpetualsMarketsOrdersResponse,
  GetPerpetualLifecycleRequest,
  GetPerpetualLifecycleResponse,
  GetPerpetualsMarketsPositionsRequest,
  GetPerpetualsMarketsPositionsResponse,
  GetPerpetualsMarketsRequest,
  GetPerpetualsMarketsResponse,
} from '../schemas/perpetuals.js';

export type PerpetualsGetMarkets = (
  request: GetPerpetualsMarketsRequest
) => Promise<GetPerpetualsMarketsResponse>;

export type PerpetualsGetPositions = (
  request: GetPerpetualsMarketsPositionsRequest
) => Promise<GetPerpetualsMarketsPositionsResponse>;

export type PerpetualsGetOrders = (
  request: GetPerpetualsMarketsOrdersRequest
) => Promise<GetPerpetualsMarketsOrdersResponse>;

export type PerpetualsGetLifecycle = (
  request: GetPerpetualLifecycleRequest
) => Promise<GetPerpetualLifecycleResponse>;

export const PerpetualsQueryKeys = [
  'getMarkets',
  'getPositions',
  'getOrders',
  'getLifecycle',
] as const;

export type PerpetualsQueries = {
  getMarkets: PerpetualsGetMarkets;
  getPositions: PerpetualsGetPositions;
  getOrders: PerpetualsGetOrders;
  getLifecycle: PerpetualsGetLifecycle;
};
