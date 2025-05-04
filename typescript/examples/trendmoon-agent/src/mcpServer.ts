import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fetch from "node-fetch";
import { z } from "zod";
import axios from "axios";

// Define schema for the getTopAlerts tool
const GetTopAlertsSchema = z.object({});
type GetTopAlertsArgs = z.infer<typeof GetTopAlertsSchema>;

// Define schema for the getSocialTrend tool
const GetSocialTrendSchema = z.object({
  symbol: z
    .string()
    .describe(
      "The token symbol to get social trend data for, e.g. BTC, ETH, SOL"
    ),
});
type GetSocialTrendArgs = z.infer<typeof GetSocialTrendSchema>;

// Define schema for the getProjectSummary tool
const GetProjectSummarySchema = z.object({
  symbol: z
    .string()
    .describe("The token symbol to get project summary for, e.g. BTC"),
});
type GetProjectSummaryArgs = z.infer<typeof GetProjectSummarySchema>;

// Define schema for the getHistoricalPrice tool
const GetHistoricalPriceSchema = z.object({
  symbol: z
    .string()
    .describe(
      "The token symbol to get historical price data for, e.g. BTC, ETH, SOL"
    ),
});
type GetHistoricalPriceArgs = z.infer<typeof GetHistoricalPriceSchema>;

export class TrendMoonMcpServer {
  private mcpServer: McpServer;

  constructor() {
    console.error("Initializing TrendMoon MCP Server...");
    console.error("Checking environment variables...");
    console.error(
      "TRENDMOON_API_KEY:",
      process.env.TRENDMOON_API_KEY ? "Set" : "Not set"
    );

    if (!process.env.TRENDMOON_API_KEY) {
      throw new Error("TRENDMOON_API_KEY not set!");
    }

    const apiKey = process.env.TRENDMOON_API_KEY;

    console.error("Creating MCP server...");
    // Initialize MCP server
    this.mcpServer = new McpServer({
      name: "trendmoon-mcp-tool-server",
      version: "1.0.0",
    });

    this.registerTools(apiKey);
  }

