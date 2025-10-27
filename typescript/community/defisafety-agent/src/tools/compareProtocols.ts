import { createSuccessTask, createErrorTask, createArtifact } from '@emberai/arbitrum-vibekit-core';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';

const CompareProtocolsSchema = z.object({
  protocols: z.array(z.object({
    name: z.string().describe('Name of the DeFi protocol'),
    baseUrl: z.string().describe('Base URL of the protocol documentation (e.g., https://docs.aave.com)'),
  })).min(2).max(5).describe('List of protocols to compare (2-5 protocols)'),
  maxPages: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(250)
    .default(30)
    .describe('Maximum pages to scrape per protocol (1-250). Default 30 for faster comparison.'),
});

export const compareProtocolsTool: VibkitToolDefinition<typeof CompareProtocolsSchema> = {
  name: 'compare-protocols',
  description: 'Compare multiple DeFi protocols side-by-side using DeFiSafety criteria',
  parameters: CompareProtocolsSchema,
  execute: async (input, context) => {
    try {
      const mcpClientKey = 'defisafety-server';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('DeFiSafety implementation MCP server not connected');
      }

      const evaluations = [];
      const errors = [];

      for (const protocol of input.protocols) {
        try {
          const result = await context.mcpClients[mcpClientKey].callTool({
            name: 'evaluate_defisafety_criteria',
            arguments: {
              projectName: protocol.name,
              baseUrl: protocol.baseUrl,
              maxPages: input.maxPages,
            },
          });

          const responseText = (result as any).content[0].text;
          
          if (responseText.startsWith('Error:') || responseText.startsWith('Failed:')) {
            errors.push({ protocol: protocol.name, error: responseText });
            continue;
          }

          let evaluationResult;
          try {
            evaluationResult = JSON.parse(responseText);
            // Extract indexing stats including page count for comparison
            if (evaluationResult.indexingStats) {
              evaluationResult.totalPagesScraped = evaluationResult.indexingStats.totalPagesScraped;
              evaluationResult.totalErrors = evaluationResult.indexingStats.totalErrors;
            }
          } catch (_e) {
            evaluationResult = {
              projectName: protocol.name,
              baseUrl: protocol.baseUrl,
              evaluation: responseText,
              totalPagesScraped: 'Unknown',
            };
          }

          evaluations.push({
            protocol: protocol.name,
            url: protocol.baseUrl,
            pagesScraped: evaluationResult.totalPagesScraped || 'Unknown',
            maxPagesRequested: input.maxPages,
            result: evaluationResult,
          });
        } catch (error) {
          errors.push({
            protocol: protocol.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (evaluations.length === 0) {
        throw new Error('Failed to evaluate any protocols: ' + errors.map(e => `${e.protocol}: ${e.error}`).join('; '));
      }

      const comparisonTable = evaluations.map((evaluation, index) => {
        const score = evaluation.result.overallScore || 'N/A';
        const category = evaluation.result.scoreCategory || 'Unknown';
        const pages = evaluation.pagesScraped;
        return `${index + 1}. **${evaluation.protocol}**: ${score}% (${category}) - ${pages} pages analyzed`;
      }).join('\n');

      // Create enriched data with metadata
      const comparisonData = {
        metadata: {
          timestamp: new Date().toISOString(),
          protocolsCompared: evaluations.length,
          maxPagesRequested: input.maxPages,
          totalPagesScraped: evaluations.reduce((sum, e) => {
            const pages = typeof e.pagesScraped === 'number' ? e.pagesScraped : 0;
            return sum + pages;
          }, 0),
          averagePagesPerProtocol: Math.round(evaluations.reduce((sum, e) => {
            const pages = typeof e.pagesScraped === 'number' ? e.pagesScraped : 0;
            return sum + pages;
          }, 0) / evaluations.length),
        },
        evaluations,
        errors,
      };

      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: JSON.stringify(comparisonData, null, 2) }],
          'Protocol Comparison - Raw Data',
          'Complete comparison data with scraping metadata for all evaluated protocols'
        ),
        createArtifact(
          [
            {
              kind: 'text',
              text: `
# 🔄 DeFi Protocol Safety Comparison

**Comparison Date:** ${new Date().toLocaleDateString()}  
**Protocols Evaluated:** ${evaluations.length}  
**Pages Analyzed per Protocol:** ${input.maxPages} (maximum)

## 📊 Quick Comparison

${comparisonTable}

## 📋 Detailed Results

${evaluations.map(evaluation => `
### ${evaluation.protocol}
**Documentation:** ${evaluation.url}  
**Pages Analyzed:** ${evaluation.pagesScraped} (max requested: ${evaluation.maxPagesRequested})  
**Overall Assessment:** ${evaluation.result.overallScore ? `${evaluation.result.overallScore}% (${evaluation.result.scoreCategory})` : 'See detailed analysis'}

#### 🔍 Question-by-Question Breakdown
${generateDetailedBreakdown(evaluation.result)}

#### 📋 Impact Categories
${generateCriteriaSummary(evaluation.result)}

#### 🔗 Documentation Sources
${generateDocumentationSources(evaluation.result)}

---
`).join('')}

${errors.length > 0 ? `
## ⚠️ Evaluation Errors

The following protocols could not be evaluated:
${errors.map(e => `- **${e.protocol}**: ${e.error}`).join('\n')}
` : ''}

## 🎯 Key Insights

Compare protocols across these DeFiSafety criteria:
- **Documentation Quality** (Q1, Q3, Q4): How well are contracts and architecture documented?
- **Transparency** (Q2, Q6, Q8): Is the code accessible and ownership clear?  
- **Security Practices** (Q5, Q7, Q9): Are there bug bounties and proper upgrade mechanisms?
- **Oracle Integration** (Q10): Is oracle usage properly documented?

## ⚠️ Disclaimer

This automated comparison is for informational purposes only. Always conduct thorough due diligence before using any DeFi protocol.
          `.trim(),
            },
          ],
          'Protocol Safety Comparison Report',
          `Side-by-side comparison of ${evaluations.length} DeFi protocols`
        ),
      ];

      const successMessage = errors.length > 0 
        ? `✅ Successfully compared ${evaluations.length}/${input.protocols.length} protocols. ${errors.length} protocol(s) had evaluation errors - see detailed report.`
        : `✅ Successfully compared all ${evaluations.length} protocols against DeFiSafety criteria. See detailed comparison report.`;

      return createSuccessTask('compare-protocols', artifacts, successMessage);
    } catch (error) {
      return createErrorTask(
        'compare-protocols',
        error instanceof Error ? error : new Error('Failed to compare protocols')
      );
    }
  },
};

