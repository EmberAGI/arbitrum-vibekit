/**
 * Telegram service for sentiment analysis using node-telegram-bot-api
 *
 * IMPORTANT: Bot must be added to Telegram groups/channels manually.
 * Bot can only read messages from groups/channels it's a member of.
 *
 * Setup:
 * 1. Create bot via @BotFather on Telegram
 * 2. Add bot to groups/channels (as member or admin)
 * 3. Get chat IDs for each group/channel
 * 4. Add chat IDs to TELEGRAM_CHAT_IDS in .env
 */

import TelegramBot from 'node-telegram-bot-api';
import { getTokenInfo } from '../utils/tokenMapping.js';
import { cache, CACHE_TTL } from '../utils/cache.js';

// Global Telegram bot instance (singleton)
let telegramBot: TelegramBot | null = null;
const messageCache = new Map<number | string, Array<{ text: string; from?: string; date: Date }>>();

/**
 * Initialize Telegram bot
 */
async function getTelegramBot(): Promise<TelegramBot | null> {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    console.error('Telegram bot token not configured. Set TELEGRAM_BOT_TOKEN in .env');
    return null;
  }

  if (telegramBot) {
    return telegramBot;
  }

  try {
    const bot = new TelegramBot(botToken, { polling: false }); // No polling, we'll fetch on demand

    // Test bot connection
    const me = await bot.getMe();
    console.error(`Telegram bot connected: @${me.username}`);

    telegramBot = bot;
    return bot;
  } catch (error) {
    console.error('Failed to connect Telegram bot:', error);
    return null;
  }
}

/**
 * Get chat IDs from environment
 */
function getTelegramChatIds(): (number | string)[] {
  const envChats = process.env['TELEGRAM_CHAT_IDS'];
  if (envChats) {
    return envChats
      .split(',')
      .map((id) => {
        const trimmed = id.trim();
        // Handle both numeric IDs and usernames
        const numId = Number(trimmed);
        return isNaN(numId) ? trimmed : numId;
      })
      .filter(Boolean);
  }

  console.error('No Telegram chats configured. Set TELEGRAM_CHAT_IDS in .env');
  return [];
}

/**
 * Search Telegram messages for token mentions
 */
export async function searchTelegramForToken(
  tokenSymbol: string,
  timeRangeHours = 24,
): Promise<{
  messages: Array<{
    content: string;
    author: string;
    channel: string;
    timestamp: Date;
    views?: number;
  }>;
  totalMentions: number;
}> {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    return {
      messages: [],
      totalMentions: 0,
    };
  }

  const cacheKey = `telegram:${tokenSymbol}:${timeRangeHours}`;
  const cached = cache.get<{ messages: Array<any>; totalMentions: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  const bot = await getTelegramBot();
  if (!bot) {
    return {
      messages: [],
      totalMentions: 0,
    };
  }

  const tokenInfo = getTokenInfo(tokenSymbol);
  const searchTerms = tokenInfo?.searchTerms || [tokenSymbol.toUpperCase()];
  const chatIds = getTelegramChatIds();

  if (chatIds.length === 0) {
    console.error('No Telegram chats configured. Bot cannot search without chat IDs.');
    return {
      messages: [],
      totalMentions: 0,
    };
  }

  const allMessages: Array<{
    content: string;
    author: string;
    channel: string;
    timestamp: Date;
    views?: number;
  }> = [];

  const timeLimit = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

  // Search each configured chat
  for (const chatId of chatIds) {
    try {
      // Fetch recent messages from the chat
      // Note: Telegram Bot API doesn't have a direct "search" endpoint
      // We fetch recent messages and filter them
      const updates = await bot.getUpdates({ limit: 100 }).catch(() => []);

      // Also try to get chat info
      let chatName = String(chatId);
      try {
        const chat = await bot.getChat(chatId);
        chatName = 'title' in chat ? chat.title || String(chatId) : String(chatId);
      } catch {
        // Chat not accessible or doesn't exist
      }

      // Search cached messages first
      const cachedMessages = messageCache.get(chatId) || [];

      // Fetch new messages if needed
      // Note: Telegram Bot API requires the bot to receive updates via polling or webhook
      // For on-demand search, we'll use a simpler approach: fetch updates
      for (const update of updates) {
        if (!update.message || update.message.chat.id !== chatId) continue;
        if (update.message.date * 1000 < timeLimit.getTime()) continue;

        const messageText = update.message.text || update.message.caption || '';
        const matches = searchTerms.some((term) => messageText.toLowerCase().includes(term.toLowerCase()));

        if (matches) {
          allMessages.push({
            content: messageText,
            author: update.message.from?.username || update.message.from?.first_name || 'Unknown',
            channel: chatName,
            timestamp: new Date(update.message.date * 1000),
            views: (update.message as any).views, // Views may not be available for all message types
          });
        }
      }

      // Also search cached messages
      for (const msg of cachedMessages) {
        if (msg.date < timeLimit) continue;

        const matches = searchTerms.some((term) => msg.text.toLowerCase().includes(term.toLowerCase()));
        if (matches) {
          allMessages.push({
            content: msg.text,
            author: msg.from || 'Unknown',
            channel: chatName,
            timestamp: msg.date,
          });
        }
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error searching Telegram chat ${chatId}:`, error);
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
 * Get Telegram sentiment for a token
 */
export async function getTelegramSentiment(tokenSymbol: string): Promise<{
  score: number;
  volume: number;
  sampleMessages: string[];
}> {
  const data = await searchTelegramForToken(tokenSymbol, 24);

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

