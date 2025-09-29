# Allora MCP Server

This is a Model Context Protocol (MCP) server implementation for fetching machine learning inferences from the Allora Network, providing access to Allora's prediction markets data through the Model Context Protocol.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

The Allora MCP server allows AI systems and applications to access Allora prediction markets data through the standardized Model Context Protocol (MCP), enabling seamless integration of prediction market data into AI workflows. This server provides direct access to Allora topics, market predictions, and inference data.

## Prerequisites

- Node.js 18+ or Docker
- An Allora API key (sign up at [developer.allora.network](https://developer.allora.network))

## Quickstart

Docker:
```
docker run -p 3001:3001 -e PORT=3001 -e ALLORA_API_KEY=your_api_key alloranetwork/mcp-server

# Or with environment variables in a file:
docker run -p 3001:3001 --env-file .env alloranetwork/mcp-server
```

`docker-compose`:
```
docker-compose up
```

`npx`:
```
npx @alloralabs/mcp-server
```

Node.js:
```
npm run start
```

## API

Once the server is running, you can interact with it using any MCP client. The server exposes the following endpoints:

- `GET /sse` - SSE connection endpoint for MCP communications
- `POST /messages` - Message endpoint for MCP communications

Point your LLM/tooling at http://localhost:3001/sse to start using the server.

### Available Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `list_all_topics` | Fetch a list of all Allora topics | None |
| `get_inference_by_topic_id` | Fetch inference data for a specific topic | `topicID`: number |

### Example Usage with Claude

When connected to Claude or other MCP-compatible AI systems, you can access Allora data with:

```
What topics are available in Allora?
```

Or get specific inference data:

```
What is the current prediction for BTC price in 8 hours?
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
