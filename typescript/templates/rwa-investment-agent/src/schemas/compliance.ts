import { z } from 'zod';

// Regulatory Jurisdictions
export const JurisdictionSchema = z.enum([
    'US',      // United States
    'EU',      // European Union
    'UK',      // United Kingdom
    'CA',      // Canada
    'AU',      // Australia
    'SG',      // Singapore
    'CH',      // Switzerland
    'JP',      // Japan
    'GLOBAL'   // Global/Multi-jurisdiction
]);
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

// Investor Classifications
export const InvestorTypeSchema = z.enum([
    'RETAIL',              // Retail investor
    'ACCREDITED',          // Accredited investor (US)
    'QUALIFIED',           // Qualified investor (EU)
    'PROFESSIONAL',        // Professional investor
    'INSTITUTIONAL',       // Institutional investor
    'ELIGIBLE_COUNTERPARTY' // Eligible counterparty (MiFID II)
]);
export type InvestorType = z.infer<typeof InvestorTypeSchema>;

// KYC Status
export const KYCStatusSchema = z.enum([
    'NOT_STARTED',
    'IN_PROGRESS',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
]);
export type KYCStatus = z.infer<typeof KYCStatusSchema>;

// AML Risk Levels
export const AMLRiskLevelSchema = z.enum([
    'LOW',
    'MEDIUM',
    'HIGH',
    'PROHIBITED'
]);
export type AMLRiskLevel = z.infer<typeof AMLRiskLevelSchema>;

// Compliance Framework Schema
export const ComplianceFrameworkSchema = z.object({
    jurisdiction: JurisdictionSchema,
    regulations: z.array(z.string()), // e.g., ['MiCA', 'AIFMD', 'GDPR']
    requirements: z.object({
        kycRequired: z.boolean(),
        amlRequired: z.boolean(),
        accreditationRequired: z.boolean(),
        professionalInvestorOnly: z.boolean(),
        minimumInvestment: z.string().optional(),
        maximumInvestment: z.string().optional(),
        holdingPeriod: z.number().optional(), // in days
    }),
    documentation: z.array(z.string()), // Required documents
    reportingRequirements: z.array(z.string()),
});
export type ComplianceFramework = z.infer<typeof ComplianceFrameworkSchema>;

// KYC Information Schema
export const KYCInformationSchema = z.object({
    personalInfo: z.object({
        firstName: z.string(),
        lastName: z.string(),
        dateOfBirth: z.string(),
        nationality: z.string(),
        residenceCountry: z.string(),
        taxId: z.string().optional(),
    }),
    address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        postalCode: z.string(),
        country: z.string(),
    }),
    financialInfo: z.object({
        annualIncome: z.string().optional(),
        netWorth: z.string().optional(),
        investmentExperience: z.enum(['NONE', 'LIMITED', 'MODERATE', 'EXTENSIVE']),
        riskTolerance: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']),
    }),
    documents: z.array(z.object({
        type: z.string(), // 'PASSPORT', 'DRIVERS_LICENSE', 'UTILITY_BILL', etc.
        url: z.string(),
        verified: z.boolean(),
        expiryDate: z.string().optional(),
    })),
    status: KYCStatusSchema,
    verifiedAt: z.string().optional(),
    expiresAt: z.string().optional(),
});
export type KYCInformation = z.infer<typeof KYCInformationSchema>;

// AML Check Schema
export const AMLCheckSchema = z.object({
    checkId: z.string(),
    walletAddress: z.string(),
    riskLevel: AMLRiskLevelSchema,
    sanctions: z.object({
        isOnSanctionsList: z.boolean(),
        sanctionLists: z.array(z.string()),
    }),
    pep: z.object({
        isPoliticallyExposed: z.boolean(),
        pepCategory: z.string().optional(),
    }),
    sourceOfFunds: z.object({
        riskScore: z.number().min(0).max(100),
        suspiciousActivity: z.boolean(),
        mixingServices: z.boolean(),
        darknetMarkets: z.boolean(),
    }),
    performedAt: z.string(),
    expiresAt: z.string(),
});
export type AMLCheck = z.infer<typeof AMLCheckSchema>;

// Compliance Status Schema
export const ComplianceStatusSchema = z.object({
    walletAddress: z.string(),
    investorType: InvestorTypeSchema,
    jurisdiction: JurisdictionSchema,
    kyc: z.object({
        status: KYCStatusSchema,
        completedAt: z.string().optional(),
        expiresAt: z.string().optional(),
    }),
    aml: z.object({
        riskLevel: AMLRiskLevelSchema,
        lastCheck: z.string().optional(),
        nextCheck: z.string().optional(),
    }),
    accreditation: z.object({
        isAccredited: z.boolean(),
        accreditationType: z.string().optional(),
        verifiedAt: z.string().optional(),
        expiresAt: z.string().optional(),
    }),
    restrictions: z.array(z.object({
        type: z.string(),
        description: z.string(),
        appliesTo: z.array(z.string()), // Asset types or specific assets
    })),
    approvedAssetTypes: z.array(z.string()),
    maximumInvestment: z.string().optional(),
    isCompliant: z.boolean(),
    lastUpdated: z.string(),
});
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

// Regulatory Reporting Schema
export const RegulatoryReportSchema = z.object({
    reportId: z.string(),
    reportType: z.string(), // 'TRANSACTION', 'POSITION', 'RISK', 'PERIODIC'
    jurisdiction: JurisdictionSchema,
    reportingPeriod: z.object({
        startDate: z.string(),
        endDate: z.string(),
    }),
    data: z.object({
        transactions: z.array(z.object({
            transactionId: z.string(),
            assetId: z.string(),
            amount: z.string(),
            timestamp: z.string(),
            investorType: InvestorTypeSchema,
        })).optional(),
        positions: z.array(z.object({
            assetId: z.string(),
            position: z.string(),
            marketValue: z.string(),
            unrealizedPnL: z.string(),
        })).optional(),
        riskMetrics: z.object({
            portfolioVaR: z.string(),
            concentrationRisk: z.string(),
            liquidityRisk: z.string(),
        }).optional(),
    }),
    generatedAt: z.string(),
    submittedAt: z.string().optional(),
    status: z.enum(['DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED']),
});
export type RegulatoryReport = z.infer<typeof RegulatoryReportSchema>;

// Compliance Check Request/Response
export const ComplianceCheckRequestSchema = z.object({
    walletAddress: z.string(),
    assetId: z.string().optional(),
    investmentAmount: z.string().optional(),
    jurisdiction: JurisdictionSchema.optional(),
});
export type ComplianceCheckRequest = z.infer<typeof ComplianceCheckRequestSchema>;

export const ComplianceCheckResponseSchema = z.object({
    isCompliant: z.boolean(),
    status: ComplianceStatusSchema,
    violations: z.array(z.object({
        type: z.string(),
        description: z.string(),
        severity: z.enum(['WARNING', 'ERROR', 'CRITICAL']),
        resolution: z.string(),
    })),
    requiredActions: z.array(z.object({
        action: z.string(),
        description: z.string(),
        deadline: z.string().optional(),
    })),
    checkedAt: z.string(),
});
export type ComplianceCheckResponse = z.infer<typeof ComplianceCheckResponseSchema>;