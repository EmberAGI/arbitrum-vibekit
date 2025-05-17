import { z } from "zod";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import axios from "axios";
import fetch from "node-fetch";
import { TrendMoonMcpServer } from "./mcpServer.js";

// Define our own CoreMessage type instead of importing from ai
interface CoreMessage {
  role: "user" | "assistant" | "system" | "function";
  name?: string; // optional function name when role is 'function'
  content: string;
}

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

export class Agent {
  public mcpServer: TrendMoonMcpServer;
  public conversationHistory: CoreMessage[] = [];
  private openai: OpenAI;

  constructor() {
    console.error("Initializing Agent...");
    console.error("Checking environment variables...");
    console.error(
      "TRENDMOON_API_KEY:",
      process.env.TRENDMOON_API_KEY ? "Set" : "Not set"
    );
    console.error(
      "OPENAI_API_KEY:",
      process.env.OPENAI_API_KEY ? "Set" : "Not set"
    );

    if (!process.env.TRENDMOON_API_KEY) {
      throw new Error("TRENDMOON_API_KEY not set!");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not set!");
    }

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Initialize MCP Server
    this.mcpServer = new TrendMoonMcpServer();

    // Initialize conversation history
    this.conversationHistory = [
      {
        role: "system",
        content: `You are an AI agent that provides access to TrendMoon API data. Use the available tools ('getTopAlerts', 'getSocialTrend', 'getProjectSummary', 'getHistoricalPrice', 'checkEMAPosition') to fetch relevant data based on the user's request.

IMPORTANT: When you retrieve numerical data (e.g., social mentions, sentiment scores, ranks, alerts), **do not just list the raw numbers.**
Instead, **analyze the data**, identify key trends or significant changes (e.g., increases/decreases over time if the data spans multiple days), and **provide a brief explanation or interpretation** in clear, natural language. Explain what these changes might signify (e.g., "Social mentions increased significantly, suggesting growing interest", "AltRank improved, indicating better relative performance").

Tool Usage Guide:
- For general "what happened in crypto today?" or trending information, use 'getTopAlerts'.
- For project details or "what does SYMBOL do?", use 'getProjectSummary' with the token symbol.
- For social sentiment, mentions, or rank over time for a specific token, use 'getSocialTrend' with the token symbol.
- For historical price data, use 'getHistoricalPrice' with the token symbol.
- For technical trend analysis, use 'checkEMAPosition' with the token symbol.

MACD Technical Indicator:
The historical price data now includes MACD (Moving Average Convergence Divergence) values where available:
- macd: The MACD line (difference between 12-day and 26-day EMA)
- signal: The signal line (9-day EMA of MACD line)
- histogram: The histogram (MACD line minus signal line)

MACD Interpretation:
- MACD line above signal line = bullish trend
- MACD line below signal line = bearish trend
- MACD line crossing above signal line = bullish crossover (buy signal)
- MACD line crossing below signal line = bearish crossover (sell signal)
- Histogram growing = increasing momentum in the current direction
- Histogram shrinking = losing momentum (potential reversal)
- Divergence between MACD and price = potential trend reversal

When analyzing price data with MACD, mention the current MACD position relative to the signal line, any recent crossovers, and what this suggests about price momentum.

EMA Position Analysis:
The 'checkEMAPosition' tool provides information about a token's price relation to its 20-day and 50-day Exponential Moving Averages:
- isAboveEma20: Whether price is above 20-day EMA (short-term trend)
- isAboveEma50: Whether price is above 50-day EMA (medium-term trend)
- ema20Percentage: How far price is from 20-day EMA as a percentage
- ema50Percentage: How far price is from 50-day EMA as a percentage

EMA Interpretation:
- Price above both EMAs (20 & 50) = Strong bullish trend
- Price above 50-day but below 20-day EMA = Possible short-term pullback in bullish trend
- Price below 50-day but above 20-day EMA = Possible bullish reversal of a bearish trend
- Price below both EMAs = Bearish trend
- The percentages show how extended price is from these EMAs
- Large positive percentages may indicate overbought conditions
- Large negative percentages may indicate oversold conditions

When analyzing EMA position, explain what the current position means for the overall trend and potential future movements.

Social Trend Analysis:
The 'getSocialTrend' tool now includes additional social mentions analysis:
- social_mentions_ma2: 2-day moving average of social mentions (available from the 2nd day onwards)
- social_mentions_ma3: 3-day moving average of social mentions (available from the 3rd day onwards)
- social_trend_analysis: Contains trend information including:
  * mentions_trend: Shows if social mentions are "rising" or "falling"
  * last_value: The most recent social mentions count
  * previous_value: The previous day's social mentions count
  * change_percent: Percentage change in social mentions

Social Trend Interpretation:
- Rising social mentions with consistent uptrend in the MA = Strong positive social momentum
- Rising social mentions with flat MA = Potential spike that may not be sustainable
- Social mentions below their MA but rising = Early recovery in social interest
- Social mentions above their MA but falling = Possible peak in social interest

When analyzing social trend data, mention both the raw mentions and the moving average trend to provide context on whether the social interest is sustained or temporary.`,
      },
    ];
  }

