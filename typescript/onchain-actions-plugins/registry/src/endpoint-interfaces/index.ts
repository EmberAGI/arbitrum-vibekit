import * as lending from './lending.js';
import * as liquidity from './liquidity.js';
import * as pagination from './pagination.js';
import * as perpetuals from './perpetuals.js';
import * as queries from './queries.js';
import * as swap from './swap.js';
import * as tokenizedYield from './tokenizedYield.js';

export namespace EndpointInterfaces {
  export const PaginatedPossibleResultsRequestSchema =
    pagination.PaginatedPossibleResultsRequestSchema;
  export type PaginatedPossibleResultsRequest =
    pagination.PaginatedPossibleResultsRequest;
  export const PaginatedPossibleResultsResponseSchema =
    pagination.PaginatedPossibleResultsResponseSchema;
  export type PaginatedPossibleResultsResponse =
    pagination.PaginatedPossibleResultsResponse;

  export const AmountTypeSchema = swap.AmountTypeSchema;
  export const CreateSwapRequestSchema = swap.CreateSwapRequestSchema;
  export type CreateSwapRequest = swap.CreateSwapRequest;
  export const PromptSwapRequestSchema = swap.PromptSwapRequestSchema;
  export const PossibleSwapsRequestSchema = swap.PossibleSwapsRequestSchema;
  export type PossibleSwapsRequest = swap.PossibleSwapsRequest;
  export const PossibleSwapOptionSchema = swap.PossibleSwapOptionSchema;
  export type PossibleSwapOption = swap.PossibleSwapOption;
  export const PossibleSwapsResponseSchema = swap.PossibleSwapsResponseSchema;
  export const CreateSwapEndpointRequestSchema =
    swap.CreateSwapEndpointRequestSchema;

  export const CreateLendingSupplyRequestSchema =
    lending.CreateLendingSupplyRequestSchema;
  export type CreateLendingSupplyRequest = lending.CreateLendingSupplyRequest;
  export const PromptLendingSupplyRequestSchema =
    lending.PromptLendingSupplyRequestSchema;
  export const PossibleLendingSupplyRequestSchema =
    lending.PossibleLendingSupplyRequestSchema;
  export type PossibleLendingSupplyRequest =
    lending.PossibleLendingSupplyRequest;
  export const PossibleLendingSupplyOptionSchema =
    lending.PossibleLendingSupplyOptionSchema;
  export type PossibleLendingSupplyOption = lending.PossibleLendingSupplyOption;
  export const PossibleLendingSupplyResponseSchema =
    lending.PossibleLendingSupplyResponseSchema;
  export const CreateSupplyEndpointRequestSchema =
    lending.CreateSupplyEndpointRequestSchema;

  export const CreateLendingBorrowRequestSchema =
    lending.CreateLendingBorrowRequestSchema;
  export type CreateLendingBorrowRequest = lending.CreateLendingBorrowRequest;
  export const PromptLendingBorrowRequestSchema =
    lending.PromptLendingBorrowRequestSchema;
  export const PossibleLendingBorrowRequestSchema =
    lending.PossibleLendingBorrowRequestSchema;
  export type PossibleLendingBorrowRequest =
    lending.PossibleLendingBorrowRequest;
  export const PossibleLendingBorrowOptionSchema =
    lending.PossibleLendingBorrowOptionSchema;
  export type PossibleLendingBorrowOption = lending.PossibleLendingBorrowOption;
  export const PossibleLendingBorrowResponseSchema =
    lending.PossibleLendingBorrowResponseSchema;
  export const CreateBorrowEndpointRequestSchema =
    lending.CreateBorrowEndpointRequestSchema;

  export const CreateLendingRepayRequestSchema =
    lending.CreateLendingRepayRequestSchema;
  export type CreateLendingRepayRequest = lending.CreateLendingRepayRequest;
  export const PromptLendingRepayRequestSchema =
    lending.PromptLendingRepayRequestSchema;
  export const PossibleLendingRepayRequestSchema =
    lending.PossibleLendingRepayRequestSchema;
  export type PossibleLendingRepayRequest = lending.PossibleLendingRepayRequest;
  export const PossibleLendingRepayOptionSchema =
    lending.PossibleLendingRepayOptionSchema;
  export type PossibleLendingRepayOption = lending.PossibleLendingRepayOption;
  export const PossibleLendingRepayResponseSchema =
    lending.PossibleLendingRepayResponseSchema;
  export const CreateRepayEndpointRequestSchema =
    lending.CreateRepayEndpointRequestSchema;

