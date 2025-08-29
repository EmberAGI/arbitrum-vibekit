import { type HookFunction } from 'arbitrum-vibekit-core';
import { entityResolver } from '../services/entityResolver.js';
import { VibkitError } from 'arbitrum-vibekit-core';
import { parseTimeframe } from "../utils/timeframeParser.js";
import type { TrendmoonContext } from '../context/types.js';

export const entityResolutionHook: HookFunction<any, any, TrendmoonContext, any> = async (args: any, context): Promise<any> => {
    const mcpClient = context.mcpClients?.['trendmoon-mcp-server'];
    if (!mcpClient) {
        throw new VibkitError('ClientError', -32603, 'Trendmoon MCP client not available for entity resolution.');
    }

    await entityResolver.initialize(mcpClient);

    if (args.narrative || args.category_name) {
        const cat = args.narrative || args.category_name;
        const resolvedCategory = entityResolver.resolveCategory(cat);
        if (!resolvedCategory) {
            throw new VibkitError('ValidationError', -32602, `Sorry, I don't recognize the category "${cat}". Please try another one.`);
        }
        //console.log(`[Hook:entityResolution] Resolved category "${args.narrative}" to "${resolvedCategory}"`);
      if(args.narrative) {
        args.narrative = resolvedCategory;
      }

      if(args.category_name) {
        args.category_name = resolvedCategory;
      }
    }


    if (args.chain) {
        const resolvedPlatform = entityResolver.resolvePlatform(args.chain);
        if (!resolvedPlatform) {
            throw new VibkitError('ValidationError', -32602, `Sorry, I don't recognize the blockchain "${args.chain}". Please try another one.`);
        }
        //console.log(`[Hook:entityResolution] Resolved platform "${args.chain}" to "${resolvedPlatform}"`);
        args.chain = resolvedPlatform;
    }

    if (args.token_name) {
        console.log(`[EntityResolutionHook] Attempting to resolve token_name: ${args.token_name}`);
        const resolvedTokenName = await entityResolver.resolveToken(args.token_name, mcpClient);
        if (!resolvedTokenName) {
            console.warn(`[EntityResolutionHook] Could not resolve token_name: ${args.token_name}. Throwing error.`);
            throw new VibkitError('ValidationError', -32602, `Sorry, I don't recognize the token "${args.token_name}". Please try another one.`);
        }
        args.token_name = resolvedTokenName;
        console.log(`[EntityResolutionHook] Resolved token_name: ${args.token_name} to ${resolvedTokenName}.`);
    }

    if (args.time_period) {
        const parsedDates = parseTimeframe(args.time_period);
        if (!parsedDates) {
            throw new VibkitError('ValidationError', -32602, `Sorry, I don't understand the timeframe "${args.time_period}". Please use formats like '7d', '2w', or '1m'.`);
        }

        /*
        console.log(`[Hook:entityResolution] Resolved timeframe "${args.time_period}" to start/end dates.`);
        console.log(`[Hook:entityResolution] Start date: ${parsedDates.startDate}`);
        console.log(`[Hook:entityResolution] End date: ${parsedDates.endDate}`);
         */

        args.start_date = parsedDates.startDate;
        args.end_date = parsedDates.endDate;
    }

    return args;
};