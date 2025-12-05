# Social Sentiment Trading MCP Server

A Model Context Protocol (MCP) server that provides social sentiment analysis and trading signals by aggregating data from Reddit, Discord, Telegram, and on-chain sources. This server enables AI agents to make trading decisions based on social sentiment and early signal detection.

## 🚀 Features

### Core Sentiment Tools
- **Social Sentiment Analysis**: Real-time sentiment scoring across Reddit, Discord, and Telegram
- **Early Signal Detection**: Identify social activity spikes before price movements
- **Influencer Wallet Tracking**: Correlate influencer social posts with on-chain wallet activity
- **Momentum Scoring**: Combined social + on-chain momentum metrics
- **Price Prediction**: ML-powered predictions based on social sentiment

### Data Sources (All Free Tier)
- **Reddit API**: Crypto subreddits sentiment analysis (public JSON endpoints)
- **Twitter/X API**: Tweet sentiment analysis (requires Bearer token)
- **Farcaster**: Decentralized social network via Neynar API
- **Discord**: Community channel monitoring (placeholder)
- **Telegram**: Crypto group sentiment tracking (placeholder)
- **Hugging Face**: Free sentiment analysis models

## 📋 Prerequisites

- Node.js 18+
- pnpm package manager
- API keys for (all optional, free tiers available):
  - Twitter Bearer Token (for Twitter/X integration)
  - Neynar API Key (for Farcaster integration - 1,000 requests/day free)
  - Hugging Face API key (optional, improves sentiment analysis accuracy)
  - Reddit User Agent (optional, custom user agent string)

## 🚀 Quick Start

### 1. Installation

```bash
cd typescript/community/mcp-tools/social-sentiment-mcp-server
pnpm install
```

### 2. Environment Setup

Create a `.env` file:

```env
# Twitter/X API (get from https://developer.twitter.com/)
# Required for Twitter integration
TWITTER_BEARER_TOKEN=your_bearer_token

# Farcaster via Neynar API (get from https://neynar.com/)
# Required for Farcaster integration - 1,000 requests/day free tier
NEYNAR_API_KEY=your_neynar_api_key

# Reddit User Agent (optional, custom user agent string)
REDDIT_USER_AGENT=social-sentiment-mcp/1.0.0

# Hugging Face (optional, improves sentiment analysis accuracy)
# Free tier: 1,000 requests/day
HUGGING_FACE_API_KEY=your_huggingface_api_key
```

### 3. Build and Run

```bash
# Build the project
pnpm run build

# Run the MCP server
pnpm start

# Or run in development mode
pnpm dev
```

### 4. Test with MCP Inspector

```bash
npx -y @modelcontextprotocol/inspector node ./dist/index.js
```

## 🛠️ Available Tools

### 1. `analyze-social-sentiment`
Analyze sentiment for a token across Reddit, Twitter/X, Farcaster, Discord, and Telegram.

**Parameters:**
- `tokenSymbol` (string): Token symbol (e.g., "ETH", "BTC", "ARB")
- `timeRange` (optional): Lookback period in hours (max 168 = 7 days)

**Returns:**
- Sentiment score (-1 to 1), confidence, sources breakdown, trend direction
- **Contextual analysis**: Human-readable explanations, key themes, actionable insights
- **DeFi categories**: Perpetuals, arbitrage, flashloans, lending, staking sentiment
- **All posts with direct links**: Reddit posts, Twitter tweets, Farcaster casts

### 2. `detect-early-signals`
Detect early social signals before price movements.

**Parameters:**
- `tokenSymbol` (string): Token to monitor
- `lookbackHours` (number): Hours to look back (default: 24)

**Returns:** Early signal alerts with strength and historical comparison

### 3. `track-influencer-wallets`
Correlate influencer social posts with wallet activity.

**Parameters:**
- `walletAddress` (string): Wallet address to track
- `socialPlatform` (optional): Platform to correlate

**Returns:** Social posts + on-chain transaction correlation

### 4. `social-momentum-score`
Calculate combined social momentum score across all platforms.

**Parameters:**
- `tokenSymbol` (string): Token to score

**Returns:**
- Overall momentum score (0-100) with platform breakdown (Reddit, Twitter, Farcaster, Discord, Telegram)
- **Contextual explanation**: What the score means and what actions to take
- **Platform breakdown**: Individual scores and contributions from each platform
- **Top engagement**: Most engaging posts from each platform

### 5. `predict-social-driven-moves`
Predict price impact based on social sentiment.

**Parameters:**
- `tokenSymbol` (string): Token to predict
- `predictionWindow` (number): Hours ahead to predict (default: 24)

**Returns:** Predicted price impact, confidence, reasoning

## 🏗️ Architecture

```
src/
├── index.ts                 # Main MCP server entry point
├── stdio-server.ts         # STDIO transport implementation
├── tools/                  # MCP tool implementations
│   ├── analyzeSocialSentiment.ts
│   ├── detectEarlySignals.ts
│   ├── trackInfluencerWallets.ts
│   ├── socialMomentumScore.ts
│   └── predictSocialDrivenMoves.ts
├── services/              # External API clients
│   ├── reddit.ts
│   ├── discord.ts
│   ├── telegram.ts
│   ├── sentiment.ts
│   └── onchain.ts
├── types/                 # TypeScript type definitions
│   └── sentiment.ts
└── utils/                 # Utility functions
    ├── cache.ts
    └── aggregator.ts
```

## 🔒 Rate Limiting & Caching

- **Reddit**: ~10 requests/minute (public JSON endpoints, no OAuth)
- **Twitter/X**: Varies by API tier (free tier: 1,500 requests/month)
- **Farcaster (Neynar)**: 1,000 requests/day (free tier)
- **Hugging Face**: 1,000 requests/day (free tier) - cache aggressively!

All responses are cached:
- Sentiment results: 5 minutes
- Social posts: 10 minutes
- Historical data: 24 hours

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test --watch
```

## 📝 Notes

- This MCP server provides **signals and data only** - agents use Ember MCP for trade execution
- All APIs are free tier - be mindful of rate limits
- Caching is essential to stay within free tier limits
- Start with Reddit, then add Discord/Telegram incrementally

## 🤝 Contributing

See [CONTRIBUTIONS.md](../../../../CONTRIBUTIONS.md) for contribution guidelines.

## 📄 License

MIT License - see [LICENSE](../../../../LICENSE) for details.

