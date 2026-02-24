import type {
  CreatePerpetualsDecreasePlanRequest,
  CreatePerpetualsDecreasePlanResponse,
  CreatePerpetualsDecreaseQuoteRequest,
  CreatePerpetualsDecreaseQuoteResponse,
  CreatePerpetualsIncreasePlanRequest,
  CreatePerpetualsIncreasePlanResponse,
  CreatePerpetualsIncreaseQuoteRequest,
  CreatePerpetualsIncreaseQuoteResponse,
  CreatePerpetualsOrderCancelPlanRequest,
  CreatePerpetualsOrderCancelPlanResponse,
} from '../schemas/perpetuals.js';

export type PerpetualsIncreaseQuoteCallback = (
  request: CreatePerpetualsIncreaseQuoteRequest
) => Promise<CreatePerpetualsIncreaseQuoteResponse>;

export type PerpetualsIncreasePlanCallback = (
  request: CreatePerpetualsIncreasePlanRequest
) => Promise<CreatePerpetualsIncreasePlanResponse>;

export type PerpetualsDecreaseQuoteCallback = (
  request: CreatePerpetualsDecreaseQuoteRequest
) => Promise<CreatePerpetualsDecreaseQuoteResponse>;

export type PerpetualsDecreasePlanCallback = (
  request: CreatePerpetualsDecreasePlanRequest
) => Promise<CreatePerpetualsDecreasePlanResponse>;

export type PerpetualsOrderCancelPlanCallback = (
  request: CreatePerpetualsOrderCancelPlanRequest
) => Promise<CreatePerpetualsOrderCancelPlanResponse>;

export const PerpetualsActionTypes = [
  'perpetuals-increase-quote',
  'perpetuals-increase-plan',
  'perpetuals-decrease-quote',
  'perpetuals-decrease-plan',
  'perpetuals-orders-cancel-plan',
] as const;

export type PerpetualsActions = (typeof PerpetualsActionTypes)[number];
