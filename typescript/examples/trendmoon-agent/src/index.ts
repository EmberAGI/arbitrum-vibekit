import express from "express";
import { Agent } from "./agent.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import type { AddressInfo } from "net";
import { createServer } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in the current directory
dotenv.config();

console.error("Starting server initialization...");
console.error(
  "TRENDMOON_API_KEY:",
  process.env.TRENDMOON_API_KEY ? "Set" : "Not set"
);
console.error(
  "OPENAI_API_KEY:",
  process.env.OPENAI_API_KEY ? "Set" : "Not set"
);

const app = express();
app.use(express.json());
app.use(cors());

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
console.error(`Port configured: ${port}`);

console.error("Creating Agent instance...");
const agent = new Agent();

app.get("/", (_req, res) => {
  console.error("Received request to root endpoint");
  res.json({
    name: "Trendmoon MCP Agent Server",
    version: "1.0.0",
    status: "running",
    endpoints: {
      "/": "Server information (this response)",
      "/alerts": "GET endpoint for top alerts",
      "/ask": "POST endpoint to ask agent a question",
      "/social-trend/:symbol":
        "GET endpoint for social trend data for a specific token",
      "/social-trend":
        "POST endpoint to extract token and get social trend data",
      "/extract-token": "POST endpoint to test token extraction",
      "/social-trend-ma/:symbol":
        "GET endpoint for social trend data with moving averages for a specific token",
      "/ema-position/:symbol":
        "GET endpoint to check if token price is above 20-day and 50-day EMAs",
      "/api":
        "POST endpoint to access all functionality with an 'action' parameter",
    },
  });
});

