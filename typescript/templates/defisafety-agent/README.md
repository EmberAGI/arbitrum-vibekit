# DeFi Safety Agent

An AI agent for evaluating DeFi protocol safety and documentation quality using the established DeFiSafety criteria. This agent integrates with the Arbitrum Vibekit framework to provide comprehensive protocol assessments through natural language interactions.

## Features

- **Protocol Safety Evaluation**: Complete assessment using DeFiSafety criteria (Q1-Q10)
- **Comparative Analysis**: Side-by-side comparison of multiple protocols
- **Comprehensive Reports**: Detailed safety reports with scores and recommendations
- **Natural Language Interface**: Easy-to-use conversational interface
- **Weighted Scoring**: Industry-standard DeFiSafety scoring methodology

## DeFiSafety Criteria

The agent evaluates protocols against 10 key criteria with weighted importance:

### Critical Documentation (44% of total score)
- **Q1 - Contract Addresses (15%)**: Availability and accuracy of smart contract addresses
- **Q4 - Architecture Documentation (12%)**: System design and component interaction docs
- **Q9 - Change Capabilities (12%)**: Governance and modification processes
- **Q2 - Public Repository (5%)**: Open source code availability

### Security & Risk Management (33% of total score)
- **Q10 - Oracle Documentation (12%)**: Price feed and external data documentation
- **Q7 - Upgradeability (10%)**: Upgrade mechanisms and procedures
- **Q5 - Bug Bounty Programs (8%)**: Security vulnerability disclosure programs
- **Q3 - Whitepaper/Docs (5%)**: Foundational technical documentation

### Transparency & Governance (23% of total score)
- **Q6 - Admin Controls (8%)**: Administrative function documentation
- **Q8 - Contract Ownership (7%)**: Ownership structure and control mechanisms

## Usage Examples

```bash
# Evaluate a single protocol
"Evaluate the safety of Aave protocol from https://docs.aave.com"

# Compare multiple protocols
"Compare Uniswap and SushiSwap safety scores"

# Generate detailed report
"Generate a comprehensive safety report for Compound protocol"
```

## Environment Variables

The agent requires these environment variables:

```bash
# AI Provider (choose one)
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key

# Agent Configuration
AGENT_NAME=DeFi Safety Agent
AGENT_VERSION=1.0.0
PORT=3010

# Optional
LLM_MODEL=google/gemini-2.0-flash-thinking-exp-1219
ENABLE_CORS=true
```

## Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build the agent
pnpm build

# Run tests
pnpm test

# Production mode
pnpm start
```

## Docker

```bash
# Build and run with Docker Compose
docker compose up defisafety-agent

# Or build standalone
docker build -f Dockerfile -t defisafety-agent .
docker run -p 3010:3010 --env-file .env defisafety-agent
```

## API Endpoints

- **Agent Card**: `GET /.well-known/agent.json`
- **SSE Stream**: `GET /sse`
- **Health Check**: `GET /health`

## Architecture

The agent follows the Vibekit V2 framework architecture:

```
defisafety-agent/
├── src/
│   ├── index.ts              # Main agent entry point
│   ├── skills/
│   │   └── defiSafetyEvaluation.ts  # Primary skill definition
│   └── tools/
│       ├── evaluateProtocol.ts     # Single protocol evaluation
│       ├── compareProtocols.ts     # Multi-protocol comparison
│       └── generateReport.ts       # Detailed report generation
├── test/                    # Vitest test suite
└── Dockerfile              # Container configuration
```

## Integration

The agent integrates with:

- **MCP Server**: `defisafety-implementation` for evaluation logic
- **Frontend**: Vibekit web interface on port 3010
- **Docker**: Containerized deployment with docker-compose

## Limitations & Disclaimers

⚠️ **Important**: This automated evaluation provides preliminary assessment only:

- Results are informational, not investment advice
- Does not replace comprehensive security audits
- Based on publicly available documentation only
- Cannot assess actual smart contract code security
- Subjective documentation quality may not be fully captured

## Contributing

1. Follow the existing code patterns and TypeScript strict mode
2. Write tests for new features using Vitest
3. Ensure Docker builds successfully
4. Run lint and build checks before submitting

## License

This project follows the same license as the parent Arbitrum Vibekit repository.