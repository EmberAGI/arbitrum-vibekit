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
  SellPtResponse,
  SellYtResponse,
} from '../schemas/tokenizedYield.js';

export type TokenizedYieldMintPtAndYtCallback = (
  request: MintPtAndYtRequest,
) => Promise<MintPtAndYtResponse>;

export type TokenizedYieldBuyPtCallback = (request: BuyPtRequest) => Promise<BuyPtResponse>;

export type TokenizedYieldBuyYtCallback = (request: BuyYtRequest) => Promise<BuyYtResponse>;

export type TokenizedYieldSellPtCallback = (request: SellPtRequest) => Promise<SellPtResponse>;

export type TokenizedYieldSellYtCallback = (request: SellYtRequest) => Promise<SellYtResponse>;

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
