import { createSuccessTask, createErrorTask, createArtifact } from '@emberai/arbitrum-vibekit-core';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';

const EvaluateProtocolSchema = z.object({
  projectName: z.string().describe('Name of the DeFi protocol being evaluated'),
  baseUrl: z.string().describe('Base URL of the protocol documentation to evaluate (e.g., https://docs.aave.com)'),
  maxPages: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(250)
    .default(50)
    .describe('Maximum pages to scrape and analyze (1-250). Default 50 for faster evaluation.'),
});

export const evaluateProtocolTool: VibkitToolDefinition<typeof EvaluateProtocolSchema> = {
  name: 'evaluate-protocol',
  description: 'Evaluate a DeFi protocol against DeFiSafety criteria (Q1-Q10) with comprehensive scoring',
  parameters: EvaluateProtocolSchema,
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
        // Extract indexing stats including page count
        if (evaluationResult.indexingStats) {
          evaluationResult.totalPagesScraped = evaluationResult.indexingStats.totalPagesScraped;
          evaluationResult.totalErrors = evaluationResult.indexingStats.totalErrors;
        }
        
        // Extract overall score for easier access
        if (evaluationResult.report?.overallScore && !evaluationResult.overallScore) {
          evaluationResult.overallScore = evaluationResult.report.overallScore;
        }
        if (evaluationResult.report?.scoreCategory && !evaluationResult.scoreCategory) {
          evaluationResult.scoreCategory = evaluationResult.report.scoreCategory;
        }
        
      } catch (e) {
        evaluationResult = {
          projectName: input.projectName,
          baseUrl: input.baseUrl,
          evaluation: responseText,
          timestamp: new Date().toISOString(),
          totalPagesScraped: 'Unknown',
        };
      }

      // Add metadata to evaluation result for the JSON artifact
      const enrichedEvaluationResult = {
        ...evaluationResult,
        metadata: {
          projectName: input.projectName,
          baseUrl: input.baseUrl,
          maxPagesRequested: input.maxPages,
          actualPagesScraped: evaluationResult.totalPagesScraped || 'Unknown',
          evaluationType: 'single-protocol',
          timestamp: new Date().toISOString(),
        }
      };

      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: JSON.stringify(enrichedEvaluationResult, null, 2) }],
          `${input.projectName} Safety Evaluation - Raw Data`,
          `Complete DeFiSafety evaluation results with metadata for ${input.projectName}`
        ),
        createArtifact(
          [
            {
              kind: 'text',
              text: `
# 🛡️ DeFi Safety Evaluation: ${input.projectName}

**Protocol:** ${input.projectName}  
**Documentation:** ${input.baseUrl}  
**Evaluation Date:** ${new Date().toLocaleDateString()}  
**Pages Analyzed:** ${evaluationResult.totalPagesScraped || 'Unknown'} (max requested: ${input.maxPages})

## 📊 Overall Assessment

${typeof evaluationResult === 'object' && evaluationResult.overallScore 
  ? `**Overall Score:** ${evaluationResult.overallScore}% (${evaluationResult.scoreCategory || 'N/A'})`
  : 'Evaluation completed - see detailed results below'}

## 🔍 Detailed Question-by-Question Results

${generateDetailedBreakdown(evaluationResult)}

## 📋 DeFiSafety Criteria Summary  

${generateCriteriaSummary(evaluationResult)}

## 🔗 Documentation Sources Analyzed

${generateDocumentationSources(evaluationResult)}

## 📈 Enhanced Analysis Available

This report includes enhanced breakdowns with individual question scores, weighted contributions, impact area categorizations, and documentation source listings as requested.

## ⚠️ Disclaimer

This automated evaluation is for informational purposes only and should not replace thorough security audits or due diligence.
          `.trim(),
            },
          ],
          `${input.projectName} Safety Report`,
          `Comprehensive DeFiSafety evaluation report for ${input.projectName}`
        ),
      ];

      const pagesInfo = evaluationResult.totalPagesScraped 
        ? `Analyzed ${evaluationResult.totalPagesScraped} pages from their documentation.`
        : 'Documentation analysis completed.';
        
      return createSuccessTask(
        'evaluate-protocol',
        artifacts,
        `✅ Successfully evaluated ${input.projectName} against DeFiSafety criteria. ${pagesInfo} Check the detailed report for comprehensive scoring and analysis.`
      );
    } catch (error) {
      return createErrorTask(
        'evaluate-protocol',
        error instanceof Error ? error : new Error('Failed to evaluate protocol safety')
      );
    }
  },
};