  export const CreateLendingWithdrawRequestSchema =
    lending.CreateLendingWithdrawRequestSchema;
  export type CreateLendingWithdrawRequest = lending.CreateLendingWithdrawRequest;
  export const PromptLendingWithdrawRequestSchema =
    lending.PromptLendingWithdrawRequestSchema;
  export const PossibleLendingWithdrawRequestSchema =
    lending.PossibleLendingWithdrawRequestSchema;
  export type PossibleLendingWithdrawRequest =
    lending.PossibleLendingWithdrawRequest;
  export const PossibleLendingWithdrawOptionSchema =
    lending.PossibleLendingWithdrawOptionSchema;
  export type PossibleLendingWithdrawOption =
    lending.PossibleLendingWithdrawOption;
  export const PossibleLendingWithdrawResponseSchema =
    lending.PossibleLendingWithdrawResponseSchema;
  export const CreateWithdrawEndpointRequestSchema =
    lending.CreateWithdrawEndpointRequestSchema;

  export const NonMappedPayableTokens = liquidity.NonMappedPayableTokens;
  export const CreateLiquiditySupplyRequestSchema =
    liquidity.CreateLiquiditySupplyRequestSchema;
  export type CreateLiquiditySupplyRequest =
    liquidity.CreateLiquiditySupplyRequest;
  export const CreateLiquiditySupplyPayableTokenSchema =
    liquidity.CreateLiquiditySupplyPayableTokenSchema;
  export const CreateLiquiditySupplyEndpointRequestSchema =
    liquidity.CreateLiquiditySupplyEndpointRequestSchema;

  export const CreateLiquidityWithdrawRequestSchema =
    liquidity.CreateLiquidityWithdrawRequestSchema;
  export type CreateLiquidityWithdrawRequest =
    liquidity.CreateLiquidityWithdrawRequest;
  export const PromptLiquidityWithdrawRequestSchema =
    liquidity.PromptLiquidityWithdrawRequestSchema;
  export const PossibleLiquidityWithdrawRequestSchema =
    liquidity.PossibleLiquidityWithdrawRequestSchema;
  export type PossibleLiquidityWithdrawRequest =
    liquidity.PossibleLiquidityWithdrawRequest;
  export const LiquidityWithdrawOptionSchema =
    liquidity.LiquidityWithdrawOptionSchema;
  export type LiquidityWithdrawOption = liquidity.LiquidityWithdrawOption;
  export const PossibleLiquidityWithdrawResponseSchema =
    liquidity.PossibleLiquidityWithdrawResponseSchema;
  export const CreateLiquidityWithdrawEndpointRequestSchema =
    liquidity.CreateLiquidityWithdrawEndpointRequestSchema;

  export const CreateTokenizedYieldBuyPtEndpointRequestSchema =
    tokenizedYield.CreateTokenizedYieldBuyPtEndpointRequestSchema;
  export const CreateTokenizedYieldBuyPtResponseSchema =
    tokenizedYield.CreateTokenizedYieldBuyPtResponseSchema;
  export type CreateTokenizedYieldBuyPtResponse =
    tokenizedYield.CreateTokenizedYieldBuyPtResponse;
  export const CreateTokenizedYieldBuyPtSchema =
    tokenizedYield.CreateTokenizedYieldBuyPtSchema;
  export type CreateTokenizedYieldBuyPt = tokenizedYield.CreateTokenizedYieldBuyPt;
  export const PromptTokenizedYieldBuyPtRequestSchema =
    tokenizedYield.PromptTokenizedYieldBuyPtRequestSchema;

  export const CreateTokenizedYieldBuyYtEndpointRequestSchema =
    tokenizedYield.CreateTokenizedYieldBuyYtEndpointRequestSchema;
  export const CreateTokenizedYieldBuyYtResponseSchema =
    tokenizedYield.CreateTokenizedYieldBuyYtResponseSchema;
  export type CreateTokenizedYieldBuyYtResponse =
    tokenizedYield.CreateTokenizedYieldBuyYtResponse;
  export const CreateTokenizedYieldBuyYtSchema =
    tokenizedYield.CreateTokenizedYieldBuyYtSchema;
  export type CreateTokenizedYieldBuyYt = tokenizedYield.CreateTokenizedYieldBuyYt;
  export const PromptTokenizedYieldBuyYtRequestSchema =
    tokenizedYield.PromptTokenizedYieldBuyYtRequestSchema;

