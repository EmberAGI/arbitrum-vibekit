import type {
  GetPerpetualsMarketsOrdersRequest,
  GetPerpetualsMarketsOrdersResponse,
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

export type PerpetualsQueries = {
  getMarkets: PerpetualsGetMarkets;
  getPositions: PerpetualsGetPositions;
  getOrders: PerpetualsGetOrders;
};
