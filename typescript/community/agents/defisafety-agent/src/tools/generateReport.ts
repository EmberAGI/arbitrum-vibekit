import { createSuccessTask, createErrorTask, createArtifact } from '@emberai/arbitrum-vibekit-core';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';

const GenerateReportSchema = z.object({
  projectName: z.string().describe('Name of the DeFi protocol for the report'),
  baseUrl: z.string().describe('Base URL of the protocol documentation (e.g., https://docs.aave.com)'),
  maxPages: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(250)
    .default(50)
    .describe('Maximum documentation pages to scrape and analyze from the protocol website (not the length of the output report). The agent crawls up to this many pages from the documentation site to gather information for analysis.'),
  reportType: z.enum(['comprehensive', 'executive', 'technical']).default('comprehensive').describe('Type of report to generate'),
});

export const generateReportTool: VibkitToolDefinition<typeof GenerateReportSchema> = {
  name: 'generate-report',
  description: 'Generate a detailed safety assessment report for a DeFi protocol by scraping and analyzing documentation pages from their website. The maxPages parameter controls how many documentation pages to crawl for analysis, not the length of the output report.',
  parameters: GenerateReportSchema,
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
      } catch (e) {
        evaluationResult = {
          projectName: input.projectName,
          baseUrl: input.baseUrl,
          evaluation: responseText,
          timestamp: new Date().toISOString(),
          totalPagesScraped: 'Unknown',
        };
      }

      const reportContent = generateReportContent(input, evaluationResult);
      
      // Add metadata to evaluation result for the JSON artifact
      const enrichedEvaluationResult = {
        ...evaluationResult,
        metadata: {
          projectName: input.projectName,
          baseUrl: input.baseUrl,
          maxPagesRequested: input.maxPages,
          actualPagesScraped: evaluationResult.totalPagesScraped || 'Unknown',
          reportType: input.reportType,
          timestamp: new Date().toISOString(),
        }
      };

      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: JSON.stringify(enrichedEvaluationResult, null, 2) }],
          `${input.projectName} Evaluation Data`,
          'Raw evaluation data with scraping metadata used for report generation'
        ),
        createArtifact(
          [{ kind: 'text', text: reportContent }],
          `${input.projectName} ${input.reportType.charAt(0).toUpperCase() + input.reportType.slice(1)} Safety Report`,
          `${input.reportType} safety assessment report for ${input.projectName}`
        ),
      ];

      const pagesInfo = evaluationResult.totalPagesScraped 
        ? `Analyzed ${evaluationResult.totalPagesScraped} pages from their documentation.`
        : 'Documentation analysis completed.';
        
      return createSuccessTask(
        'generate-report',
        artifacts,
        `✅ Successfully generated ${input.reportType} safety report for ${input.projectName}. ${pagesInfo} The report includes detailed analysis and recommendations.`
      );
    } catch (error) {
      return createErrorTask(
        'generate-report',
        error instanceof Error ? error : new Error('Failed to generate safety report')
      );
    }
  },
};