  export const CreateTokenizedYieldSellPtEndpointRequestSchema =
    tokenizedYield.CreateTokenizedYieldSellPtEndpointRequestSchema;
  export const CreateTokenizedYieldSellPtResponseSchema =
    tokenizedYield.CreateTokenizedYieldSellPtResponseSchema;
  export type CreateTokenizedYieldSellPtResponse =
    tokenizedYield.CreateTokenizedYieldSellPtResponse;
  export const CreateTokenizedYieldSellPtSchema =
    tokenizedYield.CreateTokenizedYieldSellPtSchema;
  export type CreateTokenizedYieldSellPt = tokenizedYield.CreateTokenizedYieldSellPt;
  export const PromptTokenizedYieldSellPtRequestSchema =
    tokenizedYield.PromptTokenizedYieldSellPtRequestSchema;

  export const CreateTokenizedYieldSellYtEndpointRequestSchema =
    tokenizedYield.CreateTokenizedYieldSellYtEndpointRequestSchema;
  export const CreateTokenizedYieldSellYtResponseSchema =
    tokenizedYield.CreateTokenizedYieldSellYtResponseSchema;
  export type CreateTokenizedYieldSellYtResponse =
    tokenizedYield.CreateTokenizedYieldSellYtResponse;
  export const CreateTokenizedYieldSellYtSchema =
    tokenizedYield.CreateTokenizedYieldSellYtSchema;
  export type CreateTokenizedYieldSellYt = tokenizedYield.CreateTokenizedYieldSellYt;
  export const PromptTokenizedYieldSellYtRequestSchema =
    tokenizedYield.PromptTokenizedYieldSellYtRequestSchema;

  export const CreateTokenizedYieldMintPtAndYtEndpointRequestSchema =
    tokenizedYield.CreateTokenizedYieldMintPtAndYtEndpointRequestSchema;
  export const CreateTokenizedYieldMintPtAndYtResponseSchema =
    tokenizedYield.CreateTokenizedYieldMintPtAndYtResponseSchema;
  export type CreateTokenizedYieldMintPtAndYtResponse =
    tokenizedYield.CreateTokenizedYieldMintPtAndYtResponse;
  export const CreateTokenizedYieldMintPtAndYtSchema =
    tokenizedYield.CreateTokenizedYieldMintPtAndYtSchema;
  export type CreateTokenizedYieldMintPTAndYt =
    tokenizedYield.CreateTokenizedYieldMintPTAndYt;
  export const PromptTokenizedYieldMintPtAndYtRequestSchema =
    tokenizedYield.PromptTokenizedYieldMintPtAndYtRequestSchema;

  export const CreateTokenizedYieldRedeemPtEndpointRequestSchema =
    tokenizedYield.CreateTokenizedYieldRedeemPtEndpointRequestSchema;
  export const CreateTokenizedYieldRedeemPtResponseSchema =
    tokenizedYield.CreateTokenizedYieldRedeemPtResponseSchema;
  export type CreateTokenizedYieldRedeemPtResponse =
    tokenizedYield.CreateTokenizedYieldRedeemPtResponse;
  export const CreateTokenizedYieldRedeemPtSchema =
    tokenizedYield.CreateTokenizedYieldRedeemPtSchema;
  export type CreateTokenizedYieldRedeemPt =
    tokenizedYield.CreateTokenizedYieldRedeemPt;
  export const PromptTokenizedYieldRedeemPtRequestSchema =
    tokenizedYield.PromptTokenizedYieldRedeemPtRequestSchema;

  export const CreateTokenizedYieldClaimRewardsEndpointRequestSchema =
    tokenizedYield.CreateTokenizedYieldClaimRewardsEndpointRequestSchema;
  export const CreateTokenizedYieldClaimRewardsResponseSchema =
    tokenizedYield.CreateTokenizedYieldClaimRewardsResponseSchema;
  export type CreateTokenizedYieldClaimRewardsResponse =
    tokenizedYield.CreateTokenizedYieldClaimRewardsResponse;
  export const CreateTokenizedYieldClaimRewardsSchema =
    tokenizedYield.CreateTokenizedYieldClaimRewardsSchema;
  export type CreateTokenizedYieldClaimRewards =
    tokenizedYield.CreateTokenizedYieldClaimRewards;
  export const PromptTokenizedYieldClaimRewardsRequestSchema =
    tokenizedYield.PromptTokenizedYieldClaimRewardsRequestSchema;

