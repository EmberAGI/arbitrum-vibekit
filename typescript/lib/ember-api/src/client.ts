import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parseMcpToolResponse } from "ember-schemas";
import type { z } from "zod";
import {
  // Import response schemas for validation (as values)
  GetChainsResponseSchema,
  GetTokensResponseSchema,
  GetCapabilitiesResponseSchema,
  SwapTokensResponseSchema,
  BorrowTokensResponseSchema,
  RepayTokensResponseSchema,
  SupplyTokensResponseSchema,
  WithdrawTokensResponseSchema,
  SupplyLiquidityResponseSchema,
  WithdrawLiquidityResponseSchema,
  GetWalletPositionsResponseSchema,
  GetUserLiquidityPositionsResponseSchema,
  GetWalletBalancesResponseSchema,
  GetYieldMarketsResponseSchema,
  GetLiquidityPoolsResponseSchema,
  GetProviderTrackingStatusResponseSchema,
  GetMarketDataResponseSchema,
} from "./schemas/index.js";
import type {
  GetChainsRequest,
  GetChainsResponse,
  GetTokensRequest,
  GetTokensResponse,
  GetCapabilitiesRequest,
  GetCapabilitiesResponse,
  SwapTokensRequest,
  SwapTokensResponse,
  BorrowTokensRequest,
  BorrowTokensResponse,
  RepayTokensRequest,
  RepayTokensResponse,
  SupplyTokensRequest,
  SupplyTokensResponse,
  WithdrawTokensRequest,
  WithdrawTokensResponse,
  SupplyLiquidityRequest,
  SupplyLiquidityResponse,
  WithdrawLiquidityRequest,
  WithdrawLiquidityResponse,
  GetWalletPositionsRequest,
  GetWalletPositionsResponse,
  GetUserLiquidityPositionsRequest,
  GetUserLiquidityPositionsResponse,
  GetWalletBalancesRequest,
  GetWalletBalancesResponse,
  GetYieldMarketsRequest,
  GetYieldMarketsResponse,
  GetLiquidityPoolsResponse,
  GetProviderTrackingStatusRequest,
  GetProviderTrackingStatusResponse,
  GetMarketDataRequest,
  GetMarketDataResponse,
} from "./schemas/index.js";

export interface ClientOptions {
  timeout?: number;
  requestTimeout?: number;
}

export interface EmberClient {
  close(): void;
  getChains(request: GetChainsRequest): Promise<GetChainsResponse>;
  getTokens(request: GetTokensRequest): Promise<GetTokensResponse>;
  getCapabilities(request: GetCapabilitiesRequest): Promise<GetCapabilitiesResponse>;
  getYieldMarkets(request: GetYieldMarketsRequest): Promise<GetYieldMarketsResponse>;
  /** @deprecated Use getYieldMarkets instead */
  getPendleMarkets(request: GetYieldMarketsRequest): Promise<GetYieldMarketsResponse>;
  getWalletPositions(request: GetWalletPositionsRequest): Promise<GetWalletPositionsResponse>;
  getUserLiquidityPositions(request: GetUserLiquidityPositionsRequest): Promise<GetUserLiquidityPositionsResponse>;
  getWalletBalances(request: GetWalletBalancesRequest): Promise<GetWalletBalancesResponse>;
  swapTokens(request: SwapTokensRequest): Promise<SwapTokensResponse>;
  borrowTokens(request: BorrowTokensRequest): Promise<BorrowTokensResponse>;
  repayTokens(request: RepayTokensRequest): Promise<RepayTokensResponse>;
  supplyTokens(request: SupplyTokensRequest): Promise<SupplyTokensResponse>;
  withdrawTokens(request: WithdrawTokensRequest): Promise<WithdrawTokensResponse>;
  supplyLiquidity(request: SupplyLiquidityRequest): Promise<SupplyLiquidityResponse>;
  withdrawLiquidity(request: WithdrawLiquidityRequest): Promise<WithdrawLiquidityResponse>;
  getLiquidityPools(): Promise<GetLiquidityPoolsResponse>;
  getProviderTrackingStatus(request: GetProviderTrackingStatusRequest): Promise<GetProviderTrackingStatusResponse>;
  getMarketData(request: GetMarketDataRequest): Promise<GetMarketDataResponse>;
}

export class EmberMcpClient implements EmberClient {
  private client: Client;
  private transport: SSEClientTransport | StdioClientTransport;

