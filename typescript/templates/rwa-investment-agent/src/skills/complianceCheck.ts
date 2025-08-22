/**
 * Compliance Check Skill - Regulatory Verification
 * Uses LLM orchestration to verify regulatory compliance for RWA investments
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { verifyKYCStatusTool } from '../tools/verifyKYCStatus.js';
import { checkAMLComplianceTool } from '../tools/checkAMLCompliance.js';
import { validateJurisdictionRulesTool } from '../tools/validateJurisdictionRules.js';

// Input schema for compliance checking requests
const ComplianceCheckInputSchema = z.object({
  instruction: z.string().describe('Natural language instruction for compliance checking'),
  walletAddress: z.string().describe('Wallet address to check compliance for'),
  assetId: z.string().optional().describe('Specific RWA asset ID to check investment eligibility'),
  investmentAmount: z.string().optional().describe('Planned investment amount in USD'),
  jurisdiction: z.string().optional().describe('Target regulatory jurisdiction (US, EU, UK, etc.)'),
  investorType: z.enum(['RETAIL', 'ACCREDITED', 'QUALIFIED', 'PROFESSIONAL', 'INSTITUTIONAL']).optional().describe('Type of investor'),
});

export const complianceCheckSkill = defineSkill({
  id: 'rwa-compliance-check',
  name: 'RWA Compliance Verification',
  description: 'Verify regulatory compliance for RWA investments across multiple jurisdictions with KYC/AML checking',
  
  tags: ['rwa', 'compliance', 'kyc', 'aml', 'regulatory', 'jurisdiction', 'verification', 'legal'],
  
  examples: [
    'Check if I can invest $10k in this real estate token',
    'Verify my compliance status for EU MiCA regulations',
    'What KYC requirements do I need for institutional loans?',
    'Am I eligible to invest in this Centrifuge pool?',
    'Check AML compliance for my wallet address',
    'What are the investment limits for my jurisdiction?',
    'Verify accreditation requirements for this asset',
  ],

  inputSchema: ComplianceCheckInputSchema,

  // Tools available for LLM orchestration
  tools: [
    verifyKYCStatusTool,
    checkAMLComplianceTool,
    validateJurisdictionRulesTool,
  ],

  // No manual handler - use LLM orchestration for intelligent compliance checking
  // The LLM will:
  // 1. Analyze compliance requirements for specific assets and jurisdictions
  // 2. Check KYC/AML status and investor accreditation
  // 3. Validate investment limits and regulatory restrictions
  // 4. Provide clear guidance on compliance violations and required actions
});