  async initServer() {
    try {
      console.error("Initializing MCP server...");
      await this.mcpServer.initServer();
      console.error("MCP server initialized and connected successfully");
    } catch (error) {
      console.error("Failed to initialize MCP server:", error);
      throw error;
    }
  }

  async getTopAlerts() {
    try {
      console.error("Making direct API call to Trendmoon...");
      console.error("API URL: https://api.trendmoon.ai/get_top_alerts_today");

      if (!process.env.TRENDMOON_API_KEY) {
        throw new Error("TRENDMOON_API_KEY not set in environment variables");
      }

      const response = await fetch(
        "https://api.trendmoon.ai/get_top_alerts_today",
        {
          method: "GET",
          headers: {
            "Api-key": process.env.TRENDMOON_API_KEY,
            accept: "application/json",
          },
        }
      );

      console.error(
        `API Response Status: ${response.status} ${response.statusText}`
      );

      if (!response.ok) {
        console.error(
          "API request failed:",
          response.status,
          response.statusText
        );
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = (await response.json()) as any;
      console.error("Successfully retrieved alerts");
      console.error(
        `Alert data summary: ${
          data.coin_id
            ? `Found data for ${data.coin_id}`
            : "No coin_id in response"
        }`
      );
      return data;
    } catch (error) {
      console.error("Error getting top alerts:", error);
      throw error;
    }
  }

  async getSocialTrend(symbol: string) {
    try {
      const symbolUppercase = symbol.toUpperCase();
      const apiUrl = `https://api.qa.trendmoon.ai/social/trend?symbol=${symbolUppercase}&date_interval=4&time_interval=1d`;

      console.error(
        `Making direct API call to Trendmoon for ${symbolUppercase} social trend...`
      );
      console.error(`API URL: ${apiUrl}`);

      if (!process.env.TRENDMOON_API_KEY) {
        throw new Error("TRENDMOON_API_KEY not set in environment variables");
      }

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Api-key": process.env.TRENDMOON_API_KEY,
          accept: "application/json",
        },
      });

      console.error(
        `API Response Status: ${response.status} ${response.statusText}`
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
          return null;
        }
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = (await response.json()) as any;

      // Check if the response contains valid data
      if (!data || Object.keys(data).length === 0) {
        console.error(`Empty or invalid response data for ${symbolUppercase}`);
        return null;
      }

      // Calculate moving averages for social mentions if we have trend_market_data
      if (
        data.trend_market_data &&
        Array.isArray(data.trend_market_data) &&
        data.trend_market_data.length >= 2
      ) {
        console.error("Calculating moving averages for social trend data...");

        // Get social mentions array
        const socialMentions = data.trend_market_data.map(
          (day: any) => day.social_mentions || 0
        );
        console.error("Social mentions:", socialMentions);

        // Calculate 2-day moving average for all points that have sufficient data
        for (let i = 1; i < data.trend_market_data.length; i++) {
          const ma2 = (socialMentions[i] + socialMentions[i - 1]) / 2;
          data.trend_market_data[i].social_mentions_ma2 = parseFloat(
            ma2.toFixed(2)
          );
        }

        // Calculate 3-day moving average if we have enough data points
        if (data.trend_market_data.length >= 3) {
          for (let i = 2; i < data.trend_market_data.length; i++) {
            const ma3 =
              (socialMentions[i] +
                socialMentions[i - 1] +
                socialMentions[i - 2]) /
              3;
            data.trend_market_data[i].social_mentions_ma3 = parseFloat(
              ma3.toFixed(2)
            );
          }
        }

        // Add simple trend analysis
        if (data.trend_market_data.length >= 2) {
          const lastDay =
            data.trend_market_data[data.trend_market_data.length - 1];
          const prevDay =
            data.trend_market_data[data.trend_market_data.length - 2];

          const trendDirection =
            lastDay.social_mentions > prevDay.social_mentions
              ? "rising"
              : "falling";

          // Add trend analysis to the data object
          data.social_trend_analysis = {
            mentions_trend: trendDirection,
            last_value: lastDay.social_mentions,
            previous_value: prevDay.social_mentions,
            change_percent:
              lastDay.social_mentions > 0 && prevDay.social_mentions > 0
                ? (
                    ((lastDay.social_mentions - prevDay.social_mentions) /
                      prevDay.social_mentions) *
                    100
                  ).toFixed(2) + "%"
                : "N/A",
          };
        }

        console.error("Added moving averages to social trend data");
      }