app.get("/alerts", async (_req, res) => {
  console.error("Processing request to /alerts endpoint (GET)");
  try {
    const alerts = await agent.getTopAlerts();
    console.error("Successfully retrieved alerts");
    res.json(alerts);
  } catch (error) {
    console.error("Error handling /alerts request:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add POST support for /alerts endpoint
app.post("/alerts", async (_req, res) => {
  console.error("Processing request to /alerts endpoint (POST)");
  try {
    const alerts = await agent.getTopAlerts();
    console.error("Successfully retrieved alerts");
    res.json(alerts);
  } catch (error) {
    console.error("Error handling /alerts request:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add a direct endpoint for social trend with symbol in URL
app.get("/social-trend/:symbol", async (req, res) => {
  console.error(
    `Received request to /social-trend/${req.params.symbol} endpoint`
  );
  try {
    const symbol = req.params.symbol.toUpperCase();
    const trendData = await agent.getSocialTrend(symbol);
    console.error(`Successfully retrieved social trend data for ${symbol}`);
    res.json(trendData);
  } catch (error) {
    console.error("Error handling /social-trend request:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add an endpoint that extracts the token from a text query
app.post("/social-trend", async (req, res) => {
  console.error("Received request to /social-trend endpoint");
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid query parameter" });
  }

  // Extract token symbol from query
  const tokenSymbol = await agent.extractTokenSymbol(query);
  if (!tokenSymbol) {
    return res
      .status(400)
      .json({ error: "Could not identify a token symbol in the query" });
  }

  try {
    const trendData = await agent.getSocialTrend(tokenSymbol);
    console.error(
      `Successfully retrieved social trend data for ${tokenSymbol}`
    );
    res.json({
      symbol: tokenSymbol,
      data: trendData,
      extracted_from: query,
    });
  } catch (error) {
    console.error(
      `Error handling /social-trend request for ${tokenSymbol}:`,
      error
    );
    res.status(500).json({
      error: (error as Error).message,
      symbol: tokenSymbol,
      extracted_from: query,
    });
  }
});

// Add a new endpoint to interact with the agent
app.post("/ask", async (req, res) => {
  console.error("Received request to /ask endpoint");
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid query parameter" });
  }

  try {
    const result = await agent.processUserInput(query);
    console.error("Successfully processed user query");

    console.log("Final Response:", result);

    // Send only the final response string as the result
    res.json({ result: result });
  } catch (error) {
    console.error("Error handling /ask request:", error);
    res.status(500).json({
      error: (error as Error).message,
      conversation: agent.conversationHistory,
    });
  }
});

// Add a new endpoint to test token extraction
app.post("/extract-token", async (req, res) => {
  console.error("Received request to /extract-token endpoint");
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid query parameter" });
  }

  try {
    const tokenSymbol = await agent.extractTokenSymbol(query);
    console.error(
      `Extracted token symbol from query: ${tokenSymbol || "None found"}`
    );

    res.json({
      query,
      extracted_token: tokenSymbol,
      success: tokenSymbol !== null,
    });
  } catch (error) {
    console.error("Error handling /extract-token request:", error);
    res.status(500).json({
      error: (error as Error).message,
      query,
    });
  }
});

// Add a unified endpoint to proxy multiple actions under a single route
app.post("/api", async (req, res) => {
  console.error("Received request to /api endpoint");
  const { action, symbol, query } = req.body;
  if (!action || typeof action !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid action parameter" });
  }
  try {
    let data: any;
    switch (action) {
      case "alerts":
        console.error("Action alerts");
        data = await agent.getTopAlerts();
        break;
      case "social-trend":
        console.error(`Action social-trend for symbol: ${symbol}`);
        if (!symbol || typeof symbol !== "string") {
          return res
            .status(400)
            .json({ error: "Missing or invalid symbol parameter" });
        }
        data = await agent.getSocialTrend(symbol.toUpperCase());
        break;
      case "extract-token":
        console.error(`Action extract-token for query: ${query}`);
        if (!query || typeof query !== "string") {
          return res
            .status(400)
            .json({ error: "Missing or invalid query parameter" });
        }
        data = await agent.extractTokenSymbol(query);
        break;
      case "ask":
        console.error(`Action ask for query: ${query}`);
        if (!query || typeof query !== "string") {
          return res
            .status(400)
            .json({ error: "Missing or invalid query parameter" });
        }
        const result = await agent.processUserInput(query);
        data = { result, conversation: agent.conversationHistory };
        break;
      case "getSocialTrendWithMA":
        console.error(`Action getSocialTrendWithMA for symbol: ${symbol}`);
        if (!symbol || typeof symbol !== "string") {
          return res
            .status(400)
            .json({ error: "Missing or invalid symbol parameter" });
        }
        data = await agent.getSocialTrendWithMA(symbol.toUpperCase());
        break;
      case "checkEMAPosition":
        console.error(`Action checkEMAPosition for symbol: ${symbol}`);
        if (!symbol || typeof symbol !== "string") {
          return res
            .status(400)
            .json({ error: "Missing or invalid symbol parameter" });
        }
        data = await agent.checkEMAPosition(symbol.toUpperCase());
        break;
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    console.error(`Action ${action} completed successfully`);
    return res.json(data);
  } catch (error) {
    console.error(`Error in /api endpoint for action ${action}:`, error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

// Add a special endpoint to filter top alerts by token symbol
app.get("/filter/:symbol", async (req, res) => {
  console.error(`Processing request to /filter/${req.params.symbol} endpoint`);
  try {
    const symbol = req.params.symbol.toLowerCase();
    const alerts = await agent.getTopAlerts();

    // Find the token in the alerts
    let tokenData = null;
    if (Array.isArray(alerts)) {
      tokenData = alerts.find(
        (token) =>
          token.symbol.toLowerCase() === symbol ||
          token.coin_id.toLowerCase() === symbol ||
          token.name.toLowerCase().includes(symbol)
      );
    }

    if (tokenData) {
      console.error(`Found data for ${symbol} in top alerts`);
      res.json(tokenData);
    } else {
      console.error(`No data found for ${symbol} in top alerts`);
      res.status(404).json({
        error: `No data found for ${symbol}`,
        available_tokens: Array.isArray(alerts)
          ? alerts.map((a) => a.symbol)
          : [],
      });
    }
  } catch (error) {
    console.error(
      `Error handling /filter/${req.params.symbol} request:`,
      error
    );
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add endpoint for social trend with moving averages
app.get("/social-trend-ma/:symbol", async (req, res) => {
  console.error(
    `Received request to /social-trend-ma/${req.params.symbol} endpoint`
  );

  try {
    const symbol = req.params.symbol.toUpperCase();
    const trendData = await agent.getSocialTrendWithMA(symbol);

    if (!Array.isArray(trendData) || trendData.length === 0) {
      console.error(`No valid social trend data found for ${symbol}`);
      return res
        .status(404)
        .json({ error: `No trend data found for ${symbol}` });
    }

    const normalizeField = (data: Array<Record<string, any>>, key: string) => {
      const values = data
        .map((item: Record<string, any>) => item[key])
        .filter((v: any) => typeof v === "number");
      const min = Math.min(...values);
      const max = Math.max(...values);
      return data.map((item: Record<string, any>) => ({
        ...item,
        [`${key}_normalized`]:
          typeof item[key] === "number" && max !== min
            ? (item[key] - min) / (max - min)
            : 0,
      }));
    };

    const normalizeTimeSeries = (data: Array<Record<string, any>>) => {
      let normalizedData = [...data].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const keysToNormalize = [
        "social_mentions",
        "social_dominance",
        "price",
        "market_cap",
        "total_volume",
        "lc_sentiment",
        "lc_social_dominance",
        "lc_galaxy_score",
      ];

      for (const key of keysToNormalize) {
        normalizedData = normalizeField(normalizedData, key);
      }

      return normalizedData;
    };

    const normalizedTrendData = normalizeTimeSeries(trendData);
    console.error(`Successfully normalized social trend data for ${symbol}`);
    res.json(normalizedTrendData);
  } catch (error) {
    console.error("Error handling /social-trend-ma request:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add endpoint for EMA position check
app.get("/ema-position/:symbol", async (req, res) => {
  console.error(
    `Received request to /ema-position/${req.params.symbol} endpoint`
  );
  try {
    const symbol = req.params.symbol.toUpperCase();
    const emaData = await agent.checkEMAPosition(symbol);
    console.error(`Successfully retrieved EMA position data for ${symbol}`);
    res.json(emaData);
  } catch (error) {
    console.error("Error handling /ema-position request:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Function to find an available port
const findAvailablePort = (startPort: number): Promise<number> => {
  return new Promise((resolve) => {
    const server = createServer();

    // Try the specified port first
    server.listen(startPort, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => {
        resolve(port);
      });
    });

    // If port is in use, increment and try again
    server.on("error", () => {
      // Generate a random port between 3001 and 3999
      const randomPort = Math.floor(Math.random() * 999) + 3001;
      resolve(findAvailablePort(randomPort));
    });
  });
};

const main = async () => {
  try {
    console.error("Starting agent...");
    await agent.start();

    // Find an available port
    const availablePort = await findAvailablePort(port);
    console.error(`Using available port: ${availablePort}`);

    console.error("Starting Express server...");
    app.listen(availablePort, () => {
      console.error(
        `Trendmoon MCP Agent Server running on port ${availablePort}`
      );
      console.error("Server ready to accept connections");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Make sure we only run the main function once
let hasStarted = false;
if (!hasStarted) {
  hasStarted = true;
  console.error("Starting main process...");
  main();
}