  export const PerpetualsCreatePositionRequestSchema =
    perpetuals.PerpetualsCreatePositionRequestSchema;
  export type PerpetualsCreatePositionRequest =
    perpetuals.PerpetualsCreatePositionRequest;
  export const PerpetualsPositionPromptSchema =
    perpetuals.PerpetualsPositionPromptSchema;
  export const PossiblePerpetualPositionsRequestSchema =
    perpetuals.PossiblePerpetualPositionsRequestSchema;
  export type PossiblePerpetualPositionsRequest =
    perpetuals.PossiblePerpetualPositionsRequest;
  export const PossiblePerpetualPositionsOptionSchema =
    perpetuals.PossiblePerpetualPositionsOptionSchema;
  export type PossiblePerpetualPositionOption =
    perpetuals.PossiblePerpetualPositionOption;
  export const PossiblePerpetualPositionsResponseSchema =
    perpetuals.PossiblePerpetualPositionsResponseSchema;
  export type PossiblePerpetualPositionsResponse =
    perpetuals.PossiblePerpetualPositionsResponse;

  export const CreatePerpetualClosePositionRequestSchema =
    perpetuals.CreatePerpetualClosePositionRequestSchema;
  export type CreatePerpetualClosePositionRequest =
    perpetuals.CreatePerpetualClosePositionRequest;
  export const PerpetualsCloseOrderPromptSchema =
    perpetuals.PerpetualsCloseOrderPromptSchema;
  export const PossiblePerpetualCloseRequestSchema =
    perpetuals.PossiblePerpetualCloseRequestSchema;
  export type PossiblePerpetualCloseRequest =
    perpetuals.PossiblePerpetualCloseRequest;
  export const PositionDataSchema = perpetuals.PositionDataSchema;
  export const LimitOrderDataSchema = perpetuals.LimitOrderDataSchema;
  export const TradingPositionDataSchema = perpetuals.TradingPositionDataSchema;
  export const PerpetualCloseOptionSchema = perpetuals.PerpetualCloseOptionSchema;
  export type PerpetualCloseOption = perpetuals.PerpetualCloseOption;
  export const PossiblePerpetualCloseResponseSchema =
    perpetuals.PossiblePerpetualCloseResponseSchema;
  export const CreatePerpetualCloseSimplifiedEndpointRequestSchema =
    perpetuals.CreatePerpetualCloseSimplifiedEndpointRequestSchema;
  export type CreatePerpetualCloseSimplifiedEndpointRequest =
    perpetuals.CreatePerpetualCloseSimplifiedEndpointRequest;

  export const GetChainsRequestSchema = queries.GetChainsRequestSchema;
  export type GetChainsRequest = queries.GetChainsRequest;
  export const GetChainsResponseSchema = queries.GetChainsResponseSchema;
  export type GetChainsResponse = queries.GetChainsResponse;
  export const GetTokensRequestSchema = queries.GetTokensRequestSchema;
  export type GetTokensRequest = queries.GetTokensRequest;
  export const GetTokensResponseSchema = queries.GetTokensResponseSchema;
  export type GetTokensResponse = queries.GetTokensResponse;
  export const ProviderSchema = queries.ProviderSchema;
  export type Provider = queries.Provider;
  export const GetProvidersRequestSchema = queries.GetProvidersRequestSchema;
  export type GetProvidersRequest = queries.GetProvidersRequest;
  export const GetProvidersResponseSchema = queries.GetProvidersResponseSchema;
  export type GetProvidersResponse = queries.GetProvidersResponse;
  export const BalanceSchema = queries.BalanceSchema;
  export type Balance = queries.Balance;
  export const GetWalletBalancesRequestSchema =
    queries.GetWalletBalancesRequestSchema;
  export type GetWalletBalancesRequest = queries.GetWalletBalancesRequest;
  export const GetWalletBalancesResponseSchema =
    queries.GetWalletBalancesResponseSchema;
  export type GetWalletBalancesResponse = queries.GetWalletBalancesResponse;
}
