/**
 * Validate Jurisdiction Rules Tool
 * Validates regulatory compliance rules for specific jurisdictions
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { RWAContext } from '../context/types.js';

const ValidateJurisdictionParams = z.object({
  walletAddress: z.string().describe('Wallet address to validate'),
  jurisdiction: z.string().describe('Target jurisdiction (US, EU, UK, etc.)'),
  assetId: z.string().optional().describe('Specific asset to validate for'),
  investmentAmount: z.string().optional().describe('Investment amount to validate'),
  investorType: z.enum(['RETAIL', 'ACCREDITED', 'QUALIFIED', 'PROFESSIONAL', 'INSTITUTIONAL']).optional(),
});

export const validateJurisdictionRulesTool: VibkitToolDefinition<
  typeof ValidateJurisdictionParams,
  any,
  RWAContext,
  any
> = {
  name: 'validate-jurisdiction-rules',
  description: 'Validate regulatory compliance rules for specific jurisdictions and asset types',
  parameters: ValidateJurisdictionParams,
  
  execute: async (args, context) => {
    try {
      console.log(`🌍 Validating jurisdiction rules for ${args.jurisdiction}:`, args.walletAddress);

      const complianceFramework = context.custom.complianceFrameworks[args.jurisdiction];
      
      if (!complianceFramework) {
        return createErrorTask(
          'rwa-jurisdiction-validation',
          new Error(`Jurisdiction ${args.jurisdiction} not supported`)
        );
      }

      // Mock investor profile data
      const mockInvestorProfile = {
        walletAddress: args.walletAddress,
        investorType: args.investorType || 'RETAIL',
        jurisdiction: args.jurisdiction,
        accreditation: {
          isAccredited: args.investorType === 'ACCREDITED' || args.investorType === 'INSTITUTIONAL',
          accreditationType: args.investorType === 'ACCREDITED' ? 'SEC_ACCREDITED' : undefined,
          verifiedAt: '2024-10-01T00:00:00Z',
        },
        investmentLimits: {
          annualLimit: '100000',
          singleInvestmentLimit: '25000',
          portfolioLimit: '500000',
        },
      };

      let complianceStatus = 'COMPLIANT';
      const violations = [];
      const warnings = [];
      const requiredActions = [];

      // Check accreditation requirements
      if (complianceFramework.accreditationRequired && !mockInvestorProfile.accreditation.isAccredited) {
        complianceStatus = 'NON_COMPLIANT';
        violations.push({
          type: 'ACCREDITATION_REQUIRED',
          description: `${args.jurisdiction} requires accredited investor status`,
          severity: 'CRITICAL' as const,
          regulation: complianceFramework.regulations[0],
        });
        requiredActions.push({
          action: 'OBTAIN_ACCREDITATION',
          description: `Obtain accredited investor certification for ${args.jurisdiction}`,
          deadline: '2025-03-01T00:00:00Z',
        });
      }

      // Check investment amount limits
      if (args.investmentAmount && complianceFramework.minimumInvestment) {
        const investmentAmount = parseFloat(args.investmentAmount);
        const minInvestment = parseFloat(complianceFramework.minimumInvestment);
        
        if (investmentAmount < minInvestment) {
          violations.push({
            type: 'MINIMUM_INVESTMENT',
            description: `Investment amount below minimum of $${complianceFramework.minimumInvestment}`,
            severity: 'ERROR' as const,
          });
        }
      }

      if (args.investmentAmount && complianceFramework.maximumInvestment) {
        const investmentAmount = parseFloat(args.investmentAmount);
        const maxInvestment = parseFloat(complianceFramework.maximumInvestment);
        
        if (investmentAmount > maxInvestment) {
          complianceStatus = 'NON_COMPLIANT';
          violations.push({
            type: 'MAXIMUM_INVESTMENT_EXCEEDED',
            description: `Investment amount exceeds maximum of $${complianceFramework.maximumInvestment}`,
            severity: 'ERROR' as const,
          });
          requiredActions.push({
            action: 'REDUCE_INVESTMENT',
            description: `Reduce investment to comply with $${complianceFramework.maximumInvestment} limit`,
          });
        }
      }

      // Check single investment limits for retail investors
      if (mockInvestorProfile.investorType === 'RETAIL' && args.investmentAmount) {
        const investmentAmount = parseFloat(args.investmentAmount);
        const singleLimit = parseFloat(mockInvestorProfile.investmentLimits.singleInvestmentLimit);
        
        if (investmentAmount > singleLimit) {
          warnings.push({
            type: 'SINGLE_INVESTMENT_LIMIT',
            description: `Investment exceeds recommended single investment limit of $${singleLimit}`,
            severity: 'WARNING' as const,
          });
        }
      }

      // Jurisdiction-specific rules
      const jurisdictionSpecificRules = {
        US: {
          rules: [
            'SEC registration or exemption required',
            'Accredited investor verification for private placements',
            'Anti-money laundering compliance (FinCEN)',
            'State-level money transmission licenses may apply',
          ],
          restrictions: [
            'Maximum 99 non-accredited investors in private placements',
            'General solicitation restrictions apply',
            'Holding period requirements for restricted securities',
          ],
        },
        EU: {
          rules: [
            'MiCA compliance for crypto assets',
            'AIFMD requirements for alternative investments',
            'GDPR data protection compliance',
            'Prospectus requirements for public offerings',
          ],
          restrictions: [
            'Professional investor thresholds apply',
            'Cross-border marketing restrictions',
            'Retail investor protection measures',
          ],
        },
        UK: {
          rules: [
            'FCA authorization required for regulated activities',
            'FSMA compliance for financial promotions',
            'MLR anti-money laundering requirements',
            'Client categorization (retail/professional/eligible counterparty)',
          ],
          restrictions: [
            'Retail investor restrictions on complex products',
            'Marketing restrictions for unauthorized funds',
            'Suitability assessments required',
          ],
        },
      };

      const specificRules = jurisdictionSpecificRules[args.jurisdiction as keyof typeof jurisdictionSpecificRules];

      const validationResult = {
        walletAddress: args.walletAddress,
        jurisdiction: args.jurisdiction,
        complianceFramework,
        complianceStatus,
        violations,
        warnings,
        requiredActions,
        applicableRules: specificRules?.rules || [],
        restrictions: specificRules?.restrictions || [],
        investorProfile: mockInvestorProfile,
        validatedAt: new Date().toISOString(),
      };

      console.log(`✅ Jurisdiction validation completed for ${args.jurisdiction}`);
      console.log(`📊 Status: ${complianceStatus}, Violations: ${violations.length}, Warnings: ${warnings.length}`);
      console.log(`📋 Applicable regulations: ${complianceFramework.regulations.join(', ')}`);

      const statusMessage = complianceStatus === 'COMPLIANT'
        ? `Jurisdiction validation passed for ${args.jurisdiction}. Investor type: ${mockInvestorProfile.investorType}${mockInvestorProfile.accreditation.isAccredited ? ' (Accredited)' : ''}. All regulatory requirements met under ${complianceFramework.regulations.join(', ')}. ${warnings.length > 0 ? `${warnings.length} advisory warnings noted.` : ''}`
        : `Jurisdiction compliance issues for ${args.jurisdiction}: ${violations.length} violations detected. Key issues: ${violations.map(v => v.type).join(', ')}. ${requiredActions.length > 0 ? `Required actions: ${requiredActions[0].description}.` : ''}`;

      return createSuccessTask(
        'rwa-jurisdiction-validation',
        undefined,
        statusMessage
      );

    } catch (error) {
      console.error('❌ Error validating jurisdiction rules:', error);
      return createErrorTask(
        'rwa-jurisdiction-validation',
        error instanceof Error ? error : new Error('Failed to validate jurisdiction rules')
      );
    }
  },
};
