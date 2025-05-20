## Overview

The `lib` directory contains the core libraries and tool packages that power the Arbitrum Vibekit. Each subfolder serves a distinct purpose in enabling agent-to-agent communication, on-chain action planning, and integration with the Model Context Protocol (MCP). For more information about each subfolder, checkout its dedicated `README.md` file.

## Folder Structure

#### 1. `arbitrum-vibekit/`

This is the main shared library for Arbitrum Vibekit agents, and provides TypeScript utilities, schemas, and other core agent logic. This package is imported by all agents to ensure consistent transaction artifact handling and MCP integration.

#### 2. `mcp-tools/`

This directory houses all MCP tool server implementations. Each subdirectory (e.g., `emberai-mcp/`) is a standalone MCP tool server, exposing DeFi operations or data-fetching capabilities via the Model Context Protocol. These tools are used by agents to interact with on-chain data, execute DeFi actions, or integrate with external APIs. It also includes example schemas and setup instructions for building new tools.

#### 3. `a2a/`

Developed by Google, this package provides agent-to-agent (A2A) communication samples and schemas. It is useful for building and testing multi-agent workflows or integrating with other A2A-compliant systems.
