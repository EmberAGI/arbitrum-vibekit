import { createSuccessTask, createErrorTask, createArtifact } from '@emberai/arbitrum-vibekit-core';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';

const QuickEvaluationSchema = z.object({
  projectName: z.string().describe('Name of the DeFi protocol being evaluated'),
  baseUrl: z.string().url().describe('Base URL of the protocol documentation to evaluate'),
  maxPages: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(25)
    .default(15)
    .describe('Maximum pages to scrape and analyze (1-25). Optimized for quick results.'),
});

export const quickEvaluationTool: VibkitToolDefinition<typeof QuickEvaluationSchema> = {
  name: 'quick-evaluation',
  description: 'Quick DeFi protocol safety evaluation optimized for speed (completes in ~45 seconds)',
  parameters: QuickEvaluationSchema,
  execute: async (input, context) => {
    try {
      const mcpClientKey = 'defisafety-server';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('DeFiSafety implementation MCP server not connected');
      }

      const result = await context.mcpClients[mcpClientKey].callTool({
        name: 'evaluate_defisafety_criteria',
        arguments: {
          projectName: input.projectName,
          baseUrl: input.baseUrl,
          maxPages: input.maxPages,
        },
      });

      const responseText = (result as any).content[0].text;

      if (responseText.startsWith('Error:') || responseText.startsWith('Failed:')) {
        throw new Error(responseText);
      }

      let evaluationResult;
      try {
        evaluationResult = JSON.parse(responseText);
      } catch (_e) {
        evaluationResult = {
          projectName: input.projectName,
          baseUrl: input.baseUrl,
          evaluation: responseText,
          timestamp: new Date().toISOString(),
        };
      }

      // Create simplified artifacts optimized for quick display
      const artifacts = [
        createArtifact(
          [
            {
              kind: 'text',
              text: `
# ⚡ Quick DeFi Safety Evaluation: ${input.projectName}

**Protocol:** ${input.projectName}  
**Documentation:** ${input.baseUrl}  
**Analysis Scope:** ${input.maxPages} pages (quick mode)  
**Evaluation Date:** ${new Date().toLocaleDateString()}

## 📊 Safety Score

${evaluationResult.overallScore ? `**Overall Score:** ${evaluationResult.overallScore}% (${evaluationResult.scoreCategory || 'N/A'})` : 'See detailed analysis below'}

## 🔍 Key Findings

${typeof evaluationResult.evaluation === 'string' ? evaluationResult.evaluation : JSON.stringify(evaluationResult.evaluation || evaluationResult, null, 2)}

## ℹ️ About This Quick Evaluation

This quick assessment analyzed ${input.maxPages} pages of documentation to provide rapid insights. For comprehensive analysis, request a full evaluation with more pages.

**DeFiSafety Criteria Evaluated:**
- **Q1:** Contract Addresses (15% weight)
- **Q2:** Public Repository (5% weight)  
- **Q3:** Whitepaper/Documentation (5% weight)
- **Q4:** Architecture (12% weight)
- **Q5:** Bug Bounty Programs (8% weight)
- **Q6:** Admin Controls (8% weight)
- **Q7:** Upgradeability (10% weight)
- **Q8:** Contract Ownership (7% weight)
- **Q9:** Change Capabilities (12% weight)
- **Q10:** Oracle Documentation (12% weight)

---
⚠️ **Disclaimer:** This is an automated preliminary assessment. Always conduct thorough due diligence.
          `.trim(),
            },
          ],
          `${input.projectName} Quick Safety Assessment`,
          `Fast DeFiSafety evaluation for ${input.projectName} (${input.maxPages} pages analyzed)`
        ),
      ];

      return createSuccessTask(
        'quick-evaluation',
        artifacts,
        `⚡ Quick evaluation complete! ${input.projectName} analyzed using ${input.maxPages} pages. ${evaluationResult.overallScore ? `Safety Score: ${evaluationResult.overallScore}%` : 'See detailed results above.'}`
      );
    } catch (error) {
      return createErrorTask(
        'quick-evaluation',
        error instanceof Error ? error : new Error('Failed to perform quick evaluation')
      );
    }
  },
};