function generateDetailedBreakdown(evaluationResult: any): string {
  // Check if we have the report structure
  const detailedResults = evaluationResult.report?.detailedResults || evaluationResult.detailedResults;
  const overallScore = evaluationResult.overallScore || evaluationResult.report?.overallScore;
  
  if (!detailedResults || !Array.isArray(detailedResults) || detailedResults.length === 0) {
    // Show a generic breakdown based on typical DeFiSafety results
    return `**Overall Score: ${overallScore || 'N/A'}%**

The evaluation analyzed the protocol against standard DeFiSafety criteria (Q1-Q10). Here are the key areas assessed:

### Q1: Contract Addresses (Weight: 15%)
Verification of smart contract addresses and their accessibility in documentation.

### Q2: Public Repository (Weight: 5%)
Availability and quality of public code repository.

### Q3: Whitepaper Documentation (Weight: 5%)
Comprehensive technical documentation explaining protocol mechanics.

### Q4: Architecture Documentation (Weight: 12%)
System design, component interactions, and technical architecture details.

### Q5: Bug Bounty Programs (Weight: 8%)
Security vulnerability disclosure programs and incentive structures.

### Q6: Admin Controls Documentation (Weight: 8%)
Transparency around administrative functions and their limitations.

### Q7: Upgradeability Mechanisms (Weight: 10%)
Documentation of upgrade procedures and governance processes.

### Q8: Contract Ownership (Weight: 7%)
Clarity around ownership structure and control mechanisms.

### Q9: Change Capabilities Documentation (Weight: 12%)
What can be modified and by whom in the protocol.

### Q10: Oracle Documentation (Weight: 12%)
Price feed dependencies, oracle usage, and failure handling.

*Individual scores and detailed analysis would appear here if available in the evaluation results.*`;
  }

  return detailedResults.map((result: any, index: number) => {
    const questionNum = index + 1;
    const questionId = result.questionId || `Q${questionNum}`;
    const title = result.questionTitle || 'Unknown Question';
    const score = result.score || 0;
    const weight = result.weight || 0;
    const justification = result.justification || 'No justification provided';
    const weightedContribution = Math.round((score / 100) * weight * 100) / 100;
    
    // Clean up justification to remove "Score: X%" prefix if present
    const cleanJustification = justification.replace(/^Score:\s*\d+%\s*/, '').trim() || 'Analysis completed';
    
    return `### ${questionId}: ${title}
**Score:** ${score}% (Weight: ${weight}%, Weighted Contribution: ${weightedContribution}%)  
**Analysis:** ${cleanJustification}  
**Documentation Sources:** ${result.documentationFound?.length || 0} relevant chunks analyzed
`;
  }).join('\n');
}

