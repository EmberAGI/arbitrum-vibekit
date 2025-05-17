import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fetch from "node-fetch";
import { z } from "zod";
import axios from "axios";
import * as technicalindicators from "technicalindicators";

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

// Define schema for the checkEMAPosition tool
const CheckEMAPositionSchema = z.object({
  symbol: z
    .string()
    .describe("The token symbol to check EMA position for, e.g. BTC, ETH, SOL"),
});
type CheckEMAPositionArgs = z.infer<typeof CheckEMAPositionSchema>;

// Define interface for price data with MACD
interface PriceDataWithMACD {
  date: string;
  close: number;
  macd?: number | null;
  signal?: number | null;
  histogram?: number | null;
}

// Define interface for social data with MA
interface SocialDataWithMA {
  symbol: string;
  social_data: Array<{
    date: string;
    mentions_count: number;
    sentiment_score: number;
    lc_social_dominance: number;
    mentions_ma?: number;
    sentiment_ma?: number;
    dominance_ma?: number;
  }>;
  ma_analysis?: {
    mentions_trend?: string;
    sentiment_trend?: string;
    dominance_trend?: string;
  };
  summary?: {
    current_dominance?: number;
    dominance_ma_current?: number;
    dominance_ma_previous?: number;
    dominance_change_percent?: number;
    [key: string]: any;
  };
  [key: string]: any; // For any other properties in the response
}

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
            `https://api.qa.trendmoon.ai/social/trend?symbol=${symbolUppercase}&date_interval=10&time_interval=1d`,
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

    console.error("Registering checkEMAPosition tool...");
    // Register the checkEMAPosition tool
    this.mcpServer.tool(
      "checkEMAPosition",
      "Check if a coin's price is above its 20-day and 50-day EMA (Exponential Moving Average)",
      CheckEMAPositionSchema.shape,
      async (params: CheckEMAPositionArgs, _extra: any) => {
        console.error(`Checking EMA position for ${params.symbol}...`);
        try {
          const result = await this.checkEMAPosition(params.symbol);
          console.error(
            `Successfully analyzed EMA position for ${params.symbol}`
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
          };
        } catch (error) {
          console.error(
            `Error in checkEMAPosition tool for ${params.symbol}:`,
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

    console.error("Registering getSocialTrendWithMA tool...");
    // Register the getSocialTrendWithMA tool
    this.mcpServer.tool(
      "getSocialTrendWithMA",
      "Get social trend data with moving averages for a specific token",
      GetSocialTrendSchema.shape,
      async (params: GetSocialTrendArgs, _extra: any) => {
        console.error(`Calling getSocialTrendWithMA for ${params.symbol}...`);
        try {
          const data = await this.getSocialTrendWithMA(params.symbol);
          console.error(
            `Successfully received social trend with MA for ${params.symbol}`
          );
          return {
            content: [{ type: "text", text: JSON.stringify(data) }],
          };
        } catch (error) {
          console.error(
            `Error in getSocialTrendWithMA tool for ${params.symbol}:`,
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

  // Fetch historical daily close prices from Binance with MACD calculations
  private async getHistoricalPrice(
    symbol: string
  ): Promise<PriceDataWithMACD[] | null> {
    const binanceSymbol = `${symbol.toUpperCase()}USDT`; // Assume USDT pairing
    const url = "https://api.binance.com/api/v3/klines";
    const params = {
      symbol: binanceSymbol,
      interval: "1d",
      // Increase limit to provide enough data for MACD calculation
      limit: 40, // Fetch more days to have enough data for MACD calculation
    };
    console.error(
      `Fetching historical prices for ${binanceSymbol} from Binance...`
    );

    try {
      const response = await axios.get<any[]>(url, { params });
      const priceData = response.data
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
        `Successfully fetched ${priceData.length} days of price data for ${binanceSymbol}`
      );

      // Calculate MACD if we have enough data points
      if (priceData.length >= 26) {
        try {
          // Extract close prices for calculations
          const closePrices = priceData.map((item) => item.close);

          // Calculate MACD
          const macdInput = {
            values: closePrices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
          };

          const macdResults = technicalindicators.MACD.calculate(macdInput);
          console.error(
            `Calculated MACD with ${macdResults.length} data points`
          );

          // Match MACD results with corresponding dates
          // MACD calculation will have fewer points than original data due to its periods
          const dataWithMACD: PriceDataWithMACD[] = [];

          // First add points without MACD (not enough data at beginning for calculation)
          const pointsWithoutMACD = priceData.length - macdResults.length;
          for (let i = 0; i < pointsWithoutMACD && i < priceData.length; i++) {
            const pricePoint = priceData[i];
            if (pricePoint && pricePoint.date && pricePoint.close) {
              dataWithMACD.push({
                date: pricePoint.date,
                close: pricePoint.close,
              });
            }
          }

          // Then add points with MACD data
          for (let i = 0; i < macdResults.length; i++) {
            const macdResult = macdResults[i];
            const priceIndex = i + pointsWithoutMACD;

            if (priceIndex < priceData.length) {
              const pricePoint = priceData[priceIndex];
              if (pricePoint && pricePoint.date && pricePoint.close) {
                dataWithMACD.push({
                  date: pricePoint.date,
                  close: pricePoint.close,
                  macd: macdResult ? macdResult.MACD : null,
                  signal: macdResult ? macdResult.signal : null,
                  histogram: macdResult ? macdResult.histogram : null,
                });
              }
            }
          }

          // Return only the last 14 days of data
          return dataWithMACD.slice(-14);
        } catch (macdError) {
          console.error("Error calculating MACD:", macdError);
          // Return price data without MACD if calculation fails
          return priceData.slice(-14);
        }
      }

      // Return last 14 days of price data without MACD if not enough data points
      return priceData.slice(-14);
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

  // Change from private to public
  public async checkEMAPosition(symbol: string): Promise<{
    symbol: string;
    currentPrice: number;
    ema20: number;
    ema50: number;
    isAboveEma20: boolean;
    isAboveEma50: boolean;
    ema20Percentage: number;
    ema50Percentage: number;
    date: string;
  }> {
    const binanceSymbol = `${symbol.toUpperCase()}USDT`; // Assume USDT pairing
    const url = "https://api.binance.com/api/v3/klines";
    const params = {
      symbol: binanceSymbol,
      interval: "1d",
      limit: 60, // Need at least 50 days plus some buffer for calculations
    };
    console.error(
      `Fetching prices for EMA calculation for ${binanceSymbol} from Binance...`
    );

    try {
      const response = await axios.get<any[]>(url, { params });

      // Extract close prices
      const closePrices = response.data
        .map((kline: any[]) => {
          if (!kline || kline.length < 5 || kline[4] === undefined) {
            return null;
          }
          return parseFloat(kline[4]);
        })
        .filter((price): price is number => price !== null);

      if (closePrices.length < 50) {
        throw new Error(
          `Not enough data points for ${binanceSymbol} to calculate 50-day EMA`
        );
      }

      // Calculate EMAs using technicalindicators
      const ema20Results = technicalindicators.EMA.calculate({
        values: closePrices,
        period: 20,
      });

      const ema50Results = technicalindicators.EMA.calculate({
        values: closePrices,
        period: 50,
      });

      // Get the most recent values
      const currentPrice = closePrices[closePrices.length - 1];
      const ema20 = ema20Results[ema20Results.length - 1];
      const ema50 = ema50Results[ema50Results.length - 1];

      // Check if we have valid values
      if (
        currentPrice === undefined ||
        ema20 === undefined ||
        ema50 === undefined
      ) {
        throw new Error(
          `Failed to calculate valid EMA values for ${binanceSymbol}`
        );
      }

      // Calculate how far price is from EMAs (as percentage)
      const ema20Percentage = ((currentPrice - ema20) / ema20) * 100;
      const ema50Percentage = ((currentPrice - ema50) / ema50) * 100;

      // Check if current price is above EMAs
      const isAboveEma20 = currentPrice > ema20;
      const isAboveEma50 = currentPrice > ema50;

      // Get the date for the most recent price
      const lastDataPoint = response.data[response.data.length - 1];
      if (!lastDataPoint || !lastDataPoint[0]) {
        throw new Error(`Missing timestamp in data for ${binanceSymbol}`);
      }

      const latestDate = new Date(lastDataPoint[0]);
      const dateStr = (latestDate.toISOString().split("T")[0] ||
        "Unknown date") as string;

      return {
        symbol: symbol.toUpperCase(),
        currentPrice,
        ema20,
        ema50,
        isAboveEma20,
        isAboveEma50,
        ema20Percentage,
        ema50Percentage,
        date: dateStr,
      };
    } catch (error: any) {
      console.error(`Error checking EMA position for ${binanceSymbol}:`, error);
      throw new Error(
        `Failed to check EMA position for ${binanceSymbol}: ${error.message}`
      );
    }
  }

  // Change from private to public
  public async getSocialTrendWithMA(symbol: string): Promise<SocialDataWithMA> {
    // First get the raw social trend data
    const symbolUppercase = symbol.toUpperCase();
    console.error(
      `Fetching social trend data for ${symbolUppercase} to calculate MA...`
    );

    try {
      const response = await fetch(
        `https://api.qa.trendmoon.ai/social/trend?symbol=${symbolUppercase}&date_interval=7&time_interval=1d`,
        {
          method: "GET",
          headers: {
            "Api-key": process.env.TRENDMOON_API_KEY!,
            accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = (await response.json()) as SocialDataWithMA;

      if (!data || !data.social_data || !Array.isArray(data.social_data)) {
        console.error(`No valid social data found for ${symbolUppercase}`);
        return data; // Return original data if not in expected format
      }

      // Extract time series for mentions, sentiment, and social dominance
      const mentionsData = data.social_data.map(
        (day) => day.mentions_count || 0
      );
      const sentimentData = data.social_data.map(
        (day) => day.sentiment_score || 0
      );
      const dominanceData = data.social_data.map(
        (day) => day.lc_social_dominance || 0
      );

      // Calculate 3-day MAs for mentions and sentiment if we have enough data
      if (mentionsData.length >= 3) {
        const mentionsMA = technicalindicators.SMA.calculate({
          values: mentionsData,
          period: 3,
        });

        const sentimentMA = technicalindicators.SMA.calculate({
          values: sentimentData,
          period: 3,
        });

        // Add MA data to each day's entry
        // Note: MA will start from the 3rd day
        const offset = mentionsData.length - mentionsMA.length;
        for (let i = 0; i < mentionsMA.length; i++) {
          if (data.social_data[i + offset]) {
            // Use type assertion to tell TypeScript this is a modifiable object
            (data.social_data[i + offset] as any).mentions_ma = mentionsMA[i];
            (data.social_data[i + offset] as any).sentiment_ma = sentimentMA[i];
          }
        }

        // Add MA analysis to the data
        data.ma_analysis = {
          mentions_trend:
            mentionsMA.length >= 2 &&
            mentionsMA[mentionsMA.length - 1] !== undefined &&
            mentionsMA[mentionsMA.length - 2] !== undefined
              ? mentionsMA[mentionsMA.length - 1]! >
                mentionsMA[mentionsMA.length - 2]!
                ? "rising"
                : "falling"
              : "unknown",
          sentiment_trend:
            sentimentMA.length >= 2 &&
            sentimentMA[sentimentMA.length - 1] !== undefined &&
            sentimentMA[sentimentMA.length - 2] !== undefined
              ? sentimentMA[sentimentMA.length - 1]! >
                sentimentMA[sentimentMA.length - 2]!
                ? "improving"
                : "declining"
              : "unknown",
        };
      }

      // Calculate 2-day MA for social dominance if we have enough data
      if (dominanceData.length >= 2) {
        const dominanceMA = technicalindicators.SMA.calculate({
          values: dominanceData,
          period: 2,
        });

        // Add MA data to each day's entry
        const domOffset = dominanceData.length - dominanceMA.length;
        for (let i = 0; i < dominanceMA.length; i++) {
          if (data.social_data[i + domOffset]) {
            (data.social_data[i + domOffset] as any).dominance_ma =
              dominanceMA[i];
          }
        }

        // Fix array access errors in the dominance trend analysis
        if (dominanceMA.length >= 2) {
          const lastDominanceMA = dominanceMA[dominanceMA.length - 1]!;
          const prevDominanceMA = dominanceMA[dominanceMA.length - 2]!;

          if (data.ma_analysis) {
            (data.ma_analysis as any).dominance_trend =
              lastDominanceMA > prevDominanceMA ? "rising" : "falling";
          } else {
            data.ma_analysis = {
              dominance_trend:
                lastDominanceMA > prevDominanceMA ? "rising" : "falling",
            };
          }

          // Fix array access errors in the dominance summary
          if (dominanceData.length > 1) {
            const lastDominance = dominanceData[dominanceData.length - 1]!;
            const prevDominance = dominanceData[dominanceData.length - 2]!;

            data.summary = {
              ...(data.summary || {}),
              current_dominance: lastDominance,
              dominance_ma_current: lastDominanceMA,
              dominance_ma_previous: prevDominanceMA,
              dominance_change_percent:
                ((lastDominance - prevDominance) / (prevDominance || 1)) * 100,
            };
          }
        } else {
          // Not enough data points for dominance trend
          if (data.ma_analysis) {
            (data.ma_analysis as any).dominance_trend = "unknown";
          } else {
            data.ma_analysis = {
              dominance_trend: "unknown",
            };
          }

          if (dominanceData.length > 0) {
            data.summary = {
              ...(data.summary || {}),
              current_dominance: dominanceData[dominanceData.length - 1]!,
              dominance_ma_current:
                dominanceMA.length > 0
                  ? dominanceMA[dominanceMA.length - 1]!
                  : 0,
              dominance_ma_previous: 0,
              dominance_change_percent: 0,
            };
          }
        }
      }

      console.error(
        `Successfully calculated MA for social data for ${symbolUppercase}`
      );

      // Extract and process day_social_perc_diff data
      if (
        data.trend_market_data &&
        Array.isArray(data.trend_market_data) &&
        data.trend_market_data.length >= 2
      ) {
        console.error("Processing day_social_perc_diff values...");

        // Extract day_social_perc_diff values
        const percDiffValues = data.trend_market_data
          .map((day) => day.day_social_perc_diff)
          .filter((val) => val !== undefined && !isNaN(val));

        console.error("day_social_perc_diff values:", percDiffValues);

        // Calculate 2-day moving average for day_social_perc_diff
        if (percDiffValues.length >= 2) {
          // Create a new array for the moving averages
          const percDiffMA2 = [];

          for (let i = 1; i < percDiffValues.length; i++) {
            const ma2 = (percDiffValues[i] + percDiffValues[i - 1]) / 2;
            percDiffMA2.push(parseFloat(ma2.toFixed(2)));
          }

          console.error("2-day MA for day_social_perc_diff:", percDiffMA2);

          // Add the MA values to a new timeseries array in the data
          data.perc_diff_ma = {
            values: percDiffValues,
            ma2: percDiffMA2,
          };

          // Add MA values to each day's data point starting from the second day
          for (let i = 0; i < percDiffMA2.length; i++) {
            // MA2 starts from the second entry (index 1)
            const dataIndex = i + 1;
            if (dataIndex < data.trend_market_data.length) {
              data.trend_market_data[dataIndex].day_social_perc_diff_ma2 =
                percDiffMA2[i];
            }
          }
        }
      }

      // Add normalized data structure for easier consumption
      data.normalized = this.normalizeTimeSeriesData(data);
      console.error("Added normalized data structure to response");

      return data;
    } catch (error: any) {
      console.error(
        `Error getting social trend with MA for ${symbolUppercase}:`,
        error
      );
      throw new Error(`Failed to get social trend with MA: ${error.message}`);
    }
  }

  /**
   * Normalize time series data for easier consumption
   * Creates a structured representation of time series data including social mentions,
   * day_social_perc_diff, and their moving averages
   */
  private normalizeTimeSeriesData(data: any): any {
    if (
      !data ||
      !data.trend_market_data ||
      !Array.isArray(data.trend_market_data)
    ) {
      console.error(
        "Cannot normalize data: Invalid or missing trend_market_data"
      );
      return null;
    }

    // Extract key metrics for cleaner visualization
    const timeseriesData: {
      symbol: string;
      dates: string[];
      social_mentions: number[];
      social_mentions_ma2: (number | null)[];
      social_mentions_ma3: (number | null)[];
      day_social_perc_diff: (number | null)[];
      day_social_perc_diff_ma2: (number | null)[];
      sentiment: (number | null)[];
      dominance: (number | null)[];
      trend_analysis?: any;
      perc_diff_ma?: any;
      day_by_day?: any[];
    } = {
      symbol: data.symbol || "unknown",
      dates: [],
      social_mentions: [],
      social_mentions_ma2: [],
      social_mentions_ma3: [],
      day_social_perc_diff: [],
      day_social_perc_diff_ma2: [],
      sentiment: [],
      dominance: [],
    };

    // Process each data point
    data.trend_market_data.forEach((day: any) => {
      // Format date to YYYY-MM-DD
      let dateStr = "Unknown";
      if (day.date) {
        const dateString = String(day.date);
        dateStr = dateString.split("T")[0] || "Unknown";
      }
      timeseriesData.dates.push(dateStr);

      // Extract key metrics with sensible defaults
      timeseriesData.social_mentions.push(day.social_mentions || 0);
      timeseriesData.social_mentions_ma2.push(day.social_mentions_ma2 || null);
      timeseriesData.social_mentions_ma3.push(day.social_mentions_ma3 || null);
      timeseriesData.day_social_perc_diff.push(
        day.day_social_perc_diff || null
      );
      timeseriesData.day_social_perc_diff_ma2.push(
        day.day_social_perc_diff_ma2 || null
      );
      timeseriesData.sentiment.push(day.lc_sentiment || null);
      timeseriesData.dominance.push(day.lc_social_dominance || null);
    });

    // Add social trend analysis if available
    if (data.social_trend_analysis) {
      timeseriesData.trend_analysis = data.social_trend_analysis;
    }

    // Add perc_diff_ma data if available
    if (data.perc_diff_ma) {
      timeseriesData.perc_diff_ma = data.perc_diff_ma;
    }

    // Create day-by-day timeseries for easier reading
    timeseriesData.day_by_day = timeseriesData.dates.map((date, index) => {
      return {
        date,
        social_mentions: timeseriesData.social_mentions[index],
        social_mentions_ma2: timeseriesData.social_mentions_ma2[index],
        social_mentions_ma3: timeseriesData.social_mentions_ma3[index],
        day_social_perc_diff: timeseriesData.day_social_perc_diff[index],
        day_social_perc_diff_ma2:
          timeseriesData.day_social_perc_diff_ma2[index],
        sentiment: timeseriesData.sentiment[index],
        dominance: timeseriesData.dominance[index],
      };
    });

    return timeseriesData;
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
