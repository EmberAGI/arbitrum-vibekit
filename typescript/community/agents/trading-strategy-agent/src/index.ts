/**
 * Clarity One Trading Strategy Agent for Vibekit
 * ================================================
 * RSI/EMA mean-reversion + grid trading strategy for Arbitrum DEXes.
 *
 * Exposes trading tools via MCP for AI agent interaction:
 * - Signal scanning (RSI, EMA, Bollinger Bands, volatility)
 * - Position management with risk controls
 * - Automated trading cycles (dry-run by default)
 * - Market overview and analysis
 *
 * Built for Arbitrum Trailblazer 2.0 / Vibekit ecosystem.
 *
 * Usage:
 *   npx tsx src/index.ts              # start MCP server
 *   DRY_RUN=false npx tsx src/index.ts  # live mode (careful!)
 */

import "dotenv/config";
import { tradingSkill } from "./skills/trading.js";

// MCP server implementation (stdio transport)
import { createInterface } from "readline";

const SERVER_INFO = {
  name: "clarity-trading-agent",
  version: "1.0.0",
};

const CAPABILITIES = {
  tools: {},
};

// Flatten skill tools into MCP tool definitions
const TOOLS = tradingSkill.tools.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: {
    type: "object" as const,
    properties: t.parameters || {},
  },
}));

const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
for (const tool of tradingSkill.tools) {
  handlers[tool.name] = tool.handler;
}

function handleRequest(request: {
  method: string;
  id?: number | string;
  params?: Record<string, unknown>;
}): { jsonrpc: string; id?: number | string; result?: unknown; error?: unknown } | null {
  const { method, id, params = {} } = request;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      },
    };
  }

  if (method === "notifications/initialized") return null;

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "tools/call") {
    const toolName = (params.name as string) || "";
    const args = (params.arguments as Record<string, unknown>) || {};
    const handler = handlers[toolName];

    if (!handler) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    // Return a promise-based response
    return {
      jsonrpc: "2.0",
      id,
      result: "__ASYNC__",
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

async function handleRequestAsync(request: {
  method: string;
  id?: number | string;
  params?: Record<string, unknown>;
}): Promise<{ jsonrpc: string; id?: number | string; result?: unknown; error?: unknown } | null> {
  const { method, id, params = {} } = request;

  if (method === "tools/call") {
    const toolName = (params.name as string) || "";
    const args = (params.arguments as Record<string, unknown>) || {};
    const handler = handlers[toolName];

    if (!handler) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    try {
      const result = await handler(args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
      };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: String(e) },
      };
    }
  }

  return handleRequest(request);
}

// Stdio transport
async function main() {
  console.error(`[clarity-trading-agent] Starting MCP server (stdio)`);
  console.error(`[clarity-trading-agent] Tools: ${TOOLS.map((t) => t.name).join(", ")}`);

  const rl = createInterface({ input: process.stdin });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const request = JSON.parse(trimmed);
      const response = await handleRequestAsync(request);
      if (response) {
        process.stdout.write(JSON.stringify(response) + "\n");
      }
    } catch (e) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `Parse error: ${e}` },
        }) + "\n"
      );
    }
  }
}

main().catch(console.error);
