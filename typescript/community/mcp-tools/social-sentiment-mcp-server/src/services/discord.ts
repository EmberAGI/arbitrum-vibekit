/**
 * Discord service for sentiment analysis using Discord.js
 *
 * IMPORTANT: Bot must be invited to Discord servers and channels manually.
 * Bot can only read messages from channels it has access to.
 *
 * Setup:
 * 1. Create bot at https://discord.com/developers/applications
 * 2. Enable "Message Content Intent" in bot settings
 * 3. Invite bot to servers with "Read Message History" permission
 * 4. Add channel IDs to DISCORD_CHANNEL_IDS in .env
 */

import { Client, GatewayIntentBits, type Message } from 'discord.js';
import { getTokenInfo } from '../utils/tokenMapping.js';
import { cache, CACHE_TTL } from '../utils/cache.js';

// Global Discord client (singleton)
let discordClient: Client | null = null;
const messageCache = new Map<string, Array<{ content: string; author: string; channel: string; timestamp: Date }>>();

/**
 * Initialize Discord bot client
 */
async function getDiscordClient(): Promise<Client | null> {
  const botToken = process.env['DISCORD_BOT_TOKEN'];
  if (!botToken) {
    console.error('Discord bot token not configured. Set DISCORD_BOT_TOKEN in .env');
    return null;
  }

  if (discordClient) {
    return discordClient;
  }

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Required to read message content
      ],
    });

    await client.login(botToken);
    console.error('Discord bot connected successfully');

    // Cache messages from monitored channels
    client.on('messageCreate', async (message: Message) => {
      if (message.author.bot) return; // Ignore bot messages

      const channelId = message.channel.id;
      const channelMessages = messageCache.get(channelId) || [];

      channelMessages.push({
        content: message.content,
        author: message.author.username,
        channel: (message.channel as any).name || channelId,
        timestamp: message.createdAt,
      });

      // Keep only last 1000 messages per channel
      if (channelMessages.length > 1000) {
        channelMessages.shift();
      }

      messageCache.set(channelId, channelMessages);
    });

    discordClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect Discord bot:', error);
    return null;
  }
}

/**
 * Get channel IDs from environment or use default crypto channels
 */
function getDiscordChannelIds(): string[] {
  const envChannels = process.env['DISCORD_CHANNEL_IDS'];
  if (envChannels) {
    return envChannels.split(',').map((id) => id.trim()).filter(Boolean);
  }

  // Return empty - user must configure channels
  console.error('No Discord channels configured. Set DISCORD_CHANNEL_IDS in .env');
  return [];
}

/**
 * Search Discord messages for token mentions
 */
export async function searchDiscordForToken(
  tokenSymbol: string,
  timeRangeHours = 24,
): Promise<{
  messages: Array<{
    content: string;
    author: string;
    channel: string;
    server: string;
    timestamp: Date;
    reactions?: number;
  }>;
  totalMentions: number;
}> {
  const botToken = process.env['DISCORD_BOT_TOKEN'];
  if (!botToken) {
    return {
      messages: [],
      totalMentions: 0,
    };
  }

  const cacheKey = `discord:${tokenSymbol}:${timeRangeHours}`;
  const cached = cache.get<{ messages: Array<any>; totalMentions: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  const client = await getDiscordClient();
  if (!client) {
    return {
      messages: [],
      totalMentions: 0,
    };
  }

  const tokenInfo = getTokenInfo(tokenSymbol);
  const searchTerms = tokenInfo?.searchTerms || [tokenSymbol.toUpperCase()];
  const channelIds = getDiscordChannelIds();

  if (channelIds.length === 0) {
    console.error('No Discord channels configured. Bot cannot search without channel IDs.');
    return {
      messages: [],
      totalMentions: 0,
    };
  }

  const allMessages: Array<{
    content: string;
    author: string;
    channel: string;
    server: string;
    timestamp: Date;
    reactions?: number;
  }> = [];

  const timeLimit = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

  // Search cached messages
  for (const channelId of channelIds) {
    const channelMessages = messageCache.get(channelId) || [];

    // Also try to fetch recent messages if cache is empty
    if (channelMessages.length === 0) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const messages = await channel.messages.fetch({ limit: 100 });
          for (const message of messages.values()) {
            if (message.author.bot) continue;
            channelMessages.push({
              content: message.content,
              author: message.author.username,
              channel: (channel as any).name || channelId,
              timestamp: message.createdAt,
            });
          }
          messageCache.set(channelId, channelMessages);
        }
      } catch (error) {
        console.error(`Error fetching messages from channel ${channelId}:`, error);
      }
    }

    // Search for token mentions
    for (const message of channelMessages) {
      if (message.timestamp < timeLimit) continue;

      const content = message.content.toLowerCase();
      const matches = searchTerms.some((term) => content.includes(term.toLowerCase()));

      if (matches) {
        // Get server name
        const channel = await client.channels.fetch(channelId).catch(() => null);
        const serverName = channel && 'guild' in channel ? (channel.guild as any).name : 'Unknown Server';

        allMessages.push({
          content: message.content,
          author: message.author,
          channel: message.channel,
          server: serverName,
          timestamp: message.timestamp,
        });
      }
    }
  }

  // Sort by timestamp (newest first)
  const sorted = allMessages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const result = {
    messages: sorted,
    totalMentions: sorted.length,
  };

  cache.set(cacheKey, result, CACHE_TTL.SENTIMENT);
  return result;
}

/**
 * Get Discord sentiment for a token
 */
export async function getDiscordSentiment(tokenSymbol: string): Promise<{
  score: number;
  volume: number;
  sampleMessages: string[];
}> {
  const data = await searchDiscordForToken(tokenSymbol, 24);

  if (data.totalMentions === 0) {
    return {
      score: 0,
      volume: 0,
      sampleMessages: [],
    };
  }

  // Analyze sentiment of messages
  const { analyzeTextsSentiment } = await import('./sentiment.js');
  const texts = data.messages.map((m) => m.content);
  const { score } = await analyzeTextsSentiment(texts);

  return {
    score,
    volume: data.totalMentions,
    sampleMessages: data.messages.slice(0, 5).map((m) => m.content),
  };
}