function generateReportContent(input: z.infer<typeof GenerateReportSchema>, evaluationResult: any): string {
  const timestamp = new Date().toISOString();
  const overallScore = evaluationResult.overallScore || 'N/A';
  const scoreCategory = evaluationResult.scoreCategory || 'Unknown';

  switch (input.reportType) {
    case 'executive':
      return `
# 📋 Executive Summary: ${input.projectName}

**Report Date:** ${new Date().toLocaleDateString()}  
**Protocol:** ${input.projectName}  
**Documentation Source:** ${input.baseUrl}  

## Key Findings

**Overall Safety Score:** ${overallScore}% (${scoreCategory})

${typeof evaluationResult.evaluation === 'string' ? evaluationResult.evaluation.substring(0, 1000) + '...' : 'See detailed analysis below'}

## Recommendation

${overallScore >= 90 ? '✅ **STRONG** - Protocol demonstrates excellent safety practices and documentation quality.' :
  overallScore >= 70 ? '⚠️ **ADEQUATE** - Protocol meets basic safety standards but has areas for improvement.' :
  overallScore >= 50 ? '❌ **CONCERNING** - Protocol has significant documentation gaps and safety concerns.' :
  '🚨 **HIGH RISK** - Protocol lacks essential safety documentation and transparency.'}

---
*This executive summary is based on automated DeFiSafety criteria evaluation. Conduct thorough due diligence before making investment decisions.*
      `.trim();

    case 'technical':
      return `
# 🔧 Technical Assessment: ${input.projectName}

**Report Generated:** ${timestamp}  
**Protocol:** ${input.projectName}  
**Source:** ${input.baseUrl}  
**Pages Analyzed:** ${evaluationResult.totalPagesScraped || 'Unknown'} (max requested: ${input.maxPages})

## Technical Evaluation Details

${typeof evaluationResult.evaluation === 'object' ? JSON.stringify(evaluationResult.evaluation, null, 2) : evaluationResult.evaluation}

## DeFiSafety Criteria Breakdown

### High Impact Areas (Q1, Q4, Q9, Q10 - 51% of score)
- **Q1 - Contract Addresses (15%):** Critical for verification
- **Q4 - Architecture (12%):** Essential for understanding system design  
- **Q9 - Change Capabilities (12%):** Important for governance assessment
- **Q10 - Oracle Documentation (12%):** Crucial for price feed security

### Medium Impact Areas (Q6, Q7 - 18% of score)
- **Q6 - Admin Controls (8%):** Transparency in administrative functions
- **Q7 - Upgradeability (10%):** Understanding upgrade mechanisms

### Standard Areas (Q2, Q3, Q5, Q8 - 25% of score)
- **Q2 - Public Repository (5%):** Code accessibility
- **Q3 - Whitepaper (5%):** Foundational documentation
- **Q5 - Bug Bounty (8%):** Security incentive programs  
- **Q8 - Contract Ownership (7%):** Ownership structure clarity

## Technical Recommendations

Based on the evaluation, focus improvement efforts on the highest-weighted criteria for maximum impact on overall safety score.

---
*Technical assessment based on DeFiSafety v2024 criteria*
      `.trim();

    default: // comprehensive
      return `
# 📊 Comprehensive Safety Report: ${input.projectName}

**Report Generated:** ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}  
**Protocol Name:** ${input.projectName}  
**Documentation Source:** ${input.baseUrl}  
**Pages Analyzed:** ${evaluationResult.totalPagesScraped || 'Unknown'} pages (max requested: ${input.maxPages})  
**Report ID:** ${timestamp.split('T')[0]}-${input.projectName.replace(/\s+/g, '-').toLowerCase()}

## Executive Summary

### Overall Assessment
- **Safety Score:** ${overallScore}% 
- **Risk Category:** ${scoreCategory}
- **Evaluation Status:** ${evaluationResult.success !== false ? 'Complete' : 'Partial/Failed'}

### Key Strengths & Weaknesses
${generateStrengthsWeaknesses(overallScore)}

## 🔍 Detailed Question-by-Question Results

${generateDetailedBreakdown(evaluationResult)}

## 📋 DeFiSafety Criteria Summary

${generateCriteriaSummary(evaluationResult)}

## 🔗 Documentation Sources Analyzed

${generateDocumentationSources(evaluationResult)}

## Scoring Methodology

This report uses the DeFiSafety scoring system with weighted criteria:

### Critical Documentation (44% of total score)
- **Q1 - Contract Addresses (15%):** Availability and accuracy of smart contract addresses
- **Q4 - Architecture Documentation (12%):** System design and component interaction docs
- **Q9 - Change Capabilities (12%):** Governance and modification processes
- **Q2 - Public Repository (5%):** Open source code availability

### Security & Risk Management (33% of total score)
- **Q10 - Oracle Documentation (12%):** Price feed and external data documentation
- **Q7 - Upgradeability (10%):** Upgrade mechanisms and procedures
- **Q5 - Bug Bounty Programs (8%):** Security vulnerability disclosure programs
- **Q3 - Whitepaper/Docs (5%):** Foundational technical documentation

### Transparency & Governance (23% of total score)
- **Q6 - Admin Controls (8%):** Administrative function documentation
- **Q8 - Contract Ownership (7%):** Ownership structure and control mechanisms

## Risk Assessment

${generateRiskAssessment(overallScore)}

## Recommendations

### Immediate Actions Required
${generateRecommendations(evaluationResult, 'immediate')}

### Medium-term Improvements  
${generateRecommendations(evaluationResult, 'medium')}

### Best Practices for Ongoing Compliance
${generateRecommendations(evaluationResult, 'ongoing')}

## Appendix

### Evaluation Parameters
- **Base URL:** ${input.baseUrl}
- **Pages Analyzed:** ${evaluationResult.totalPagesScraped || 'Unknown'} pages (requested max: ${input.maxPages})
- **Evaluation Date:** ${timestamp}
- **Methodology:** DeFiSafety v2024 Criteria
- **Note:** All available pages from the documentation site were analyzed up to the specified maximum

### Disclaimer
This automated evaluation provides a preliminary assessment based on publicly available documentation. It does not constitute:
- Investment advice or recommendations
- A comprehensive security audit
- Legal or regulatory compliance verification
- A substitute for professional due diligence

Always conduct thorough independent research and consult with qualified professionals before making investment decisions.

---
**Report Classification:** ${input.reportType.toUpperCase()}  
**Generated by:** DeFi Safety Agent v1.0.0  
**Next Review:** Recommended within 90 days or upon significant protocol changes
      `.trim();
  }
}