function generateDetailedBreakdown(evaluationResult: any): string {
  // Check if we have the report structure
  const detailedResults = evaluationResult.report?.detailedResults || evaluationResult.detailedResults;
  const overallScore = evaluationResult.overallScore || evaluationResult.report?.overallScore;
  
  if (!detailedResults || !Array.isArray(detailedResults) || detailedResults.length === 0) {
    return `**Overall Score: ${overallScore || 'N/A'}%**

Standard DeFiSafety Q1-Q10 criteria evaluation completed. Individual question scores would appear here if detailed results were available.`;
  }

  return detailedResults.map((result: any, index: number) => {
    const questionNum = index + 1;
    const questionId = result.questionId || `Q${questionNum}`;
    const title = result.questionTitle || 'Unknown Question';
    const score = result.score || 0;
    const weight = result.weight || 0;
    const weightedContribution = Math.round((score / 100) * weight * 100) / 100;
    
    return `**${questionId}: ${title}** - ${score}% (Weight: ${weight}%, Contribution: ${weightedContribution}%)`;
  }).join('\n');
}

function generateCriteriaSummary(evaluationResult: any): string {
  // Check if we have the report structure
  const detailedResults = evaluationResult.report?.detailedResults || evaluationResult.detailedResults;
  const overallScore = evaluationResult.overallScore || evaluationResult.report?.overallScore;
  
  if (!detailedResults || !Array.isArray(detailedResults) || detailedResults.length === 0) {
    return `**Overall Score: ${overallScore || 'N/A'}%** across DeFiSafety criteria`;
  }

  // Sort results by weight descending
  const sortedResults = [...detailedResults].sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0));
  
  const highImpact = sortedResults.filter((r: any) => (r.weight || 0) >= 12);
  const mediumImpact = sortedResults.filter((r: any) => (r.weight || 0) >= 8 && (r.weight || 0) < 12);
  const standardImpact = sortedResults.filter((r: any) => (r.weight || 0) < 8);

  const highWeight = highImpact.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
  const mediumWeight = mediumImpact.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
  const standardWeight = standardImpact.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);

  let summary = `**Overall Score: ${overallScore || 'N/A'}%**\n\n`;
  
  if (highImpact.length > 0) {
    summary += `**High Impact (${highWeight}%):** ${highImpact.map((r: any) => `${r.questionId}:${r.score}%`).join(', ')}\n`;
  }
  if (mediumImpact.length > 0) {
    summary += `**Medium Impact (${mediumWeight}%):** ${mediumImpact.map((r: any) => `${r.questionId}:${r.score}%`).join(', ')}\n`;
  }
  if (standardImpact.length > 0) {
    summary += `**Standard Areas (${standardWeight}%):** ${standardImpact.map((r: any) => `${r.questionId}:${r.score}%`).join(', ')}`;
  }

  return summary;
}

function generateDocumentationSources(evaluationResult: any): string {
  const totalPages = evaluationResult.totalPagesScraped || evaluationResult.indexingStats?.totalPagesScraped || 'Unknown';
  const baseUrl = evaluationResult.baseUrl || evaluationResult.projectName || 'Not specified';

  return `**Pages Analyzed:** ${totalPages}  
**Documentation Base:** ${baseUrl}  
**Source Quality:** ${totalPages !== 'Unknown' && typeof totalPages === 'number' && totalPages > 10 ? 'Comprehensive' : 'Basic'} coverage`;
}