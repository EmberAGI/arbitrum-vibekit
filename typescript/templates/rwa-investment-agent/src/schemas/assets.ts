import { z } from 'zod';

// Core RWA Asset Types
export const AssetTypeSchema = z.enum([
    'REAL_ESTATE',
    'INVOICES',
    'CARBON_CREDITS',
    'SUPPLY_CHAIN_FINANCE',
    'INSTITUTIONAL_LOANS',
    'COMMODITIES',
    'INFRASTRUCTURE',
    'INTELLECTUAL_PROPERTY'
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

// Asset Classification
export const AssetClassificationSchema = z.object({
    type: AssetTypeSchema,
    subtype: z.string(),
    sector: z.string(),
    geography: z.string(),
    currency: z.string(),
});
export type AssetClassification = z.infer<typeof AssetClassificationSchema>;

// RWA Asset Schema
export const RWAAssetSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    classification: AssetClassificationSchema,

    // Financial Details
    totalValue: z.string(),
    tokenizedValue: z.string(),
    minimumInvestment: z.string(),
    expectedYield: z.string(),
    maturityDate: z.string().optional(),

    // Risk Metrics
    creditRating: z.string().optional(),
    riskScore: z.number().min(0).max(100),
    liquidityScore: z.number().min(0).max(100),

    // Tokenization Details
    tokenAddress: z.string(),
    tokenSymbol: z.string(),
    tokenDecimals: z.number(),
    chainId: z.string(),

    // Compliance
    regulatoryStatus: z.string(),
    kycRequired: z.boolean(),
    accreditedInvestorOnly: z.boolean(),
    jurisdictions: z.array(z.string()),

    // Metadata
    createdAt: z.string(),
    updatedAt: z.string(),
    isActive: z.boolean(),
});
export type RWAAsset = z.infer<typeof RWAAssetSchema>;

// Real Estate Specific Schema
export const RealEstateAssetSchema = RWAAssetSchema.extend({
    propertyDetails: z.object({
        propertyType: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'MIXED_USE']),
        location: z.object({
            address: z.string(),
            city: z.string(),
            state: z.string(),
            country: z.string(),
            zipCode: z.string(),
        }),
        size: z.object({
            totalArea: z.number(),
            rentableArea: z.number(),
            units: z.number().optional(),
        }),
        valuation: z.object({
            currentValue: z.string(),
            lastAppraisal: z.string(),
            capRate: z.number().optional(),
        }),
        occupancy: z.object({
            currentRate: z.number(),
            averageRate: z.number(),
            leaseExpiry: z.string().optional(),
        }),
    }),
});
export type RealEstateAsset = z.infer<typeof RealEstateAssetSchema>;

// Invoice Asset Schema
export const InvoiceAssetSchema = RWAAssetSchema.extend({
    invoiceDetails: z.object({
        invoiceNumber: z.string(),
        issuer: z.object({
            name: z.string(),
            creditRating: z.string(),
            industry: z.string(),
        }),
        debtor: z.object({
            name: z.string(),
            creditRating: z.string(),
            paymentHistory: z.string(),
        }),
        terms: z.object({
            originalAmount: z.string(),
            discountRate: z.number(),
            daysToMaturity: z.number(),
            paymentTerms: z.string(),
        }),
    }),
});
export type InvoiceAsset = z.infer<typeof InvoiceAssetSchema>;

// Carbon Credit Schema
export const CarbonCreditAssetSchema = RWAAssetSchema.extend({
    carbonDetails: z.object({
        projectType: z.enum(['FORESTRY', 'RENEWABLE_ENERGY', 'METHANE_CAPTURE', 'DIRECT_AIR_CAPTURE']),
        vintage: z.string(),
        methodology: z.string(),
        verifier: z.string(),
        location: z.object({
            country: z.string(),
            region: z.string(),
            coordinates: z.object({
                latitude: z.number(),
                longitude: z.number(),
            }).optional(),
        }),
        metrics: z.object({
            totalCredits: z.number(),
            availableCredits: z.number(),
            retiredCredits: z.number(),
            pricePerCredit: z.string(),
        }),
    }),
});
export type CarbonCreditAsset = z.infer<typeof CarbonCreditAssetSchema>;

// Asset Pool Schema (for protocol pools like Centrifuge)
export const AssetPoolSchema = z.object({
    id: z.string(),
    name: z.string(),
    protocol: z.string(),

    // Pool Details
    totalValueLocked: z.string(),
    availableCapacity: z.string(),
    minimumInvestment: z.string(),

    // Performance Metrics
    currentApy: z.string(),
    historicalApy: z.array(z.object({
        date: z.string(),
        apy: z.string(),
    })),

    // Risk Metrics
    seniorTranche: z.object({
        apy: z.string(),
        riskLevel: z.string(),
        allocation: z.string(),
    }).optional(),
    juniorTranche: z.object({
        apy: z.string(),
        riskLevel: z.string(),
        allocation: z.string(),
    }).optional(),

    // Assets in Pool
    assets: z.array(RWAAssetSchema),
    assetTypes: z.array(AssetTypeSchema),

    // Compliance
    kycRequired: z.boolean(),
    minimumCreditRating: z.string().optional(),
    jurisdictions: z.array(z.string()),

    // Metadata
    createdAt: z.string(),
    isActive: z.boolean(),
});
export type AssetPool = z.infer<typeof AssetPoolSchema>;

// Asset Discovery Request/Response
export const AssetDiscoveryRequestSchema = z.object({
    assetTypes: z.array(AssetTypeSchema).optional(),
    minYield: z.number().optional(),
    maxRisk: z.number().optional(),
    minLiquidity: z.number().optional(),
    jurisdictions: z.array(z.string()).optional(),
    minInvestment: z.string().optional(),
    maxInvestment: z.string().optional(),
});
export type AssetDiscoveryRequest = z.infer<typeof AssetDiscoveryRequestSchema>;

export const AssetDiscoveryResponseSchema = z.object({
    assets: z.array(RWAAssetSchema),
    pools: z.array(AssetPoolSchema),
    totalCount: z.number(),
    filters: AssetDiscoveryRequestSchema,
});
export type AssetDiscoveryResponse = z.infer<typeof AssetDiscoveryResponseSchema>;