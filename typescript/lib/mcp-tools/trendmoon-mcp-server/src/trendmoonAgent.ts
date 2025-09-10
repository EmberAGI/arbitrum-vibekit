import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import * as console from 'node:console';

// Load environment variables
dotenv.config();

// Helper function to create clean environment and ensure all values are strings
function createCleanEnv(additionalEnv: Record<string, string | undefined> = {}): Record<string, string> {
  const cleanEnv: Record<string, string> = {};

  // Filter out undefined values from process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      cleanEnv[key] = value;
    }
  }

  // Add additional environment variables, filtering out undefined
  for (const [key, value] of Object.entries(additionalEnv)) {
    if (value !== undefined) {
      cleanEnv[key] = value;
    }
  }

  return cleanEnv;
}

interface Tool {
  name: string;
  description?: string;
  inputSchema?: any;
}

interface Prompt {
  name: string;
  description?: string;
  arguments?: any;
}

// Zod schemas for validation
const ToolsListSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.object({}).optional()
    }),
  ),
});

const PromptsListSchema = z.object({
  prompts: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      arguments: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional()
      })).optional()
    }),
  ),
});

const ToolCallSchema = z.object({
  content: z.any().optional(),
});

export class TrendmoonAgent {
  private mcpClient: Client;
  private transport?: StdioClientTransport;
  private isConnected = false;
  private availableTools: Tool[] = [];
  private availablePrompts: Prompt[] = [];

  constructor() {
    this.mcpClient = new Client(
      { name: 'trendmoon-agent', version: '1.0.0' },
      { capabilities: {} },
    );
  }

  async initialize() {
    try {
      const apiKey = process.env.TRENDMOON_API_KEY;
      if (!apiKey) throw new Error('TRENDMOON_API_KEY is required but not set');

      const apiUrl = process.env.TRENDMOON_API_URL ?? 'https://api.qa.trendmoon.ai';
      const serverName = process.env.TRENDMOON_SERVER_NAME ?? 'trendmoon-mcp-server';
      const debugMode = process.env.DEBUG_MODE ?? 'false';
      const nodeEnv = process.env.NODE_ENV ?? 'development';

      const env = createCleanEnv({
        TRENDMOON_API_KEY: apiKey,
        TRENDMOON_API_URL: apiUrl,
        TRENDMOON_SERVER_NAME: serverName,
        DEBUG_MODE: debugMode,
        NODE_ENV: nodeEnv,
      });

      const mcpServerPath = resolve(process.cwd(), 'dist/index.js');

      this.transport = new StdioClientTransport({
        command: 'node',
        args: [mcpServerPath],
        env,
      });

      await this.mcpClient.connect(this.transport);
      this.isConnected = true;

      console.log('✅ Connected to Trendmoon MCP Server');

      // Load available tools and prompts
      await this.loadCapabilities();

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Trendmoon Agent:', error);
      throw error;
    }
  }

  private async loadCapabilities() {
    try {
      this.availableTools = await this.listTools();
      this.availablePrompts = await this.listPrompts();

      console.log('📋 Available tools:', this.availableTools.map(t => t.name).join(', '));
      console.log('💬 Available prompts:', this.availablePrompts.map(p => p.name).join(', '));
    } catch (error) {
      console.error('❌ Failed to load capabilities:', error);
    }
  }

  async listTools(): Promise<Tool[]> {
    this.ensureConnected();

    try {
      const response = await this.mcpClient.request(
        {
          method: 'tools/list',
          params: {},
        },
        ToolsListSchema,
      );

      return (response.tools ?? []).filter(tool => tool.name !== undefined) as Tool[];
    } catch (error) {
      console.error('Error listing tools:', error);
      throw error;
    }
  }

  async listPrompts(): Promise<Prompt[]> {
    this.ensureConnected();

    try {
      const response = await this.mcpClient.request(
        {
          method: 'prompts/list',
          params: {},
        },
        PromptsListSchema,
      );

      return (response.prompts ?? []) as Prompt[];
    } catch (error) {
      console.error('Error listing prompts:', error);
      return [];
    }
  }

  async callTool(toolName: string, args: any = {}) {
    this.ensureConnected();
    try {
      console.log(`🔧 Calling tool: ${toolName} with args:`, JSON.stringify(args, null, 2));

      const response = await this.mcpClient.request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        },
        ToolCallSchema,
      );