  constructor(
    address: string,
    options?: Partial<ClientOptions>
  ) {
    // Determine transport type based on address
    if (address.startsWith("http://") || address.startsWith("https://")) {
      this.transport = new SSEClientTransport(new URL(address));
    } else {
      // Assume stdio transport for local file paths or commands
      this.transport = new StdioClientTransport({
        command: address,
        args: [],
      });
    }

    this.client = new Client(
      {
        name: "ember-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  close(): void {
    this.client.close();
  }

  private async callTool<TRequest, TResponse>(
    toolName: string,
    request: TRequest,
    responseSchema: z.ZodType<TResponse>
  ): Promise<TResponse> {
    const result = await this.client.callTool({
      name: toolName,
      arguments: request as any,
    });

    try {
      return parseMcpToolResponse(result, responseSchema);
    } catch (error) {
      // Enhanced error message with formatted JSON
      const formattedError = `Tool call '${toolName}' failed: ${(error as Error).message}\n\nFull MCP response:\n${JSON.stringify(result, null, 2)}`;
      throw new Error(formattedError);
    }
  }

  async getChains(request: GetChainsRequest): Promise<GetChainsResponse> {
    return this.callTool("get_chains", request, GetChainsResponseSchema);
  }

  async getTokens(request: GetTokensRequest): Promise<GetTokensResponse> {
    return this.callTool("get_tokens", request, GetTokensResponseSchema);
  }

  async getCapabilities(request: GetCapabilitiesRequest): Promise<GetCapabilitiesResponse> {
    return this.callTool("get_capabilities", request, GetCapabilitiesResponseSchema);
  }

  async getYieldMarkets(request: GetYieldMarketsRequest): Promise<GetYieldMarketsResponse> {
    return this.callTool("get_yield_markets", request, GetYieldMarketsResponseSchema);
  }

  /** @deprecated Use getYieldMarkets instead */
  async getPendleMarkets(request: GetYieldMarketsRequest): Promise<GetYieldMarketsResponse> {
    return this.getYieldMarkets(request);
  }

  async getWalletPositions(request: GetWalletPositionsRequest): Promise<GetWalletPositionsResponse> {
    return this.callTool("get_wallet_positions", request, GetWalletPositionsResponseSchema);
  }

  async getUserLiquidityPositions(request: GetUserLiquidityPositionsRequest): Promise<GetUserLiquidityPositionsResponse> {
    return this.callTool("get_user_liquidity_positions", request, GetUserLiquidityPositionsResponseSchema);
  }

  async getWalletBalances(request: GetWalletBalancesRequest): Promise<GetWalletBalancesResponse> {
    return this.callTool("get_wallet_balances", request, GetWalletBalancesResponseSchema);
  }

  async swapTokens(request: SwapTokensRequest): Promise<SwapTokensResponse> {
    return this.callTool("swap_tokens", request, SwapTokensResponseSchema);
  }

  async borrowTokens(request: BorrowTokensRequest): Promise<BorrowTokensResponse> {
    return this.callTool("borrow_tokens", request, BorrowTokensResponseSchema);
  }

  async repayTokens(request: RepayTokensRequest): Promise<RepayTokensResponse> {
    return this.callTool("repay_tokens", request, RepayTokensResponseSchema);
  }

  async supplyTokens(request: SupplyTokensRequest): Promise<SupplyTokensResponse> {
    return this.callTool("supply_tokens", request, SupplyTokensResponseSchema);
  }

  async withdrawTokens(request: WithdrawTokensRequest): Promise<WithdrawTokensResponse> {
    return this.callTool("withdraw_tokens", request, WithdrawTokensResponseSchema);
  }

  async supplyLiquidity(request: SupplyLiquidityRequest): Promise<SupplyLiquidityResponse> {
    return this.callTool("supply_liquidity", request, SupplyLiquidityResponseSchema);
  }

  async withdrawLiquidity(request: WithdrawLiquidityRequest): Promise<WithdrawLiquidityResponse> {
    return this.callTool("withdraw_liquidity", request, WithdrawLiquidityResponseSchema);
  }

  async getLiquidityPools(): Promise<GetLiquidityPoolsResponse> {
    return this.callTool("get_liquidity_pools", {}, GetLiquidityPoolsResponseSchema);
  }

  async getProviderTrackingStatus(request: GetProviderTrackingStatusRequest): Promise<GetProviderTrackingStatusResponse> {
    return this.callTool("get_provider_tracking_status", request, GetProviderTrackingStatusResponseSchema);
  }

  async getMarketData(request: GetMarketDataRequest): Promise<GetMarketDataResponse> {
    return this.callTool("get_market_data", request, GetMarketDataResponseSchema);
  }
} 