/**
 * Hooks for Price Prediction Tool
 * Pre-hook: Maps token symbol to topic ID
 * Post-hook: Formats the prediction response
 */

import type { HookFunction } from '@emberai/arbitrum-vibekit-core';
import type { AgentContext } from '@emberai/arbitrum-vibekit-core';

// Pre-hook: Discovers the topic ID for a given token
export const topicDiscoveryHook: HookFunction<any, any, any, any> = async (args, context) => {
  console.log('[TopicDiscoveryHook] Looking up topic for token:', args.token);

  const alloraClient = context.mcpClients?.['@alloralabs/mcp-server'];
  if (!alloraClient) {
    throw new Error('Allora MCP client not available');
  }

  try {
    // Call list_all_topics to get available topics
    const topicsResponse = await alloraClient.callTool({
      name: 'list_all_topics',
      arguments: {},
    });

    // Parse the response to find topics
    const content = topicsResponse.content;
    const topics =
      content && Array.isArray(content) && content.length > 0 && content[0].text ? JSON.parse(content[0].text) : [];

    // Look for a topic that matches the token
    // This is a simplified matcher - in production, you'd want more sophisticated matching
    const tokenUpper = args.token.toUpperCase();
    const matchingTopic = topics.find((topic: any) => {
      const topicName = topic.topic_name || '';
      const description = topic.description || '';
      return topicName.includes(tokenUpper) || description.includes(tokenUpper);
    });

    if (!matchingTopic) {
      throw new Error(`No prediction topic found for token: ${args.token}`);
    }

    console.log(`[TopicDiscoveryHook] Found topic ${matchingTopic.topic_id} for token ${args.token}`);

    // Convert topic_id to number as required by the MCP server
    const topicIdNumber = Number(matchingTopic.topic_id);

    // Validate the conversion
    if (isNaN(topicIdNumber)) {
      throw new Error(`Invalid topic ID: ${matchingTopic.topic_id} cannot be converted to a number`);
    }

    // Return modified args with topicId added
    return {
      ...args,
      topicId: topicIdNumber,
      topicMetadata: matchingTopic.topic_name,
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
