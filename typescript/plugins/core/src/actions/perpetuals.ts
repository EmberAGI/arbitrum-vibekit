import type {
  ClosePerpetualsOrdersRequest,
  ClosePerpetualsOrdersResponse,
  CreatePerpetualsPositionRequest,
  CreatePerpetualsPositionResponse,
} from 'ember-schemas';

export type PerpetualsCreateShortPositionCallback = (
  request: CreatePerpetualsPositionRequest
) => Promise<CreatePerpetualsPositionResponse>;

export type PerpetualsCreateLongPositionCallback = (
  request: CreatePerpetualsPositionRequest
) => Promise<CreatePerpetualsPositionResponse>;

export type PerpetualsCloseOrdersCallback = (
  request: ClosePerpetualsOrdersRequest
) => Promise<ClosePerpetualsOrdersResponse>;

export type PerpetualsActions = 'perpetuals-short' | 'perpetuals-long' | 'perpetuals-close';
