import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { executeInvestmentTool } from '../tools/executeInvestment.js';
import { portfolioManagerTool } from '../tools/portfolioManager.js';

const InvestmentExecutionSchema = z.object({
    instruction: z.string().describe('Natural language instruction for investment'),
    walletAddress: z.string().describe('Investor wallet address'),
    amount: z.string().optional().describe('Investment amount (if not specified, will be calculated)'),
    riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().describe('Risk tolerance level'),
    preferredAssetTypes: z.array(z.string()).optional().describe('Preferred asset types'),
    maxYield: z.number().optional().describe('Maximum expected yield'),
});

export const investmentExecutionSkill = defineSkill({
    id: 'rwa-investment-execution',
    name: 'RWA Investment Execution',
    description: 'Execute investments in Real World Assets with full blockchain integration',
    tags: ['rwa', 'investment', 'blockchain', 'execution', 'portfolio'],
    examples: [
        'Invest $10,000 in real estate with 8%+ yield',
        'Put $5,000 in low-risk invoice financing',
        'Diversify my portfolio with carbon credits',
        'Invest in institutional loans with 15%+ yield',
        'Check my current RWA portfolio and suggest investments',
    ],
    inputSchema: InvestmentExecutionSchema,
    tools: [
        executeInvestmentTool,
        portfolioManagerTool,
    ],
    // No handler = LLM orchestration (recommended)
});