      console.log(`✅ Tool ${toolName} completed successfully`);
      return response;
    } catch (error) {
      console.error(`❌ Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  async getPrompt(promptName: string, args: any = {}) {
    this.ensureConnected();
    try {
      console.log(`💬 Getting prompt: ${promptName} with args:`, JSON.stringify(args, null, 2));

      const response = await this.mcpClient.getPrompt({
        name: promptName,
        arguments: args,
      });

      console.log(`✅ Prompt ${promptName} retrieved successfully`);
      return response;
    } catch (error) {
      console.error(`❌ Error getting prompt ${promptName}:`, error);
      throw error;
    }
  }

  // === CATEGORY METHODS ===
  async getAllCategories() {
    return await this.callTool('getAllCategories');
  }

  async getCategoryDominanceForAssets(category: string, options: {
    dateFrom?: string;
    dateTo?: string;
    interval?: string;
    top?: number;
  } = {}) {
    return await this.callTool('getCategoryDominanceForAssets', {
      category,
      ...options
    });
  }

  // === COIN SEARCH & DISCOVERY ===
  async searchCoins(params: {
    query?: string;
    symbol?: string;
    platforms?: string;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }) {
    return await this.callTool('searchCoins', params);
  }

  async getCoinPlatforms() {
    return await this.callTool('getPlatforms');
  }

  async getCoinDetails(symbol: string) {
    return await this.callTool('getCoinDetails', { symbol });
  }

  // === CATEGORY COINS ===
  async getCategoryCoins(categoryName: string, options: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
  } = {}) {
    return await this.callTool('getCategoryCoins', {
      category_name: categoryName,
      ...options
    });
  }

  // === SOCIAL DATA & TRENDS ===
  async getSocialTrend(symbol: string, options: {
    dateFrom?: string;
    dateTo?: string;
    interval?: string;
  } = {}) {
    return await this.callTool('getSocialTrend', {
      symbol,
      ...options
    });
  }

  async getSocialTrends(coin_ids: string[], options: {
    start_date?: string;
    end_date?: string;
    interval?: string;
  } = {}) {
    return await this.callTool('getSocialTrends', {
      coin_ids,
      ...options
    });
  }

  async getKeywordTrend(keyword: string, options: {
    dateFrom?: string;
    dateTo?: string;
    interval?: string;
  } = {}) {
    return await this.callTool('getKeywordTrend', {
      keyword,
      ...options
    });
  }

  async getTopicPosts(topic: string, options: { limit?: number, offset?: number } = {}) {
    return await this.callTool('getTopicPosts', { topic, ...options });
  }

  async getTopicNews(topic: string, options: { limit?: number, offset?: number } = {}) {
    return await this.callTool('getTopicNews', { topic, ...options });
  }

  async searchSocialPosts(terms: string, options: {
    limit?: number;
    offset?: number;
    platform?: string;
    symbol?: string;
    author?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    return await this.callTool('searchSocialPosts', {
      terms,
      ...options
    });
  }

  async getProjectSummary(symbol: string, daysAgo = 7, forceRegenerate = false) {
    return await this.callTool('getProjectSummary', {
      symbol,
      daysAgo,
      forceRegenerate
    });
  }

  // === ALERTS & TOP LISTS ===
  async getTopCategoriesToday() {
    return await this.callTool('getTopCategoriesToday');
  }

  async getTopAlertsToday() {
    return await this.callTool('getTopAlertsToday');
  }

  // === INTELLIGENT MESSAGE PROCESSING ===
  async processMessage(message: string): Promise<string> {
    this.ensureConnected();

    try {
      const lowerMessage = message.toLowerCase();

      // Use prompts for complex analysis
      if (lowerMessage.includes('analyze')) {
        return await this.handleCoinAnalysis(message);
      }

      if (lowerMessage.includes('compare') && lowerMessage.includes('categor')) {
        return await this.handleCategoryComparison();
      }

      if (lowerMessage.includes('top') && lowerMessage.includes('meme')) {
        return await this.handleTopMemeTokens(message);
      }

      if (lowerMessage.includes('buy') || lowerMessage.includes('invest')) {
        return await this.handleInvestmentAdvice(message);
      }

      if (lowerMessage.includes('narrative') || lowerMessage.includes('growing')) {
        return await this.handleNarrativeAnalysis();
      }

      if (lowerMessage.includes('catalyst') || lowerMessage.includes('fundamental')) {
        return await this.handleCatalystAnalysis(message);
      }

      // Direct API calls for simple queries
      if (lowerMessage.includes('categories')) {
        const result = await this.getAllCategories();
        return this.formatCategoriesResponse(result);
      }

      if (lowerMessage.includes('search') && (lowerMessage.includes('coin') || lowerMessage.includes('token'))) {
        return await this.handleCoinSearch(message);
      }

      return this.getHelpMessage();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return `❌ Error processing message: ${errorMessage}`;
    }
  }

  private async handleCoinAnalysis(message: string): Promise<string> {
    const symbolMatch = message.match(/(?:analyze|analysis)(?:\s+(?:coin|token))?\s+([A-Z]{2,6})/i);
    const symbol = symbolMatch?.[1]?.toUpperCase();

    if (!symbol) {
      return '❌ Please specify a coin symbol for analysis (e.g., "analyze BTC")';
    }

    try {
      const prompt = await this.mcpClient.getPrompt(
        {
          name: 'analyzeCoinPerformance',
          arguments: {
            symbol,
            timeframe: '24h',
          },
        },
        { timeout: 120000 }
      );

      console.log('🔍 Raw response from prompt:', JSON.stringify(prompt, null, 2));

      return this.formatPromptResponse(prompt, `Analysis for ${symbol}`);
    } catch (error) {
      try {
        const [socialData, coinDetails] = await Promise.all([
          this.getSocialTrend(symbol),
          this.getCoinDetails(symbol)
        ]);

        return this.formatCoinAnalysis(socialData, coinDetails, symbol);
      } catch (fallbackError) {
        const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return `❌ Could not analyze ${symbol}: ${errorMessage}`;
      }
    }
  }

  private async handleCategoryComparison(_message?: string): Promise<string> {
    try {
      const prompt = await this.getPrompt('compareCategoryPerformance', {
        timeframe: '7d',
        include_social_metrics: true
      });

      return this.formatPromptResponse(prompt, 'Category Performance Comparison');
    } catch (error) {
      const result = await this.getTopCategoriesToday();
      return this.formatTopCategoriesResponse(result);
    }
  }

  private async handleTopMemeTokens(message: string): Promise<string> {
    const limitMatch = message.match(/top\s*(\d+)/i);
    const limit = parseInt(limitMatch?.[1] || '10', 10);

    try {
      const result = await this.getCategoryCoins('Meme', { limit });
      return this.formatCategoryCoinsResponse(result, 'Meme');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `❌ Could not fetch top meme tokens: ${errorMessage}`;
    }
  }

  private async handleInvestmentAdvice(message: string): Promise<string> {
    const symbolMatch = message.match(/(?:buy|invest)(?:\s+in)?\s+([A-Z]{2,6})/i);
    const symbol = symbolMatch?.[1]?.toUpperCase();

    if (!symbol) {
      return '❌ Please specify a coin symbol for investment analysis';
    }

    try {
      const prompt = await this.getPrompt('generateInvestmentInsight', {
        symbol: symbol,
        risk_tolerance: 'moderate',
        timeframe: '30d'
      });

      return this.formatPromptResponse(prompt, `Investment Analysis for ${symbol}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `❌ Could not generate investment advice for ${symbol}: ${errorMessage}`;
    }
  }

  private async handleNarrativeAnalysis(_message?: string): Promise<string> {
    try {
      const result = await this.getTopCategoriesToday();
      return this.formatNarrativeResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `❌ Could not analyze current narratives: ${errorMessage}`;
    }
  }

  private async handleCatalystAnalysis(message: string): Promise<string> {
    const symbolMatch = message.match(/(?:catalyst|fundamental)(?:\s+for)?\s+([A-Z]{2,6})/i);
    const symbol = symbolMatch?.[1]?.toUpperCase();

    if (!symbol) {
      return '❌ Please specify a coin symbol for catalyst analysis';
    }

    try {
      const result = await this.getProjectSummary(symbol, 30);
      return this.formatProjectSummaryResponse(result, symbol);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `❌ Could not fetch catalysts for ${symbol}: ${errorMessage}`;
    }
  }

  private async handleCoinSearch(message: string): Promise<string> {
    const symbolMatch = message.match(/search(?:\s+(?:coin|token))?\s+([A-Z]{2,6})/i);
    const queryMatch = message.match(/search(?:\s+(?:coin|token))?\s+"([^"]+)"/i);

    const searchParams: { symbol?: string; query?: string } = {};

    const symbol = symbolMatch?.[1];
    const query = queryMatch?.[1];

    if (symbol) {
      searchParams.symbol = symbol.toUpperCase();
    } else if (query) {
      searchParams.query = query;
    } else {
      return '❌ Please specify a coin symbol (e.g., search coin SOL) or a name in quotes (e.g., search coin "Solana")';
    }

    try {
      const result = await this.searchCoins(searchParams);
      return this.formatSearchResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `❌ Search failed: ${errorMessage}`;
    }
  }

  // === FORMATTING METHODS ===
  private formatPromptResponse(promptResponse: any, title: string): string {
    // Display title first
    let response = `📊 **${title}**\n\n`;

    if (!promptResponse?.messages?.length) {
      return response + `❌ No response message received.`;
    }

    promptResponse.messages.forEach((message: any) => {
      // Check if content is an object with a 'text' property
      if (message.content && typeof message.content.text === 'string') {
        response += message.content.text;
      }
    });

    response += '\n';

    return response;
  }

  private formatCoinAnalysis(socialData: any, coinDetails: any, symbol: string): string {
    let response = `📊 **Analysis for ${symbol}**\n\n`;

    if (coinDetails?.content) {
      const details = this.parseContent(coinDetails.content);
      if (details.name) response += `**Name:** ${details.name}\n`;
      if (details.market_cap_rank) response += `**Rank:** #${details.market_cap_rank}\n`;
    }

    if (socialData?.content) {
      const social = this.parseContent(socialData.content);
      if (social.trend_market_data?.length) {
        const latest = social.trend_market_data[social.trend_market_data.length - 1];
        if (latest.social_mentions) response += `**Social Mentions:** ${latest.social_mentions.toLocaleString()}\n`;
        if (latest.social_dominance) response += `**Social Dominance:** ${(latest.social_dominance * 100).toFixed(2)}%\n`;
      }
    }

    return response;
  }

  private formatCategoriesResponse(result: any): string {
    if (!result?.content) {
      return '❌ No categories available';
    }

    const categories = this.parseContent(result.content);

    if (Array.isArray(categories)) {
      let response = '📂 **Available Categories:**\n\n';
      categories.forEach((category, i) => {
        response += `${i + 1}. ${category.name || category}\n`;
      });
      return response;
    }

    return `📂 Categories: ${result.content}`;
  }

  private formatCategoryCoinsResponse(result: any, categoryName: string): string {
    if (!result?.content) {
      return `❌ No coins available for ${categoryName} category`;
    }

    const data = this.parseContent(result.content);
    const coins = Array.isArray(data) ? data : data.coins;

    if (!coins?.length) {
      return `❌ No coins found in ${categoryName} category`;
    }

    let response = `🚀 **Top ${categoryName} Tokens:**\n\n`;

    coins.forEach((coin: any, i: number) => {
      response += `${i + 1}. **${coin.symbol || coin.name}** (${coin.coin_id || coin.id})\n`;
      if (coin.score) response += `   Score: ${coin.score.toFixed(2)}\n`;
      if (coin.social_mentions) response += `   Social Mentions: ${coin.social_mentions.toLocaleString()}\n`;
      if (coin.day_perc_diff) response += `   24h Change: ${coin.day_perc_diff.toFixed(1)}%\n`;
      response += '\n';
    });

    return response;
  }

  private formatTopCategoriesResponse(result: any): string {
    if (!result?.content) {
      return '❌ No category data available';
    }

    const categories = this.parseContent(result.content);

    if (!Array.isArray(categories)) {
      return `📈 Categories data: ${result.content}`;
    }

    let response = '📈 **Top Performing Categories Today:**\n\n';

    categories.forEach((cat: any, i: number) => {
      response += `${i + 1}. **${cat.category || cat.name}**\n`;
      if (cat.score) response += `   Score: ${cat.score.toFixed(2)}\n`;
      if (cat.day_perc_diff) response += `   24h Change: ${cat.day_perc_diff.toFixed(1)}%\n`;
      if (cat.social_mentions) response += `   Social Mentions: ${cat.social_mentions.toLocaleString()}\n`;
      response += '\n';
    });

    return response;
  }

  private formatNarrativeResponse(result: any): string {
    if (!result?.content) {
      return '❌ No narrative data available';
    }

    const categories = this.parseContent(result.content);

    if (!Array.isArray(categories) || categories.length === 0) {
      return '❌ No narrative trends found';
    }

    const sorted = [...categories].sort((a: any, b: any) => (b.day_perc_diff || 0) - (a.day_perc_diff || 0));
    const topGrowing = sorted[0];

    let response = '🔥 **Current Market Narratives:**\n\n';
    response += `**Strongest Growing Narrative:** ${topGrowing.category || topGrowing.name}\n`;
    if (topGrowing.day_perc_diff) response += `Growth: ${topGrowing.day_perc_diff.toFixed(1)}%\n`;
    if (topGrowing.score) response += `Overall Score: ${topGrowing.score.toFixed(2)}\n\n`;

    response += '**Top 5 Categories by Performance:**\n';
    sorted.slice(0, 5).forEach((cat: any, i: number) => {
      response += `${i + 1}. ${cat.category || cat.name} (${(cat.day_perc_diff || 0).toFixed(1)}%)\n`;
    });

    return response;
  }

  private formatProjectSummaryResponse(result: any, symbol: string): string {
    if (!result?.content) {
      return `❌ No project summary available for ${symbol}`;
    }

    const summary = this.parseContent(result.content);

    let response = `🔍 **Project Analysis for ${symbol}:**\n\n`;

    if (summary.summary) {
      response += summary.summary + '\n\n';
    } else if (typeof summary === 'string') {
      response += summary + '\n\n';
    } else {
      response += `Summary: ${JSON.stringify(summary)}\n`;
    }

    if (summary.start_date && summary.end_date) {
      response += `Analysis Period: ${summary.start_date} to ${summary.end_date}\n`;
    }

    return response;
  }

  private formatSearchResponse(result: any): string {
    if (!result?.content) {
      return '❌ No search results found';
    }

    const coins = this.parseContent(result.content);

    if (!Array.isArray(coins) || coins.length === 0) {
      return '❌ No coins found matching your search';
    }

    let response = '🔍 **Search Results:**\n\n';

    coins.forEach((coin: any, i: number) => {
      response += `${i + 1}. **${coin.name}** (${coin.symbol})\n`;
      if (coin.market_cap_rank) response += `   Rank: #${coin.market_cap_rank}\n`;
      if (coin.community_data?.twitter_followers) {
        response += `   Twitter: ${coin.community_data.twitter_followers.toLocaleString()}\n`;
      }
      response += '\n';
    });

    return response;
  }

  private parseContent(content: any): any {
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }
    return content;
  }

  private getHelpMessage(): string {
    return [
      '🛠️ **TrendMoon Agent - Available Commands:**',
      '',
      '**📊 Analysis Commands:**',
      '- "Analyze BTC" - Comprehensive coin analysis',
      '- "Compare categories" - Category performance comparison',
      '- "Is SOL a good buy?" - Investment advice',
      '',
      '**🔍 Discovery Commands:**',
      '- "Top 10 meme tokens" - Best performing tokens by category',
      '- "Search coin SOL" - Find specific coins',
      '- "Show all categories" - List available categories',
      '',
      '**📈 Market Intelligence:**',
      '- "What narrative is growing?" - Trending categories',
      '- "Catalysts for ADA" - Upcoming events and developments',
      '- "Top alerts today" - Highest scoring opportunities',
      '',
      '**💡 Social Analysis:**',
      '- "Social trend for ETH" - Social metrics and sentiment',
      '- "Keyword trend bitcoin" - Track specific terms',
      '',
      'Ask me anything about crypto trends, social sentiment, or market analysis!',
    ].join('\n');
  }

  private ensureConnected() {
    if (!this.isConnected) {
      throw new Error('TrendmoonAgent is not connected. Call initialize() first.');
    }
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.isConnected = false;
      console.log('🔌 Disconnected from TrendMoon MCP Server');
    }
  }
}

// Automatically run if this script is called directly (in ESM)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const agent = new TrendmoonAgent();

    try {
      await agent.initialize();

      // Example: process a command-line argument or interactive prompt
      const argMessage = process.argv.slice(2).join(' ');
      if (argMessage) {
        const response = await agent.processMessage(argMessage);
        console.log('\n' + response);
      } else {
        console.log('\nUsage: node <path-to-agent-script>.js "Your query message here"');
        console.log('\nExamples:');
        console.log('  npm run agent -- "analyze BTC"');
        console.log('  npm run agent -- "top 5 meme tokens"');
        console.log('  npm run agent -- "what narrative is growing?"');
      }
    } catch (err) {
      console.error('Error running TrendmoonAgent CLI:', err);
      process.exit(1);
    } finally {
      await agent.disconnect();
    }
  })();
}

export {};