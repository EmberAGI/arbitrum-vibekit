## Introduction

This directory contains an example agent implementation built using the **Arbitrum AgentKit** and the Model Context Protocol (MCP). This agent connects to the **TrendMoon API** to fetch cryptocurrency market data and social insights.

### About TrendMoon

**TrendMoon** is a social data AI platform that aggregates large volumes of Telegram data to understand what people are talking about and where their attention lies. In the fast-paced world of crypto, where hype drives market movements, attention is currency. TrendMoon cuts through the noise, transforming chaotic social interactions into precise, actionable insights.

By analyzing data from over 19,000+ Telegram groups, TrendMoon identifies emerging trends, enabling investors to capture opportunities before they go mainstream. With a sophisticated analytics pipeline to filter out noise, tools for narrative dominance, project mindshare, market sentiment visualizations among much more, TrendMoon empowers users to strategically follow and capitalize on shifts in social attention. Additionally, automated trading strategies integrate our social signals, allowing seamless investment decisions backed by real-time data and advanced trading tools.

*   **Website:** [trendmoon.ai](http://trendmoon.ai/)
*   **Documentation:** [docs.trendmoon.ai](https://trend-lens.gitbook.io/trend-moon-docs/)
*   **Twitter:** [x.com/0xTrendMoon](https://x.com/0xTrendMoon)
*   **Linktree:** [t.co/7FJ4N8VNtB](https://t.co/7FJ4N8VNtB)

### This Agent

This example agent demonstrates how to:
*   Set up an Express server to expose agent functionalities via HTTP endpoints.
*   Define MCP tools that wrap TrendMoon API calls (and other relevant APIs like Binance for price data).
*   Utilize an LLM (OpenAI) for natural language understanding, function calling (to select the appropriate MCP tool), and generating summarized responses based on the fetched data.

**Disclaimer:** This agent is currently an **example implementation** and is **under development**. It does **not** expose the full range of capabilities offered by the TrendMoon platform. Furthermore, the agent and its tools have **not been specifically fine-tuned** for optimal performance within the MCP framework and serve primarily as a demonstration of integrating external APIs and LLM logic via MCP.

## File Overview

1.  **`src/index.ts`**
    *   Creates a Node.js server using Express.
    *   Initializes the `Agent` class.
    *   Defines various HTTP endpoints (e.g., `/ask`, `/alerts`, `/social-trend`, `/filter/:symbol`) to interact with the agent's capabilities. The primary interaction endpoint for natural language queries is `/ask`.
    *   Handles loading environment variables (API Keys).

2.  **`src/agent.ts`**
    *   Defines the core `Agent` logic.
    *   Initializes an MCP Server (`@modelcontextprotocol/sdk/server/mcp.js`) and registers specific tools that correspond to data-fetching operations.
    *   Registered MCP Tools:
        *   `getTopAlerts`: Fetches current market alerts from TrendMoon.
        *   `getSocialTrend`: Fetches time-series social data (mentions, sentiment, etc.) for a specific token from TrendMoon.
        *   `getProjectSummary`: Fetches a 7-day summary for a specific token from TrendMoon.
        *   `getHistoricalPrice`: Fetches recent daily closing prices for a token from the Binance API.
    *   Initializes an OpenAI client (`openai`) for processing user input, deciding which tool to call (function calling), extracting necessary parameters (like token symbols), and generating natural language summaries.
    *   Contains methods that directly call the TrendMoon and Binance APIs, which are used by the MCP tools and potentially the Express endpoints.
    *   Manages conversation history for context during interactions.

3.  **`src/agentToolHandlers.ts`**
    *   Contains generic helper functions for parsing responses received from MCP tool calls.

## Agent Capabilities & Tools

This agent leverages its registered MCP tools and OpenAI integration to provide the following functionalities, primarily through the `/ask` endpoint:

*   **Fetch Top Crypto Alerts:** Retrieves the latest market alerts identified by TrendMoon. (Uses `getTopAlerts` tool)
*   **Get Social Trend Data:** Provides social metrics (mentions, sentiment, dominance) over time for a specified token. (Uses `getSocialTrend` tool)
*   **Get Project Summary:** Delivers a concise summary of a token's recent activity and social standing based on TrendMoon data. (Uses `getProjectSummary` tool)
*   **Get Historical Price Data:** Fetches the last 14 days of closing prices for a token from Binance. (Uses `getHistoricalPrice` tool)
*   **Natural Language Query Processing & Summarization:** Understands user requests in natural language, determines the required data (alerts, social trend, price, summary), extracts relevant parameters (like token symbols), calls the appropriate tool(s), and synthesizes the information into a coherent response using OpenAI.

## Example Usage

You can interact with the agent by sending POST requests to the `/ask` endpoint on the running server (default port 3001).

**Example 1: Analyze a specific token**

```

curl -X POST http://localhost:3001/ask \
     -H "Content-Type: application/json" \
     -d '{
           "query": "Can you analyze Ethereum? I want to see its social sentiment and recent price action."
         }'
```

**Example 2: Get general market alerts**

```

curl -X POST http://localhost:3001/ask \
     -H "Content-Type: application/json" \
     -d '{
           "query": "What are the top crypto alerts today?"
         }'
```

**Example 3: Get a summary for a token**

```

curl -X POST http://localhost:3001/ask \
     -H "Content-Type: application/json" \
     -d '{
           "query": "Give me a summary for Solana (SOL)."
         }'
```

## Setup & Running

1.  **Install Dependencies:**
    ```bash
    pnpm install
    ```

2.  **Set Up Environment Variables:**
    *   Create a `.env` file in the `TrendMoonAPIAgent` directory.
    *   Add your API keys to the `.env` file:
        ```dotenv
        TRENDMOON_API_KEY=your_trendmoon_api_key_here
        OPENAI_API_KEY=your_openai_api_key_here
        # Optional: Specify a port, otherwise defaults to 3001
        # PORT=3001
        ```

3.  **Build the Agent:**
    ```bash
    pnpm run build
    ```

4.  **Run the Agent:**
    ```bash
    pnpm run start
    ```

6.  **Interact:** The server will start (typically on port 3001). You can now send requests to the endpoints (like `/ask`) using tools like `curl` or integrate it into other applications.

## Further Development

This example can be expanded by:
*   Adding more MCP tools to cover other TrendMoon API endpoints.
*   Implementing more sophisticated error handling and response validation.
*   Fine-tuning the prompts used with the LLM for better summarization and tool selection.
*   Integrating other data sources or on-chain functionalities.
````
