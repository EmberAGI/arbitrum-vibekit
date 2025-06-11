## Overview

The `lib` directory contains the core libraries and tool packages that power the Arbitrum Vibekit. Each subfolder serves a distinct purpose in enabling agent-to-agent communication, on-chain action planning, and integration with the Model Context Protocol (MCP). For more information about each subfolder, checkout its dedicated `README.md` file.

## Folder Structure

#### 1. `a2a/`

Developed by Google, this package provides agent-to-agent (A2A) communication samples and schemas. It is useful for building and testing multi-agent workflows or integrating with other A2A-compliant systems.

#### 2. `arbitrum-vibekit-core/`

This is the Arbitrum Vibekit framework. It's the main shared library for Arbitrum Vibekit agents that provides TypeScript utilities, schemas, and other core agent logic. This package is imported by all agents to ensure consistent transaction artifact handling and MCP integration.

#### 3. `ember-schemas/`

This directory contains schemas related to Ember for data validation, serialization, or communication protocols within the Arbitrum Vibekit ecosystem.

#### 4. `mcp-tools/`

This directory houses all MCP tool server implementations. Each subdirectory (e.g., `emberai-mcp/`) is a standalone MCP tool server, exposing DeFi operations or data-fetching capabilities via the Model Context Protocol. These tools are used by agents to interact with on-chain data, execute DeFi actions, or integrate with external APIs. It also includes example schemas and setup instructions for building new tools.

#### 5. `test-utils/`

This directory contains utility functions, mock data, or helper scripts used for testing other packages within the `lib` directory, ensuring code quality and reliability.
