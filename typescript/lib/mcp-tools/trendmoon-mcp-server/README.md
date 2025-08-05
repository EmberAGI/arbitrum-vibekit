# Trendmoon MCP Server
Trendmoon is a powerful MCP (Model Context Protocol) server that serves as an interface between AI models and your applications. By implementing the MCP protocol, Trendmoon enables AI agents and LLMs to communicate effectively through standardized interfaces, facilitating integration and execution of complex tasks.
## Prerequisites
**1. Node.js ≥20**

**2. pnpm**

**3. TypeScript** (configured in the file) `tsconfig.json`

## Quick Start

Run the setup script to initialize the environment:
``` bash
   ./setup.sh
```
This script will:
- Create an file from if needed `.env .env.example`
- Install dependencies
- Build the project

1. Start the server:
``` bash
   # Stdio mode (default)
   pnpm start
   
   # HTTP mode
   TRENDMOON_HTTP_MODE=true pnpm dev
```
## Operation Modes
Trendmoon MCP Server can operate in two different modes:
### Stdio Mode
Stdio mode is used for direct integration with applications that support the MCP protocol. In this mode, the server communicates through standard input and output streams.
### HTTP Mode
HTTP mode exposes the MCP server functionality via a REST API, enabling easier integration with web applications and third-party services.
To start in HTTP mode:
``` bash
TRENDMOON_HTTP_MODE=true pnpm dev
```
Or with Docker:
``` bash
pnpm docker:compose:up
```
## Inspection and Debugging
One of the key features of Trendmoon is its ability to be inspected with the tool. This feature allows you to visualize and test the available MCP tools. `@modelcontextprotocol/inspector`
To inspect your Trendmoon server:
``` bash
pnpm run inspect:npx
```
This command:
1. Builds the project with `pnpm run build`
2. Launches the MCP inspector with `npx -y @modelcontextprotocol/inspector`
3. Starts the server with `node ./dist/index.js`

The inspector typically opens a web interface at [http://127.0.0.1:6274](http://127.0.0.1:6274) where you can:
- Connect to the server
- List available tools
- Test tools with custom parameters

## Deployment with Docker
Trendmoon can be easily deployed using Docker:
``` bash
# Build Docker image
pnpm docker:build

# Run Docker container
pnpm docker:run

# Or use Docker Compose
pnpm docker:compose:up
```
The file configures the server to run in HTTP mode on port 3000. `docker-compose.yml`
## Available Scripts
- `build`: Compiles the TypeScript project
- `dev`: Starts the server in development mode
- `start`: Starts the server from compiled code
- `inspect:npx` : Builds and launches the MCP inspector
- `docker:build` : Builds the Docker image
- `docker:run` : Runs the Docker container
- `docker:compose:up` : Starts the service with Docker Compose
- `docker:compose:down` : Stops the Docker Compose service
- `lint` : Checks/fixes code with ESLint `lint:fix`
- `format` : Formats/checks code with Prettier `format:check`

# Environment Variables Table

Here is a summary table of the environment variables for the Trendmoon MCP server:

| Variable | Description | Default Value | Required |
|----------|-------------|---------------|----------|
| `TRENDMOON_HTTP_MODE` | Enable HTTP mode | `false` | No |
| `TRENDMOON_HTTP_PORT` | Port for the HTTP server | `3000` | No (only in HTTP mode) |
| `TRENDMOON_SERVER_NAME` | Name of the MCP server | `"trendmoon-mcp-server"` | No |
| `TRENDMOON_API_URL` | Trendmoon API URL | `https://api.qa.trendmoon.ai` | Yes |
| `TRENDMOON_API_KEY` | API key for authentication | - | Yes |

These variables should be defined in the `.env` file at the root of the project.

You can use the provided `setup.sh` script which will automatically create an `.env` file from the `.env.example` file if needed.

