/**
 * intelligentPreventionStrategy Tool
 * 
 * Analyzes user position, wallet balances, and provides strategy recommendations
 * for liquidation prevention.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, getAvailableProviders } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { parseUserPreferences } from '../utils/userPreferences.js';
import { generateLiquidationPreventionData } from '../utils/liquidationData.js';
import { supplyCollateralTool } from './supplyCollateral.js';
import { repayDebtTool } from './repayDebt.js';
import { generateText, type LanguageModelV1 } from 'ai';
import { createProviderSelector } from 'arbitrum-vibekit-core';
import dotenv from 'dotenv';
import { preventionResponseSchema } from '../schemas/prevention.js';

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


const LLM_SYSTEM_PROMPT = `
You are a backend assistant helping manage DeFi borrowing risk.

### User Task
The user wants to avoid liquidation by improving their health factor (HF) to a safe level.  
You are given a snapshot of their wallet, current supplied/borrowed assets, and position summary.  

Your job is to:
1. Analyze the current Health Factor (HF) vs. the target HF.
2. Determine how much collateral needs to be added or debt repaid to reach the target.
3. Recommend one or more actions to improve the HF, using only wallet assets.
4. Select the optimal action (SUPPLY / REPAY / HYBRID) based on feasibility and impact.

### Action Strategy Constraints
- Suggest 1 or more PreventionActions (e.g., SUPPLY, REPAY, or HYBRID) to reach or slightly exceed the target health factor.
- DO NOT suggest actions that raise the health factor significantly above the target (e.g., HF of 2.0 when target is 1.5).
- Prefer the smallest action(s) that meet or slightly exceed the target.
- Use wallet assets efficiently. Do not recommend using all available assets if a smaller amount is enough.
- Do not exceed token balances from the wallet.
- OptimalAction should be the minimal effective action with the highest health factor gain per dollar used.

### HYBRID Action Notes
- HYBRID actions are a combination of multiple smaller SUPPLY and/or REPAY actions.
- Each HYBRID action must contain a steps array listing the individual actions.
- Do not include more than 2 steps in a HYBRID action.
- The asset, amountUsd, and amountToken fields are optional for HYBRID and may be omitted.

### Output Format
Return a valid JSON object that matches this TypeScript interface exactly:

interface PreventionResponse {
  currentAnalysis: {
    currentHF: string;
    targetHF: string;
    requiredIncrease: string;
  };
  recommendedActions: PreventionAction[];
  optimalAction: PreventionAction;
}

interface PreventionAction {
  actionType: "SUPPLY" | "REPAY" | "HYBRID";
  steps?: {
    actionType: "SUPPLY" | "REPAY";
    asset: string;
    amountUsd: string;
    amountToken: string;
    expectedHealthFactor: string;
    priority: number;
  }[];
  asset: string;
  amountUsd: string;
  amountToken: string;
  expectedHealthFactor: string;
  priority: number; // 1 = highest priority
}


### Output Rules
- 🚫 Do NOT explain anything.
- 🚫 Do NOT return markdown (no triple backticks).
- 🚫 Do NOT include extra fields or explanation.
- ✅ Return ONLY valid JSON (no comments, no extra keys).
`;

// intelligentPreventionStrategy tool implementation
export const intelligentPreventionStrategyTool: VibkitToolDefinition<typeof IntelligentPreventionStrategyParams, any, LiquidationPreventionContext, any> = {
  name: 'intelligent-prevention-strategy',
  description: 'Analyze user position and recommend optimal liquidation prevention strategy',
  parameters: IntelligentPreventionStrategyParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences from instruction (only for targetHealthFactor)
      const userPrefs = parseUserPreferences(args.instruction || '');

      const targetHF = userPrefs.targetHealthFactor
        || args.targetHealthFactor
        || 1.03;
      console.log(`🧠 Analyzing intelligent prevention strategy for user: ${args.userAddress}, target HF: ${targetHF}`);
      if (userPrefs.targetHealthFactor) {
        console.log(`🎯 User specified Target Health Factor: ${userPrefs.targetHealthFactor}`);
      }

      // Step 1: Call generateLiquidationPreventionData function
      console.log('📊 Step 1: Generating liquidation prevention data...');
      const liquidationData = await generateLiquidationPreventionData(
        args.userAddress,
        context.custom,
        String(targetHF) // Ensure targetHF is a string as expected by generateLiquidationPreventionData
      );


      const prompt = `
      ${LLM_SYSTEM_PROMPT}
      
      ### User Data
      The following is the user's liquidation data in JSON format:
      
      ${JSON.stringify(liquidationData)}
      `;

      console.log("🧠 prompt:", prompt);


      const modelId = process.env.LLM_MODEL;
      console.log('🧠 LLM model ID:', modelId);
      const model = modelId
        ? selectedProvider!(modelId)
        : (() => {
          console.warn('⚠️ No LLM_MODEL set in env; using default model from provider.');
          return selectedProvider!();
        })();


      const { response } = await generateText({
        model,
        prompt: prompt,
        temperature: 0.7,
        maxTokens: 4000,
      });

      // const messageFromLLM = response?.messages?.[0];
      console.log("🧾 LLM message from LLM:", response?.messages ? JSON.stringify(response?.messages) : "No messages");

      const llmMessage = response?.messages?.[0];

      if (!llmMessage || !Array.isArray(llmMessage.content)) {
        throw new Error("LLM did not return content as an array.");
      }

      // Find the first "text"-type content block
      const firstTextContent = llmMessage.content.find(c => c.type === "text");

      if (!firstTextContent || typeof firstTextContent.text !== "string") {
        throw new Error("LLM content array does not contain a valid text entry.");
      }

      let parsedJson;
      try {
        parsedJson = JSON.parse(firstTextContent.text);
        console.log("🧠 Parsed JSON from LLM:", parsedJson);
      } catch (e) {
        console.error("❌ Failed to parse LLM response as JSON:", firstTextContent.text);
        throw e;
      }

      let llmResponse;
      try {
        llmResponse = preventionResponseSchema.parse(parsedJson);
        console.log("✅ Validated LLM response:", llmResponse);
      } catch (e) {
        console.error("❌ Schema validation failed:", parsedJson);
        throw e;
      }


      const optimalAction = llmResponse.optimalAction;
      console.log(`✅ LLM recommended optimal action: ${optimalAction.actionType} ${optimalAction.amountToken} ${optimalAction.asset}`);

      console.log('🚀 Step 3: Executing optimal action...');

      let executionResults: { step: string; result: any }[] = [];

      // 🔁 Reusable helper function to execute a single step
      const executeStep = async (label: string, actionType: "SUPPLY" | "REPAY", asset: string, amountToken: string) => {
        const tool = actionType === "SUPPLY" ? supplyCollateralTool : repayDebtTool;
        const result = await tool.execute({
          userAddress: args.userAddress,
          tokenSymbol: asset,
          amount: amountToken,
          chainId: args.chainId,
        }, context);

        if (result?.isError) {
          throw new Error(`❌ ${label} failed: ${result.error.message}`);
        }

        executionResults.push({ step: label, result });
        console.log(`✅ ${label} executed successfully.`);
      };

      if (optimalAction.actionType === 'HYBRID') {
        if (!optimalAction.steps || !Array.isArray(optimalAction.steps)) {
          throw new Error("HYBRID action must include 'steps'.");
        }

        for (const [index, step] of optimalAction.steps.entries()) {
          const label = `Step ${index + 1}: ${step.actionType} ${step.amountToken} ${step.asset}`;
          await executeStep(label, step.actionType, step.asset, step.amountToken);
        }

      } else if (optimalAction.actionType === 'SUPPLY' || optimalAction.actionType === 'REPAY') {
        const label = `${optimalAction.actionType} ${optimalAction.amountToken} ${optimalAction.asset}`;
        await executeStep(label, optimalAction.actionType, optimalAction.asset, optimalAction.amountToken);

      } else {
        throw new Error(`Unsupported action type from LLM: ${optimalAction.actionType}`);
      }

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
