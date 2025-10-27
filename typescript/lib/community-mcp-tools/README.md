## Community MCP Tools

Welcome to Vibekit's MCP tools directory! Model Context Protocol (MCP) tools are standardized interfaces that allow agents to easily interact with on-chain data, execute DeFi operations, and integrate with external services. This directory contains the MCP building blocks that provide DeFi agents with sophisticated functionality.

## Before You Contribute

1. **Review Contribution Guidelines**: Please read the [CONTRIBUTIONS.md](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md) file for detailed guidelines on how to contribute.

2. **Check Open Issues**: Browse the [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see what the community is working on and find opportunities to contribute.

3. **Check the Contribution Center**: Visit our [Contribution Center](https://github.com/orgs/EmberAGI/projects/13) to learn about ongoing contributions. Some contributions may qualify for the [Trailblazer Fund 2.0](https://www.emberai.xyz/blog/introducing-arbitrum-vibekit-and-the-trailblazer-fund-2-0) initiative launched by Arbitrum.

## Available MCP Tools

### Ember MCP Server

**Remote Server**: ` https://api.emberai.xyz/mcp`

**Client agents**: All Vibekit agents and templates (core integration)

The official Ember MCP server providing access to Ember's core AI capabilities and DeFi tools. This remote server offers standardized interfaces for agent-to-agent communication and advanced DeFi operations.

### Allora MCP Server

**Directory**: [`allora-mcp-server/`](./allora-mcp-server/)

**Client agents**: [`allora-price-prediction-agent`](../../community/allora-price-prediction-agent/)

Provides access to Allora Network's machine learning predictions and inference data. Enables agents to fetch prediction market data and topic information for AI-powered decision making.

### CoinGecko MCP Server

**Directory**: [`coingecko-mcp-server/`](./coingecko-mcp-server/)

**Client agents**: Available to all agents through the web client

Cryptocurrency price data and interactive chart generation using CoinGecko API. Supports 11+ major tokens with multi-timeframe historical data and rate limit handling.

### DeFiSafety MCP Server

**Directory**: [`defisafety-implementation/`](./defisafety-implementation/)

**Client agents**: [`defisafety-agent`](../../community/defisafety-agent/)

Documentation scraping and evaluation tool using RAG (Retrieval Augmented Generation) with DeFiSafety criteria scoring. Enables agents to assess protocol documentation against security and transparency standards.

## Build Your MCP Tool

By contributing new MCP tools, you expand the capabilities available to all Vibekit agents. Your tools can enable new DeFi strategies or enhance existing functionality.

To showcase your MCP tool, consider building a demo agent in the [community](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community) directory. A working example demonstrates your tool's functionality and helps others understand how to integrate it into their projects.

We're excited to see what you build! Join our [Telegram chat](https://t.me/EmberChat) for updates and support.