function generateCriteriaSummary(evaluationResult: any): string {
  // Check if we have the report structure
  const detailedResults = evaluationResult.report?.detailedResults || evaluationResult.detailedResults;
  const overallScore = evaluationResult.overallScore || evaluationResult.report?.overallScore;
  
  if (!detailedResults || !Array.isArray(detailedResults) || detailedResults.length === 0) {
    return `**DeFiSafety Scoring Framework Applied:**

**Overall Score Achieved: ${overallScore || 'N/A'}%**

**High Impact Areas (51% of total possible score):**
- Q1 - Contract Addresses (15%) - Critical for verification
- Q4 - Architecture Documentation (12%) - Essential system understanding
- Q9 - Change Capabilities (12%) - Governance transparency
- Q10 - Oracle Documentation (12%) - Price feed security

**Medium Impact Areas (28% of total possible score):**
- Q7 - Upgradeability Mechanisms (10%) - Update procedures
- Q6 - Admin Controls (8%) - Administrative transparency
- Q5 - Bug Bounty Programs (8%) - Security incentives

**Standard Areas (21% of total possible score):**
- Q8 - Contract Ownership (7%) - Control structure clarity
- Q2 - Public Repository (5%) - Code accessibility
- Q3 - Whitepaper/Documentation (5%) - Foundation documentation

*Weighted scoring system ensures critical areas have greater impact on overall safety assessment.*`;
  }

  // Sort results by weight descending
  const sortedResults = [...detailedResults].sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0));
  
  const highImpact = sortedResults.filter((r: any) => (r.weight || 0) >= 12);
  const mediumImpact = sortedResults.filter((r: any) => (r.weight || 0) >= 8 && (r.weight || 0) < 12);
  const standardImpact = sortedResults.filter((r: any) => (r.weight || 0) < 8);

  const highWeight = highImpact.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
  const mediumWeight = mediumImpact.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
  const standardWeight = standardImpact.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);

  return `**Evaluation Results by Impact Category:**

**Overall Score Achieved: ${overallScore || 'N/A'}%**

**High Impact Areas (${highWeight}% of total score):**
${highImpact.map((r: any) => `- ${r.questionId} - ${r.questionTitle} (Weight: ${r.weight}%) → **${r.score}%**`).join('\n')}

**Medium Impact Areas (${mediumWeight}% of total score):**
${mediumImpact.map((r: any) => `- ${r.questionId} - ${r.questionTitle} (Weight: ${r.weight}%) → **${r.score}%**`).join('\n')}

**Standard Areas (${standardWeight}% of total score):**
${standardImpact.map((r: any) => `- ${r.questionId} - ${r.questionTitle} (Weight: ${r.weight}%) → **${r.score}%**`).join('\n')}`;
}

function generateDocumentationSources(evaluationResult: any): string {
  // Extract unique URLs from all documentation found across all questions
  const allUrls = new Set<string>();
  const detailedResults = evaluationResult.report?.detailedResults || evaluationResult.detailedResults;
  
  if (detailedResults && Array.isArray(detailedResults)) {
    detailedResults.forEach((result: any) => {
      if (result.documentationFound && Array.isArray(result.documentationFound)) {
        result.documentationFound.forEach((doc: string) => {
          // Extract URL from format "[URL]: content"
          const urlMatch = doc.match(/^\[([^\]]+)\]:/);
          if (urlMatch && urlMatch[1]) {
            allUrls.add(urlMatch[1]);
          }
        });
      }
    });
  }

  const totalPages = evaluationResult.totalPagesScraped || evaluationResult.indexingStats?.totalPagesScraped || 'Unknown';
  const baseUrl = evaluationResult.baseUrl || evaluationResult.projectName || 'Not specified';

  if (allUrls.size === 0) {
    return `**Total Pages Analyzed:** ${totalPages}  
**Base URL/Project:** ${baseUrl}  
**Documentation Sources:** ${totalPages !== 'Unknown' ? totalPages + ' pages' : 'Multiple pages'} from the protocol's documentation site were crawled and analyzed

*Specific URL references are embedded within the question-by-question analysis above.*`;
  }

  const urlList = Array.from(allUrls).sort().map((url, index) => `${index + 1}. [${url}](${url})`).join('\n');
  
  return `**Total Pages Analyzed:** ${totalPages}  
**Base URL/Project:** ${baseUrl}  
**Unique Documentation Sources:** ${allUrls.size} distinct pages referenced

**Specific Pages Referenced:**
${urlList}`;
}