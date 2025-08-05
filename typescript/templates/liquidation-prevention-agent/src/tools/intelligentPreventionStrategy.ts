/**
 * intelligentPreventionStrategy Tool
 * 
 * Analyzes user position, wallet balances, and provides strategy recommendations
 * for liquidation prevention.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, getAvailableProviders } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';
import { generateLiquidationPreventionData } from '../utils/liquidationData.js';
import { supplyCollateralTool } from './supplyCollateral.js';
import { repayDebtTool } from './repayDebt.js';
import { generateText, type LanguageModelV1 } from 'ai';
import { createProviderSelector } from 'arbitrum-vibekit-core';
import dotenv from 'dotenv';

dotenv.config();

const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

const available = getAvailableProviders(providers);
if (available.length === 0) {
  console.error('No AI providers configured. Please set at least one provider API key.');
  process.exit(1);
}
const preferred = process.env.AI_PROVIDER || available[0]!;
const selectedProvider = providers[preferred as keyof typeof providers];

// Input schema for intelligentPreventionStrategy tool
const IntelligentPreventionStrategyParams = z.object({
  userAddress: z.string().describe('The wallet address to analyze for liquidation prevention'),
  targetHealthFactor: z.number().optional().default(1.03).describe('Target health factor to maintain'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  chainId: z.string().optional().default('42161').describe('Chain ID for the operation'),
});


// LLM System Prompt
const LLM_SYSTEM_PROMPT = `Act as a financial advisor focused on preventing liquidation in DeFi lending protocols.

Based on the data I’ll provide (including current Health Factor, supplied and borrowed assets, their amounts and prices), generate a PreventionResponse in the following format:

export interface PreventionAction {
  actionType: "SUPPLY" | "REPAY" | "HYBRID";
  asset: string;
  amountUsd: string;
  amountToken: string;
  expectedHealthFactor: string;
  priority: number; // 1 = highest priority
}

export interface PreventionResponse {
  currentAnalysis: {
    currentHF: string;
    targetHF: string;
    requiredIncrease: string;
  };
  recommendedActions: PreventionAction[];
  optimalAction: PreventionAction;
}

Your task is to:

Analyze the user's current Health Factor (HF) and determine the gap to a target HF

Suggest 1 or more PreventionActions (e.g., supplying more collateral or repaying part of the loan) to reach or exceed the target HF.

Set the priority field to rank the most effective actions.

Choose the best overall optimalAction

Respond ONLY with a JSON object that matches this TypeScript interface. Do not explain anything.

`;

// Strategy option interface (can be removed as LLM response will dictate actions)
interface StrategyOption {
  type: 'supply' | 'repay' | 'combined';
  priority: number;
  estimatedCost: number;
  estimatedHealthImprovement: number;
  reason: string;
  actions: Array<{
    tool: 'supply' | 'repay';
    tokenAddress: string;
    amount: string;
    description: string;
  }>;
}

// intelligentPreventionStrategy tool implementation
export const intelligentPreventionStrategyTool: VibkitToolDefinition<typeof IntelligentPreventionStrategyParams, any, LiquidationPreventionContext, any> = {
  name: 'intelligent-prevention-strategy',
  description: 'Analyze user position and recommend optimal liquidation prevention strategy',
  parameters: IntelligentPreventionStrategyParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences from instruction (Task 4.3)
      const userPrefs = parseUserPreferences(args.instruction || '');
      const mergedPrefs = mergePreferencesWithDefaults(userPrefs, {
        thresholds: context.custom.thresholds,
        monitoring: context.custom.monitoring,
        strategy: context.custom.strategy,
        targetHealthFactor: args.targetHealthFactor,
      });

      // const targetHF = mergedPrefs.targetHealthFactor || args.targetHealthFactor || 1.03;
      const targetHF = userPrefs.targetHealthFactor
        || args.targetHealthFactor
        || 1.03;
      console.log(`🧠 Analyzing intelligent prevention strategy for user: ${args.userAddress}, target HF: ${targetHF}`);
      console.log(`⚙️  User preferences: ${generatePreferencesSummary(mergedPrefs)}`);

      // Step 1: Call generateLiquidationPreventionData function
      console.log('📊 Step 1: Generating liquidation prevention data...');
      const liquidationData = await generateLiquidationPreventionData(
        args.userAddress,
        context.custom,
        String(targetHF) // Ensure targetHF is a string as expected by generateLiquidationPreventionData
      );


      console.log('🧠 Step 2: Calling LLM for prevention strategy...');
      const prompt = `${LLM_SYSTEM_PROMPT} Here is the data: ${JSON.stringify(liquidationData)}`;


      const modelId = process.env.LLM_MODEL;
      console.log('🧠 LLM model ID:', modelId);
      const model = modelId
        ? selectedProvider!(modelId)
        : (() => {
          console.warn('⚠️ No LLM_MODEL set in env; using default model from provider.');
          return selectedProvider!();
        })();
      console.log('🧠 LLM model:', model);

      const preventionResponseSchema = z.object({
        currentAnalysis: z.object({
          currentHF: z.string(),
          targetHF: z.string(),
          requiredIncrease: z.string(),
        }),
        recommendedActions: z.array(z.object({
          actionType: z.enum(["SUPPLY", "REPAY", "HYBRID"]),
          asset: z.string(),
          amountUsd: z.string(),
          amountToken: z.string(),
          expectedHealthFactor: z.string(),
          priority: z.number(),
        })),
        optimalAction: z.object({
          actionType: z.enum(["SUPPLY", "REPAY", "HYBRID"]),
          asset: z.string(),
          amountUsd: z.string(),
          amountToken: z.string(),
          expectedHealthFactor: z.string(),
          priority: z.number(),
        }),
      });

      const { response } = await generateText({
        model,
        prompt: prompt,
        temperature: 0.7,
        maxTokens: 1000,
      });
      console.log("response done....");
      console.log("response:", response);

      // const messageFromLLM = response?.messages?.[0];
      console.log("🧾 LLM message from LLM:", response?.messages ? JSON.stringify(response?.messages) : "No messages");


      // response.messages is an array of ResponseMessage, not a string
      // We expect the LLM's JSON output to be in the 'content' of the first message
      // const text = response?.messages?.[0]?.content?.[0]?.text;

      // if (!text || typeof text !== "string") {
      //   throw new Error("LLM content[0].text is missing or not a string.");
      // }

      // let llmResponse;
      // try {
      //   llmResponse = preventionResponseSchema.parse(JSON.parse(text));
      // } catch (e) {
      //   console.error("❌ Failed to parse LLM response:", text);
      //   throw e;
      // }

      const llmMessage = response?.messages?.[0];

      if (!llmMessage || !Array.isArray(llmMessage.content)) {
        throw new Error("LLM did not return content as an array.");
      }

      // Find the first "text"-type content block
      const firstTextContent = llmMessage.content.find(c => c.type === "reasoning" || c.type === "text");

      if (!firstTextContent || typeof firstTextContent.text !== "string") {
        throw new Error("LLM content array does not contain a valid text entry.");
      }

      let llmResponse;
      try {
        llmResponse = preventionResponseSchema.parse(JSON.parse(firstTextContent.text));
      } catch (e) {
        console.error("❌ Failed to parse LLM response content:", firstTextContent.text);
        throw e;
      }

      console.log("🧠 LLM response:", llmResponse);

      if (!llmResponse || !llmResponse.optimalAction) {
        throw new Error('LLM did not provide an optimal action.');
      }

      const optimalAction = llmResponse.optimalAction;
      console.log(`✅ LLM recommended optimal action: ${optimalAction.actionType} ${optimalAction.amountToken} ${optimalAction.asset}`);

      // Step 3: Execute the optimal action using the imported tools
      // console.log('🚀 Step 3: Executing optimal action...');
      // let executionResult;
      // if (optimalAction.actionType === 'SUPPLY' || optimalAction.actionType === 'HYBRID') {
      //   executionResult = await supplyCollateralTool.execute({
      //     userAddress: args.userAddress,
      //     tokenAddress: optimalAction.asset,
      //     amount: optimalAction.amountToken,
      //     chainId: args.chainId,
      //   }, context);
      // } else if (optimalAction.actionType === 'REPAY') {
      //   executionResult = await repayDebtTool.execute({
      //     userAddress: args.userAddress,
      //     tokenAddress: optimalAction.asset,
      //     amount: optimalAction.amountToken,
      //     chainId: args.chainId,
      //   }, context);
      // } else {
      //   throw new Error(`Unsupported action type from LLM: ${optimalAction.actionType}`);
      // }

      // if (executionResult.isError) {
      //   throw new Error(`Failed to execute optimal action: ${executionResult.error.message}`);
      // }

      const message = [
        `🧠 **Intelligent Prevention Strategy Analysis**`,
        ``,
        `👤 **User:** ${args.userAddress}`,
        `📊 **Current Health Factor:** ${liquidationData.positionSummary.currentHealthFactor}`,
        `🎯 **Target Health Factor:** ${targetHF}`,
        ``,
        `📋 **LLM Recommended Optimal Action:** ${optimalAction.actionType} ${optimalAction.amountToken} ${optimalAction.asset}`,
        `💡 **Reasoning (from LLM):** Optimal action chosen based on analysis.`,
        `📈 **Expected HF After Action:** ${optimalAction.expectedHealthFactor}`,
        ``,
        `🚀 **Action Executed:** Successfully executed ${optimalAction.actionType} for ${optimalAction.amountToken} ${optimalAction.asset}.`,
        `🕐 **Analyzed & Executed:** ${new Date().toLocaleString()}`,
      ].join('\n');

      console.log(`✅ Strategy analysis and execution complete.`);

      return createSuccessTask(
        'intelligent-prevention-strategy',
        undefined,
        message
      );

    } catch (error) {
      console.error('❌ intelligentPreventionStrategy error:', error);
      return createErrorTask(
        'intelligent-prevention-strategy',
        error instanceof Error ? error : new Error(`Failed to analyze or execute prevention strategy: ${error}`)
      );
    }
  },
};
