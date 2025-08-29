import { z } from 'zod';
import {
    type VibkitToolDefinition,
    withHooks,
    createSuccessTask,
    createErrorTask,
    VibkitError
} from 'arbitrum-vibekit-core';
import { entityResolutionHook } from '../hooks/index.js';

// Le schéma d'input est le même que celui défini sur le MCP server
const SocialAndMarketInsightsSchema = z.object({
    analysis_type: z
        .enum(["list", "detailed_summary", "catalyst_check"])
        .describe("The type of analysis to perform."),
    token_name: z.string().optional().describe("The name or symbol of the token (e.g., 'Solana', 'BTC')."),
    narrative: z.string().optional().describe("The category or narrative to filter by. For example: 'DeFi', 'RWA', 'Gaming', 'Meme'."),
    chain: z.string().optional().describe("The specific blockchain or platform to filter by. For example: 'Arbitrum', 'Solana', 'Ethereum'."),
    sort_by: z
        .enum(["mindshare_growth", "mindshare_total", "sentiment_positive"])
        .optional()
        .describe("The metric to sort results by."),
    time_period: z
        .enum(["24h", "7d", "30d"])
        .default("24h")
        .describe("The time period for analysis (e.g., '24h', '7d')."),

    // draft for LLM
    timeframe: z.string().optional().describe("A natural language description of a time period, e.g., 'last 7 days', 'past month'."),

    start_date: z.string().datetime().optional().describe("The start date for a custom time range (ISO 8601 format)."),
    end_date: z.string().datetime().optional().describe("The end date for a custom time range (ISO 8601 format)."),
}).refine((data) => {
    if (data.analysis_type === 'list' && !data.narrative) {
        return false; // Invalid if analysis_type is 'list' and narrative is missing
    }
    return true;
}, {
    message: "'narrative' is required when 'analysis_type' is 'list'.",
    path: ['narrative'],
});

const baseSocialAndMarketInsightsTool: VibkitToolDefinition<typeof SocialAndMarketInsightsSchema> = {
    name: 'get_social_and_market_insights',
    description: "Provides insights on social trends and market data for crypto tokens. Use this for ALL questions about token performance, mindshare, sentiment, catalysts, or finding lists of tokens based on criteria.",
    parameters: SocialAndMarketInsightsSchema,

    execute: async (args, context) => {
        console.log(`[Tool:get_social_and_market_insights] Executing with analysis type: ${args.analysis_type}`);

        const mcpClient = context.mcpClients?.['trendmoon-mcp-server'];
        if (!mcpClient) {
            return createErrorTask('mcp-client-error', new VibkitError('ClientError', -32603, 'Trendmoon MCP client not available.'));
        }

        try {
            const mcpResponse = await mcpClient.callTool({
                name: 'getSocialAndMarketInsights',
                arguments: args
            });

            // Le serveur MCP peut renvoyer plusieurs contenus (structuré + formaté)
            console.log('[DEBUG] MCP Response:', JSON.stringify(mcpResponse, null, 2));
            
            const content = mcpResponse.content as any[];
            if (!content || !Array.isArray(content) || content.length === 0) {
                return createErrorTask('mcp-call-error', new VibkitError('ExecutionError', -32603, 'No content in MCP response.'));
            }

            // Chercher le contenu de type texte formaté (généralement le dernier)
            let formattedText = '';
            let structuredData = null;

            for (const contentItem of content) {
                if (contentItem.type === 'text') {
                    const text = contentItem.text;
                    // Si ça commence par { ou [, c'est probablement du JSON
                    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                        try {
                            structuredData = JSON.parse(text);
                        } catch {
                            // Si le parsing échoue, on traite comme du texte
                            formattedText = text;
                        }
                    } else {
                        // C'est du texte formaté
                        formattedText = text;
                    }
                }
            }

            // Priorité au texte formaté s'il existe, sinon on utilise les données structurées
            const finalMessage = formattedText || (structuredData ? formatInsightsResult(structuredData) : 'No readable response from server');
            
            return createSuccessTask('insights-retrieved', undefined, finalMessage);

        } catch (error) {
            console.error(`[Tool:get_social_and_market_insights] Error during MCP call:`, error);
            return createErrorTask('mcp-call-error', new VibkitError('ExecutionError', -32603, 'Failed to get insights from the Trendmoon MCP server.'));
        }
    },
};

function formatInsightsResult(result: any): string {
    let message = "Here is the information I found:";

    // On utilise le 'result' qui est le JSON parsé de la réponse du MCP
    if (result.filter) { // C'est une réponse de type 'list'
        message = `**Top Tokens Matching Your Criteria:**\n\n`;
        if (result.results && result.results.length > 0) {
            result.results.forEach((token: any) => {
                message += `- **$${token.token}**: Mindshare Growth: ${token.mindshare_growth}%, Sentiment: ${token.sentiment}\n`;
            });
        } else {
            message += "I couldn't find any tokens matching your criteria.";
        }
    } else if (result.social_posture) { // C'est une réponse de type 'detailed_summary'
        message = `\n**Analysis for $${result.token.toUpperCase()}**\n\n- **Social Posture:** ${result.social_posture}\n- **Summary:** ${result.summary}\n- **Key Metrics:** Mindshare Growth (7d): ${result.key_metrics.mindshare_growth_7d * 100}%, Sentiment Score: ${result.key_metrics.sentiment_score}/10\n        `.trim();
    } else if (result.upcoming_catalysts) { // C'est une réponse de type 'catalyst_check'
        message = `**Upcoming Catalysts for $${result.token.toUpperCase()}:**\n\n`;
        if (result.upcoming_catalysts.length > 0) {
            result.upcoming_catalysts.forEach((catalyst: any) => {
                message += `- **${catalyst.date}**: ${catalyst.event}\n`;
            });
        } else {
            message += "No specific upcoming catalysts found.";
        }
    }

    return message;
}

export const getSocialAndMarketInsightsTool = withHooks(baseSocialAndMarketInsightsTool, {
    before: entityResolutionHook,
});