  private registerTools(apiKey: string) {
    console.error("Registering getTopAlerts tool...");
    // Register the getTopAlerts tool
    this.mcpServer.tool(
      "getTopAlerts",
      "Get top alerts from Trendmoon API",
      GetTopAlertsSchema.shape,
      async (_params: GetTopAlertsArgs, _extra: any) => {
        console.error("Calling Trendmoon API for alerts...");
        try {
          const response = await fetch(
            "https://api.trendmoon.ai/get_top_alerts_today",
            {
              method: "GET",
              headers: {
                "Api-key": apiKey,
                accept: "application/json",
              },
            }
          );

          if (!response.ok) {
            console.error(
              "API request failed:",
              response.status,
              response.statusText
            );
            throw new Error(
              `API request failed with status ${response.status}`
            );
          }

          const data = await response.json();
          console.error("Successfully received alerts from Trendmoon");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(data),
              },
            ],
          };
        } catch (error) {
          console.error("Error in getTopAlerts tool:", error);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Register the getSocialTrend tool
    this.mcpServer.tool(
      "getSocialTrend",
      "Get social trend data for a specific token from Trendmoon API",
      GetSocialTrendSchema.shape,
      async (params: GetSocialTrendArgs, _extra: any) => {
        console.error(
          `Calling Trendmoon API for social trend data for ${params.symbol}...`
        );
        try {
          const symbolUppercase = params.symbol.toUpperCase();
          const response = await fetch(
            `https://api.qa.trendmoon.ai/social/trend?symbol=${symbolUppercase}&date_interval=4&time_interval=1d`,
            {
              method: "GET",
              headers: {
                "Api-key": apiKey,
                accept: "application/json",
              },
            }
          );

          if (!response.ok) {
            console.error(
              "API request failed:",
              response.status,
              response.statusText
            );
            if (response.status === 404) {
              console.error(
                `No social trend data found for symbol: ${symbolUppercase}`
              );
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(null),
                  },
                ],
              };
            }
            throw new Error(
              `API request failed with status ${response.status}`
            );
          }

          const data = await response.json();

          // Check if the response contains valid data
          if (!data || Object.keys(data).length === 0) {
            console.error(
              `Empty or invalid response data for ${symbolUppercase}`
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(null),
                },
              ],
            };
          }

          console.error(
            `Successfully received social trend data for ${symbolUppercase}`
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(data),
              },
            ],
          };
        } catch (error) {
          console.error("Error in getSocialTrend tool:", error);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    console.error("Registering getProjectSummary tool...");
    // Register the getProjectSummary tool
    this.mcpServer.tool(
      "getProjectSummary",
      "Get 7-day project summary for a specific token from TrendMoon API",
      GetProjectSummarySchema.shape,
      async (params: GetProjectSummaryArgs, _extra: any) => {
        console.error(
          `Calling Trendmoon API for project summary for ${params.symbol}...`
        );
        try {
          const symbolUppercase = params.symbol.toUpperCase();
          const url = `https://api.qa.trendmoon.ai/social/project-summary?symbol=${symbolUppercase}&days_ago=7&force_regenerate=false`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Api-key": apiKey,
              accept: "application/json",
            },
          });
          if (!response.ok) {
            console.error(
              "API request failed:",
              response.status,
              response.statusText
            );
            throw new Error(
              `API request failed with status ${response.status}`
            );
          }
          const data = await response.json();
          console.error(
            `Successfully received project summary data for ${symbolUppercase}`
          );
          return {
            content: [{ type: "text", text: JSON.stringify(data) }],
          };
        } catch (error) {
          console.error("Error in getProjectSummary tool:", error);
          return {
            isError: true,
            content: [
              { type: "text", text: `Error: ${(error as Error).message}` },
            ],
          };
        }
      }
    );

    console.error("Registering getHistoricalPrice tool...");
    // Register the getHistoricalPrice tool
    this.mcpServer.tool(
      "getHistoricalPrice",
      "Get the daily closing prices for the last 14 days for a specific token symbol from Binance.",
      GetHistoricalPriceSchema.shape,
      async (params: GetHistoricalPriceArgs, _extra: any) => {
        console.error(`Calling getHistoricalPrice for ${params.symbol}...`);
        try {
          const data = await this.getHistoricalPrice(params.symbol);
          console.error(
            `Successfully received historical price data for ${params.symbol}`
          );
          return {
            content: [{ type: "text", text: JSON.stringify(data) }],
          };
        } catch (error) {
          console.error(
            `Error in getHistoricalPrice tool for ${params.symbol}:`,
            error
          );
          return {
            isError: true,
            content: [
              { type: "text", text: `Error: ${(error as Error).message}` },
            ],
          };
        }
      }
    );

    console.error("Tool registration complete");
  }

  // Fetch historical daily close prices from Binance
  private async getHistoricalPrice(
    symbol: string
  ): Promise<{ date: string; close: number }[] | null> {
    const binanceSymbol = `${symbol.toUpperCase()}USDT`; // Assume USDT pairing
    const url = "https://api.binance.com/api/v3/klines";
    const params = {
      symbol: binanceSymbol,
      interval: "1d",
      limit: 14, // Fetch last 14 days
    };
    console.error(
      `Fetching historical prices for ${binanceSymbol} from Binance...`
    );

    try {
      const response = await axios.get<any[]>(url, { params });
      const closes = response.data
        .map((kline: any[]) => {
          // Ensure kline data exists and has the expected elements
          if (
            !kline ||
            kline.length < 5 ||
            kline[0] === undefined ||
            kline[4] === undefined
          ) {
            console.warn("Malformed kline data received from Binance:", kline);
            return null; // Skip this entry
          }
          const date = new Date(kline[0]);
          const closePrice = parseFloat(kline[4]);

          // Validate the parsed date and price
          if (isNaN(date.getTime()) || isNaN(closePrice)) {
            console.warn(
              `Invalid date or price in kline data: Date=${kline[0]}, Price=${kline[4]}`
            );
            return null; // Skip invalid entries
          }

          return {
            date: date.toISOString().split("T")[0], // Format as YYYY-MM-DD
            close: closePrice,
          };
        })
        .filter(
          (
            entry: { date: string | undefined; close: number } | null
          ): entry is { date: string; close: number } => entry !== null
        );

      console.error(
        `Successfully fetched ${closes.length} days of price data for ${binanceSymbol}`
      );
      return closes;
    } catch (error: any) {
      // Check if it's an axios error and log details
      if (axios.isAxiosError(error)) {
        console.error(
          `Axios error fetching data for ${binanceSymbol}: ${error.message}`
        );
        if (error.response) {
          // Binance often returns specific error messages in the response body
          console.error("Binance API Error:", error.response.data);
          // Return a more specific error if possible, e.g., invalid symbol
          if (error.response.data?.code === -1121) {
            // Example: Invalid symbol code
            throw new Error(`Invalid symbol for Binance API: ${binanceSymbol}`);
          }
        }
      } else {
        console.error(
          `Error fetching data for ${binanceSymbol}:`,
          error.message
        );
      }
      // Return null or throw, depending on desired error handling. Throwing makes it clearer in the tool call.
      throw new Error(
        `Failed to fetch historical prices for ${binanceSymbol}. Check symbol and API availability.`
      );
    }
  }

  async initServer() {
    try {
      console.error("Initializing MCP server transport...");
      const transport = new StdioServerTransport();

      console.error("Connecting to MCP transport...");
      await this.mcpServer.connect(transport);
      console.error("MCP server initialized and connected successfully");
    } catch (error) {
      console.error("Failed to initialize MCP server:", error);
      throw error;
    }
  }

  async stop() {
    try {
      console.error("Shutting down MCP server...");
      await this.mcpServer.close();
      console.error("MCP server closed successfully");
    } catch (error) {
      console.error("Error closing MCP connections:", error);
    }
  }
}
