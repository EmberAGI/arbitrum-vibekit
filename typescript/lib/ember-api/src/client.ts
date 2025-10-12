import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import type { z } from 'zod';
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
  GetWalletLendingPositionsResponseSchema,
  GetWalletLiquidityPositionsResponseSchema,
  GetWalletBalancesResponseSchema,
  GetYieldMarketsResponseSchema,
  GetLiquidityPoolsResponseSchema,
  GetProviderTrackingStatusResponseSchema,
  GetMarketDataResponseSchema,
} from './schemas/index.js';
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
  GetWalletLendingPositionsRequest,
  GetWalletLendingPositionsResponse,
  GetWalletLiquidityPositionsRequest,
  GetWalletLiquidityPositionsResponse,
  GetWalletBalancesRequest,
  GetWalletBalancesResponse,
  GetYieldMarketsRequest,
  GetYieldMarketsResponse,
  GetLiquidityPoolsResponse,
  GetProviderTrackingStatusRequest,
  GetProviderTrackingStatusResponse,
  GetMarketDataRequest,
  GetMarketDataResponse,
} from './schemas/index.js';

export interface EmberClient {
  close(): void;
  getChains(request: GetChainsRequest): Promise<GetChainsResponse>;
  getTokens(request: GetTokensRequest): Promise<GetTokensResponse>;
  getCapabilities(request: GetCapabilitiesRequest): Promise<GetCapabilitiesResponse>;
  getYieldMarkets(request: GetYieldMarketsRequest): Promise<GetYieldMarketsResponse>;
  getWalletLendingPositions(
    request: GetWalletLendingPositionsRequest
  ): Promise<GetWalletLendingPositionsResponse>;
  getWalletLiquidityPositions(
    request: GetWalletLiquidityPositionsRequest
  ): Promise<GetWalletLiquidityPositionsResponse>;
  getWalletBalances(request: GetWalletBalancesRequest): Promise<GetWalletBalancesResponse>;
  swapTokens(request: SwapTokensRequest): Promise<SwapTokensResponse>;
  lendingBorrow(request: BorrowTokensRequest): Promise<BorrowTokensResponse>;
  lendingRepay(request: RepayTokensRequest): Promise<RepayTokensResponse>;
  lendingSupply(request: SupplyTokensRequest): Promise<SupplyTokensResponse>;
  lendingWithdraw(request: WithdrawTokensRequest): Promise<WithdrawTokensResponse>;
  supplyLiquidity(request: SupplyLiquidityRequest): Promise<SupplyLiquidityResponse>;
  withdrawLiquidity(request: WithdrawLiquidityRequest): Promise<WithdrawLiquidityResponse>;
  getLiquidityPools(): Promise<GetLiquidityPoolsResponse>;
  getProviderTrackingStatus(
    request: GetProviderTrackingStatusRequest
  ): Promise<GetProviderTrackingStatusResponse>;
  getTokenMarketData(request: GetMarketDataRequest): Promise<GetMarketDataResponse>;
}

export class EmberMcpClient implements EmberClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | StdioClientTransport;

  constructor(address: string) {
    // Determine transport type based on address
    if (address.startsWith('http://') || address.startsWith('https://')) {
      this.transport = new StreamableHTTPClientTransport(new URL(address));
    } else {
      // Assume stdio transport for local file paths or commands
      this.transport = new StdioClientTransport({
        command: address,
        args: [],
      });
    }

    this.client = new Client(
      {
        name: 'ember-mcp-client',
        version: '1.0.0',
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
      arguments: request as Record<string, unknown>,
    });

    try {
      return parseMcpToolResponsePayload(result, responseSchema);
    } catch (error) {
      // Enhanced error message with formatted JSON
      const formattedError = `Tool call '${toolName}' failed: ${(error as Error).message}\n\nFull MCP response:\n${JSON.stringify(result, null, 2)}`;
      throw new Error(formattedError);
    }
  }

  async getChains(request: GetChainsRequest): Promise<GetChainsResponse> {
    return this.callTool('getChains', request, GetChainsResponseSchema);
  }

  async getTokens(request: GetTokensRequest): Promise<GetTokensResponse> {
    return this.callTool('getTokens', request, GetTokensResponseSchema);
  }

  async getCapabilities(request: GetCapabilitiesRequest): Promise<GetCapabilitiesResponse> {
    return this.callTool('getCapabilities', request, GetCapabilitiesResponseSchema);
  }

  async getYieldMarkets(request: GetYieldMarketsRequest): Promise<GetYieldMarketsResponse> {
    return this.callTool('getYieldMarkets', request, GetYieldMarketsResponseSchema);
  }

  async getWalletLendingPositions(
    request: GetWalletLendingPositionsRequest
  ): Promise<GetWalletLendingPositionsResponse> {
    return this.callTool(
      'getWalletLendingPositions',
      request,
      GetWalletLendingPositionsResponseSchema
    );
  }

  async getWalletLiquidityPositions(
    request: GetWalletLiquidityPositionsRequest
  ): Promise<GetWalletLiquidityPositionsResponse> {
    return this.callTool(
      'getWalletLiquidityPositions',
      request,
      GetWalletLiquidityPositionsResponseSchema
    );
  }

  async getWalletBalances(request: GetWalletBalancesRequest): Promise<GetWalletBalancesResponse> {
    return this.callTool('getWalletBalances', request, GetWalletBalancesResponseSchema);
  }

  async swapTokens(request: SwapTokensRequest): Promise<SwapTokensResponse> {
    return this.callTool('swapTokens', request, SwapTokensResponseSchema);
  }

  async lendingBorrow(request: BorrowTokensRequest): Promise<BorrowTokensResponse> {
    return this.callTool('lendingBorrow', request, BorrowTokensResponseSchema);
  }

  async lendingRepay(request: RepayTokensRequest): Promise<RepayTokensResponse> {
    return this.callTool('lendingRepay', request, RepayTokensResponseSchema);
  }

  async lendingSupply(request: SupplyTokensRequest): Promise<SupplyTokensResponse> {
    return this.callTool('lendingSupply', request, SupplyTokensResponseSchema);
  }

  async lendingWithdraw(request: WithdrawTokensRequest): Promise<WithdrawTokensResponse> {
    return this.callTool('lendingWithdraw', request, WithdrawTokensResponseSchema);
  }

  async supplyLiquidity(request: SupplyLiquidityRequest): Promise<SupplyLiquidityResponse> {
    return this.callTool('supplyLiquidity', request, SupplyLiquidityResponseSchema);
  }

  async withdrawLiquidity(request: WithdrawLiquidityRequest): Promise<WithdrawLiquidityResponse> {
    return this.callTool('withdrawLiquidity', request, WithdrawLiquidityResponseSchema);
  }

  async getLiquidityPools(): Promise<GetLiquidityPoolsResponse> {
    return this.callTool('getLiquidityPools', {}, GetLiquidityPoolsResponseSchema);
  }

  async getProviderTrackingStatus(
    request: GetProviderTrackingStatusRequest
  ): Promise<GetProviderTrackingStatusResponse> {
    return this.callTool(
      'getProviderTrackingStatus',
      request,
      GetProviderTrackingStatusResponseSchema
    );
  }

  async getTokenMarketData(request: GetMarketDataRequest): Promise<GetMarketDataResponse> {
    return this.callTool('getTokenMarketData', request, GetMarketDataResponseSchema);
  }
}