function generateStrengthsWeaknesses(score: string | number): string {
  const numScore = typeof score === 'string' ? parseFloat(score) : score;
  
  if (isNaN(numScore)) return 'Unable to determine strengths and weaknesses from evaluation data.';

  if (numScore >= 90) {
    return `
**Key Strengths:**
- Comprehensive documentation coverage across all DeFiSafety criteria
- High transparency in contract addresses and architecture
- Well-documented governance and change management processes

**Areas for Monitoring:**
- Maintain current documentation standards
- Regular updates to reflect protocol changes
    `.trim();
  } else if (numScore >= 70) {
    return `
**Key Strengths:**
- Adequate documentation in core areas
- Basic transparency requirements met
- Some security best practices in place

**Key Weaknesses:**
- Missing documentation in several DeFiSafety criteria
- Opportunities to improve transparency and governance documentation
- Consider expanding bug bounty and security disclosure programs
    `.trim();
  } else {
    return `
**Key Weaknesses:**
- Significant gaps in critical documentation areas
- Limited transparency in governance and admin controls
- Insufficient security practice documentation
- Missing or incomplete contract verification information

**Immediate Attention Required:**
- Address high-impact documentation gaps (Q1, Q4, Q9, Q10)
- Improve transparency around admin functions and ownership
- Establish clear change management and upgrade procedures
    `.trim();
  }
}

function generateRiskAssessment(score: string | number): string {
  const numScore = typeof score === 'string' ? parseFloat(score) : score;
  
  if (isNaN(numScore)) return 'Unable to assess risk level from evaluation data.';

  if (numScore >= 90) return '🟢 **LOW RISK** - Protocol demonstrates strong safety practices and comprehensive documentation.';
  if (numScore >= 70) return '🟡 **MEDIUM RISK** - Protocol meets basic safety standards but has improvement opportunities.';
  if (numScore >= 50) return '🟠 **HIGH RISK** - Protocol has significant documentation gaps that may indicate operational risks.';
  return '🔴 **VERY HIGH RISK** - Protocol lacks essential safety documentation and transparency measures.';
}

function generateRecommendations(evaluationResult: any, timeframe: 'immediate' | 'medium' | 'ongoing'): string {
  const genericRecommendations = {
    immediate: [
      'Verify and publish all smart contract addresses with clear verification status',
      'Document administrative functions and their current control mechanisms',
      'Establish basic change management procedures for protocol updates',
    ],
    medium: [
      'Develop comprehensive architecture documentation with system diagrams',
      'Implement or expand bug bounty programs for security vulnerability disclosure', 
      'Create detailed upgrade procedures and governance documentation',
    ],
    ongoing: [
      'Regularly update documentation to reflect protocol changes',
      'Monitor and benchmark against other protocols in the same category',
      'Establish periodic internal reviews using DeFiSafety criteria',
    ],
  };

  return genericRecommendations[timeframe].map((rec, index) => `${index + 1}. ${rec}`).join('\n');
}

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