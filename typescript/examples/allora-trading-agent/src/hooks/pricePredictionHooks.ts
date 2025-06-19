/**
 * Hooks for Price Prediction Tool
 * Pre-hook: Maps token symbol to topic ID
 * Post-hook: Formats the prediction response
 */

import type { HookFunction } from 'arbitrum-vibekit-core';
import type { AgentContext } from 'arbitrum-vibekit-core';

/**
 * Pre-hook that discovers the Allora topic ID for a given token
 * This runs before the main tool execution to find the appropriate topic
 */
export const topicDiscoveryHook: HookFunction<any, any> = async (args, context) => {
  console.log('[TopicDiscoveryHook] Looking up topic for token:', args.token);

  const alloraClient = context.mcpClients?.['@alloralabs/mcp-server'];
  if (!alloraClient) {
    throw new Error('Allora MCP client not available in context');
  }

  try {
    // Call list_all_topics from Allora MCP
    const topicsResponse = await alloraClient.callTool({
      name: 'list_all_topics',
      arguments: {},
    });

    // Parse the response
    const content = topicsResponse.content;
    let parsedContent;

    try {
      parsedContent =
        content && Array.isArray(content) && content.length > 0 && content[0].text ? JSON.parse(content[0].text) : null;
    } catch (e) {
      console.error('[TopicDiscoveryHook] Failed to parse response:', content);
      throw new Error('Failed to parse Allora topics response');
    }

    // Handle both array and object response formats
    let topics = [];
    if (Array.isArray(parsedContent)) {
      topics = parsedContent;
    } else if (parsedContent && parsedContent.topics) {
      topics = parsedContent.topics;
    } else if (parsedContent && parsedContent.data) {
      topics = parsedContent.data;
    }

    console.log('[TopicDiscoveryHook] Found topics:', topics.length);

    // Find the topic that matches our token
    const tokenLower = args.token.toLowerCase();
    const tokenUpper = args.token.toUpperCase();

    const matchingTopic = topics.find((topic: any) => {
      // Try multiple fields that might contain the token info
      const metadata = (topic.metadata || '').toLowerCase();
      const topicName = (topic.topic_name || '').toLowerCase();
      const description = (topic.description || '').toLowerCase();
      const allText = `${metadata} ${topicName} ${description}`;

      // Enhanced matching logic
      if (tokenLower === 'btc' || tokenLower === 'bitcoin') {
        return allText.includes('btc') || allText.includes('bitcoin');
      }
      if (tokenLower === 'eth' || tokenLower === 'ethereum') {
        return allText.includes('eth') || allText.includes('ethereum');
      }
      if (tokenLower === 'usdc') {
        return allText.includes('usdc');
      }
      if (tokenLower === 'arb' || tokenLower === 'arbitrum') {
        return allText.includes('arb') || allText.includes('arbitrum');
      }

      // Generic matching - try both upper and lower case
      return allText.includes(tokenLower) || allText.includes(tokenUpper.toLowerCase());
    });

    if (!matchingTopic) {
      // Log available topics for debugging
      console.log(
        '[TopicDiscoveryHook] Available topics:',
        topics.map((t: any) => ({
          id: t.topicId || t.topic_id,
          metadata: t.metadata,
          name: t.topic_name,
          description: t.description,
        })),
      );
      throw new Error(
        `No prediction topic found for token: ${args.token}. Try using full token names like 'Bitcoin' or 'Ethereum'.`,
      );
    }

    // Handle different ID field names
    const topicId = matchingTopic.topicId || matchingTopic.topic_id;
    console.log(`[TopicDiscoveryHook] Found topic ${topicId} for token ${args.token}`);

    // Add the topic ID to the args so the main tool can use it
    return {
      ...args,
      topicId: topicId,
      topicMetadata: matchingTopic.metadata || matchingTopic.topic_name || matchingTopic.description,
    };
  } catch (error) {
    console.error('[TopicDiscoveryHook] Error:', error);
    throw error;
  }
};

// Post-hook: Formats the prediction response
export const formatResponseHook: HookFunction<any, any, any, any> = async (result, context) => {
  console.log('[FormatResponseHook] Formatting prediction response');

  try {
    // The result from createSuccessTask is a Task object
    // The tool already created a message with the prediction, just enhance it with better formatting
    const originalMessage = result.status?.message?.parts?.[0]?.text || '';

    // Simply add formatting around the existing message
    let formattedResponse = `📊 **Price Prediction Results**\n\n`;
    formattedResponse += originalMessage;
    formattedResponse += `\n\n_Data provided by Allora prediction markets_`;

    // Return the result with enhanced message
    if (result.status && result.status.message && result.status.message.parts) {
      result.status.message.parts[0].text = formattedResponse;
    }

    return result;
  } catch (error) {
    console.error('[FormatResponseHook] Error:', error);
    // If formatting fails, return the original result
    return result;
  }
};
