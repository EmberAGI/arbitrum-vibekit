import type {
  MintPtAndYtRequest,
  MintPtAndYtResponse,
  BuyPtRequest,
  BuyPtResponse,
  BuyYtRequest,
  BuyYtResponse,
  SellPtRequest,
  SellYtRequest,
  ClaimRewardsRequest,
  ClaimRewardsResponse,
  RedeemPtRequest,
  RedeemPtResponse,
} from '../schemas/tokenizedYield.js';

// NOTE: Sell PT / Sell YT currently have only request schemas. If/when response schemas
// are introduced they should replace the void return types below for stronger typing.

export type TokenizedYieldMintPtAndYtCallback = (
  request: MintPtAndYtRequest,
) => Promise<MintPtAndYtResponse>;

export type TokenizedYieldBuyPtCallback = (request: BuyPtRequest) => Promise<BuyPtResponse>;

export type TokenizedYieldBuyYtCallback = (request: BuyYtRequest) => Promise<BuyYtResponse>;

export type TokenizedYieldSellPtCallback = (request: SellPtRequest) => Promise<void>; // placeholder until SellPt response schema exists

export type TokenizedYieldSellYtCallback = (request: SellYtRequest) => Promise<void>; // placeholder until SellYt response schema exists

export type TokenizedYieldClaimRewardsCallback = (
  request: ClaimRewardsRequest,
) => Promise<ClaimRewardsResponse>;

export type TokenizedYieldRedeemPtCallback = (
  request: RedeemPtRequest,
) => Promise<RedeemPtResponse>;

export type TokenizedYieldActions =
  | 'tokenizedYield-mintPtAndYt'
  | 'tokenizedYield-buyPt'
  | 'tokenizedYield-buyYt'
  | 'tokenizedYield-sellPt'
  | 'tokenizedYield-sellYt'
  | 'tokenizedYield-claimRewards'
  | 'tokenizedYield-redeemPt';