      console.error(
        `Successfully retrieved social trend data for ${symbolUppercase}`
      );
      console.error(
        `Response data summary: ${
          data.coin_id
            ? `Found data for ${data.coin_id} (${data.symbol})`
            : "No coin_id in response"
        }`
      );
      return data;
    } catch (error) {
      console.error(`Error getting social trend for ${symbol}:`, error);
      throw error;
    }
  }

  async getProjectSummary(symbol: string) {
    try {
      const symbolUppercase = symbol.toUpperCase();
      const apiUrl = `https://api.qa.trendmoon.ai/social/project-summary?symbol=${symbolUppercase}&days_ago=7&force_regenerate=false`;
      console.error(
        `Making direct API call to Trendmoon for project summary of ${symbolUppercase}...`
      );
      console.error(`API URL: ${apiUrl}`);

      if (!process.env.TRENDMOON_API_KEY) {
        throw new Error("TRENDMOON_API_KEY not set in environment variables");
      }

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Api-key": process.env.TRENDMOON_API_KEY,
          accept: "application/json",
        },
      });

      console.error(
        `API Response Status: ${response.status} ${response.statusText}`
      );
      if (!response.ok) {
        console.error(
          "API request failed:",
          response.status,
          response.statusText
        );
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = (await response.json()) as any;
      console.error(
        `Successfully retrieved project summary for ${symbolUppercase}`
      );
      console.error(
        `Response data summary: ${
          data.coin_id
            ? `Found data for ${data.coin_id}`
            : "No coin_id in response"
        }`
      );
      return data;
    } catch (error) {
      console.error(`Error getting project summary for ${symbol}:`, error);
      throw error;
    }
  }

  // Fetch historical daily close prices from Binance
  async getHistoricalPrice(
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

  // Extract token symbol from a user query using OpenAI
  async extractTokenSymbol(query: string): Promise<string | null> {
    try {
      console.error("Extracting token symbol with OpenAI from:", query);
      console.error("Using OpenAI to process token extraction...");

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that identifies cryptocurrency token symbols in text.
Extract ONLY the cryptocurrency token symbol from the text. 
Return ONLY the uppercase symbol (like BTC, ETH, SOL) with no additional text.
If multiple tokens are mentioned, return the most prominent one.
If no token symbol is found, respond with "NULL".`,
          },
          {
            role: "user",
            content: query,
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      });

      // Log the complete OpenAI response for debugging
      console.error(
        "Complete OpenAI Response:",
        JSON.stringify(response, null, 2)
      );

      // Use optional chaining to safely access possibly undefined properties
      const content = response?.choices?.[0]?.message?.content ?? "";
      const trimmedResult = content.trim();
      console.error("OpenAI extracted token:", trimmedResult);
      console.error(
        "OpenAI response finish_reason:",
        response?.choices?.[0]?.finish_reason
      );
      console.error(
        "OpenAI response prompt_tokens:",
        response?.usage?.prompt_tokens
      );
      console.error(
        "OpenAI response completion_tokens:",
        response?.usage?.completion_tokens
      );
      console.error(
        "OpenAI response total_tokens:",
        response?.usage?.total_tokens
      );

      if (
        !trimmedResult ||
        trimmedResult === "NULL" ||
        trimmedResult === "None"
      ) {
        console.error("No valid token symbol extracted from OpenAI");
        return null;
      }

      console.error(`Successfully extracted token: ${trimmedResult}`);
      return trimmedResult;
    } catch (error) {
      console.error("Error using OpenAI for token extraction:", error);
      console.error("Falling back to rule-based extraction");

      // Fallback to basic rule-based method if OpenAI fails
      const commonTokens = [
        "BTC",
        "ETH",
        "SOL",
        "XRP",
        "ADA",
        "DOGE",
        "DOT",
        "AVAX",
        "MATIC",
        "SHIB",
        "UNI",
        "LTC",
        "ATOM",
        "XLM",
        "ALGO",
        "FIL",
        "TRX",
        "ETC",
        "NEAR",
      ];

      // Convert query to uppercase for case-insensitive matching
      const uppercaseQuery = query.toUpperCase();

      // Try to find a match for common tokens
      for (const token of commonTokens) {
        if (uppercaseQuery.includes(token)) {
          console.error(`Rule-based extraction found token: ${token}`);
          return token;
        }
      }

      // Look for patterns like "$TOKEN" or "TOKEN token"
      const symbolRegex =
        /\$([A-Z]{2,6})|\b([A-Z]{2,6})\s+(?:token|coin|crypto)/i;
      const match = query.match(symbolRegex);
      if (match) {
        // Make sure we're not accessing undefined values
        const extractedToken =
          (match[1] || match[2] || "").toUpperCase() || null;
        console.error(`Regex-based extraction found token: ${extractedToken}`);
        return extractedToken;
      }

      console.error("Could not extract any token symbol from query");
      return null;
    }
  }

  async processUserInput(userInput: string): Promise<string> {
    // 1) push the user's question
    this.conversationHistory.push({ role: "user", content: userInput });

    // 2) prepare your function definitions exactly as before…
    const functions = [
      {
        name: "getTopAlerts",
        description: "Get today's top crypto alerts from TrendMoon",
        parameters: { type: "object", properties: {}, required: [] },
      },
      {
        name: "getSocialTrend",
        description: "Get social trend data for a specific token",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Token symbol, e.g. BTC" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "getProjectSummary",
        description:
          "Get 7-day project summary for a specific token from TrendMoon API",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Token symbol, e.g. BTC" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "getHistoricalPrice",
        description:
          "Get the daily closing prices for the last 14 days for a specific token symbol from Binance.",
        parameters: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Token symbol, e.g. BTC, ETH",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "checkEMAPosition",
        description:
          "Check if a token's price is above its 20-day and 50-day EMA (Exponential Moving Average)",
        parameters: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Token symbol, e.g. BTC, ETH",
            },
          },
          required: ["symbol"],
        },
      },
    ];

    // 3) loop until the LLM stops asking for a function
    let finalResponse: string = "";
    let done = false;

    while (!done) {
      // Convert CoreMessage[] to OpenAI chat messages with correct types
      const messagesForLLM: ChatCompletionMessageParam[] =
        this.conversationHistory.map((msg) => {
          if (msg.role === "function") {
            // Function message requires name
            return {
              role: "function",
              name: msg.name!,
              content: msg.content,
            };
          } else if (msg.role === "assistant" && msg.name) {
            // Assistant message representing a function call needs name
            return {
              role: "assistant",
              name: msg.name,
              content: msg.content,
            };
          } else {
            // Regular user, assistant, or system message
            return {
              role: msg.role as "user" | "assistant" | "system",
              content: msg.content,
            };
          }
        });

      // Log the context being sent to the LLM for function selection
      console.error("--- Sending to LLM for function call decision ---");
      console.error("Messages:", JSON.stringify(messagesForLLM, null, 2));
      console.error("---------------------------------------------------");

      const res = await this.openai.chat.completions.create({
        model: "gpt-4-0613",
        messages: messagesForLLM,
        functions,
        function_call: "auto",
      });

      // Safely access the message
      const message = res.choices[0]?.message;
      if (!message) {
        console.error("LLM response missing message:", res);
        throw new Error("No message received from LLM");
      }

      // if the model wants to call a function…
      if (message.function_call) {
        const { name, arguments: argsJson } = message.function_call;
        if (!name) {
          console.error("Function call missing name:", message.function_call);
          throw new Error("Function call response missing name");
        }

        // Log the LLM's decision ("thinking")
        console.error(
          `---> LLM decided to call function: ${name} with arguments: ${argsJson}`
        );

        // record that intent (as an assistant message)
        this.conversationHistory.push({
          role: "assistant",
          name: name,
          content: "", // Content can be empty for function call indication
        });

        // run the actual function
        let result: any;
        try {
          const args = JSON.parse(argsJson || "{}");
          console.error(`Executing function: ${name} with args:`, args);
          if (name === "getTopAlerts") {
            result = await this.getTopAlerts();
          } else if (name === "getSocialTrend") {
            result = await this.getSocialTrend(args.symbol);
          } else if (name === "getProjectSummary") {
            result = await this.getProjectSummary(args.symbol);
          } else if (name === "getHistoricalPrice") {
            result = await this.getHistoricalPrice(args.symbol);
          } else if (name === "checkEMAPosition") {
            // Call the MCP server's checkEMAPosition method directly
            result = await this.mcpServer.checkEMAPosition(args.symbol);
          } else {
            console.error(`Attempted to call unknown function: ${name}`);
            throw new Error(`Unknown function: ${name}`);
          }
          console.error(`Function ${name} executed successfully.`);
        } catch (err) {
          console.error(`Error executing function ${name}:`, err);
          result = { error: (err as Error).message };
        }

        // push the function's output back into history
        this.conversationHistory.push({
          role: "function",
          name: name,
          content: JSON.stringify(result),
        });
        // then loop again—so the model can call the next tool or finish
        continue;
      }

      // otherwise it's done: record and break
      finalResponse = message.content ?? "";
      console.error("LLM finished, final response:", finalResponse);
      this.conversationHistory.push({
        role: "assistant",
        content: finalResponse,
      });
      done = true;
    }

    return finalResponse;
  }

  async generateSummary(data: any, type: "alert" | "social"): Promise<string> {
    try {
      const prompt =
        type === "alert"
          ? `Summarize the following cryptocurrency alert data in a clear, concise way that highlights key metrics and trends. Focus on price changes, volume, and market sentiment. Data: ${JSON.stringify(
              data
            )}`
          : `You are analyzing a time-series dataset of daily social trend metrics for a cryptocurrency. Each record includes: date, symbols_count, names_count, mentions_count, social_dominance, and sentiment_score. Provide a concise, human-readable summary that highlights how these metrics evolve over time—point out rises or drops, significant peaks or troughs, and overall sentiment shifts. Data: ${JSON.stringify(
              data
            )}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a cryptocurrency market analyst providing clear, concise summaries of market and social data. Focus on the most important metrics and trends.

Here's how to interpret TrendMoon Social API data (if present):
*   **Galaxy Score (0–100):** Higher is better. Measures combined social sentiment, technical analysis, and market activity. Above 80 = strong positive momentum. Below 40 = weak interest.
*   **AltRank:** Lower is better. Ranks a coin's social and market activity relative to Bitcoin. 1–50 = strong relative performance.
*   **Social Volume:** Number of social mentions. Higher volume often signals growing interest.
*   **Social Engagement:** Measures likes, retweets, and comments. High engagement with many unique contributors = organic attention.
*   **Contributors:** Unique accounts posting about the coin. A rising number supports healthy growth.

Interpretation Guidelines:
- Rising Galaxy Score + low AltRank + increasing contributors = bullish sentiment.
- Dropping Galaxy Score or engagement = weakening sentiment.
- Put this in context with Price development to give more context
- Explain if it was better to sell or buy the coin based on the data.

Use this context to classify coins as rising, stable, or falling in popularity and strength based on the provided data.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 250,
      });

      return (
        response.choices[0]?.message?.content ?? "Unable to generate summary."
      );
    } catch (error) {
      console.error("Error generating summary:", error);
      return "Error generating summary. Please check the raw data instead.";
    }
  }

  // I am adding methods to summarize top alerts and social trend for a single token
  async processTopAlerts(userInput: string): Promise<string> {
    console.error("Processing top alerts in processTopAlerts");
    const alertsData = await this.getTopAlerts();
    const summary = await this.generateSummary(alertsData, "alert");
    this.conversationHistory.push({ role: "assistant", content: summary });
    return summary;
  }

  async processSingleToken(
    userInput: string,
    tokenSymbol: string
  ): Promise<string> {
    console.error(
      `Processing single token ${tokenSymbol} in processSingleToken`
    );
    const trendData = await this.getSocialTrend(tokenSymbol);
    const summary = await this.generateSummary(trendData, "social");
    this.conversationHistory.push({ role: "assistant", content: summary });
    return summary;
  }

  async start() {
    console.error("==========================================");
    console.error("Starting agent...");
    console.error("==========================================");
    await this.initServer();
    console.error("Agent started successfully");
  }

  async stop() {
    try {
      console.error("Shutting down MCP server...");
      await this.mcpServer.stop();
      console.error("MCP server closed successfully");
    } catch (error) {
      console.error("Error closing MCP connections:", error);
    }
  }

  async getSocialTrendWithMA(symbol: string): Promise<any> {
    return this.mcpServer.getSocialTrendWithMA(symbol);
  }

  async checkEMAPosition(symbol: string): Promise<any> {
    return this.mcpServer.checkEMAPosition(symbol);
  }
}
