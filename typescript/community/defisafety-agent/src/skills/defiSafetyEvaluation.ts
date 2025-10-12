import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';
import { evaluateProtocolTool } from '../tools/evaluateProtocol.js';
import { compareProtocolsTool } from '../tools/compareProtocols.js';
import { generateReportTool } from '../tools/generateReport.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defiSafetyEvaluationSkill = defineSkill({
  id: 'defisafety-evaluation',
  name: 'DeFi Safety Evaluation',
  description:
    'Comprehensive DeFi protocol safety assessment using DeFiSafety criteria (Q1-Q10). Evaluates documentation quality, transparency, and security practices with weighted scoring.',
  tags: ['defi', 'safety', 'evaluation', 'protocol', 'assessment', 'documentation'],
  examples: [
    'Evaluate the safety of Aave protocol documentation from https://docs.aave.com',
    'Generate a comprehensive safety report for Compound protocol by analyzing their documentation',
    'Create a safety assessment for Uniswap by analyzing up to 100 pages of their docs',
    'Assess the documentation quality of Curve Finance by scraping their website',
    'Score the transparency and security practices of MakerDAO based on their documentation',
  ],
  inputSchema: z.object({
    instruction: z.string().describe('Natural language instruction for DeFi safety evaluation operations'),
  }),
  tools: [evaluateProtocolTool, compareProtocolsTool, generateReportTool],

  mcpServers: {
    'defisafety-server': {
      command: 'node',
      args: [
        path.join(
          __dirname,
          '../../../../lib/mcp-tools/defisafety-implementation/dist/index.js'
        )
      ],
      env: Object.fromEntries(
        Object.entries(process.env).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>,
    },
  },
});