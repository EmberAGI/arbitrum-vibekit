import { z } from 'zod';

// Centrifuge SDK Configuration
export const CentrifugeConfigSchema = z.object({
    environment: z.enum(['mainnet', 'demo', 'dev']).default('mainnet'),
    rpcUrls: z.record(z.string(), z.string()).optional(),
    indexerUrl: z.string().optional(),
    ipfsUrl: z.string().optional(),
});

export type CentrifugeConfig = z.infer<typeof CentrifugeConfigSchema>;

// Pool Discovery Input Schema
export const PoolDiscoveryInputSchema = z.object({
    assetTypes: z.array(z.string()).optional(),
    minYield: z.number().optional(),
    maxRisk: z.number().optional(),
    minLiquidity: z.number().optional(),
    networks: z.array(z.string()).optional(),
    limit: z.number().min(1).max(50).default(20),
});

export type PoolDiscoveryInput = z.infer<typeof PoolDiscoveryInputSchema>;

// Pool Information Schema
export const PoolInfoSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    assetType: z.string(),
    currentYield: z.string(),
    riskScore: z.number(),
    liquidityScore: z.number(),
    totalValueLocked: z.string(),
    minimumInvestment: z.string(),
    activeNetworks: z.array(z.string()),
    tranches: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        apy: z.string(),
        riskLevel: z.string(),
    })),
    vaults: z.array(z.object({
        network: z.string(),
        currency: z.string(),
        address: z.string(),
        isActive: z.boolean(),
    })),
    metadata: z.object({
        website: z.string().optional(),
        documentation: z.string().optional(),
        legal: z.string().optional(),
    }).optional(),
});

export type PoolInfo = z.infer<typeof PoolInfoSchema>;

// Investment Status Schema
export const InvestmentStatusSchema = z.object({
    investorAddress: z.string(),
    poolId: z.string(),
    trancheId: z.string(),
    network: z.string(),
    currency: z.string(),
    totalInvested: z.string(),
    currentValue: z.string(),
    pendingOrders: z.array(z.object({
        type: z.enum(['invest', 'redeem']),
        amount: z.string(),
        status: z.string(),
        timestamp: z.string(),
    })),
    claimableTokens: z.string(),
    lastUpdated: z.string(),
});

export type InvestmentStatus = z.infer<typeof InvestmentStatusSchema>;

// Error Response Schema
export const ErrorResponseSchema = z.object({
    error: z.string(),
    code: z.string().optional(),
    details: z.string().optional(),
    timestamp: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Pool Analysis Input Schema
export const PoolAnalysisInputSchema = z.object({
    poolId: z.string().regex(/^[0-9]+$/, 'Pool ID must be a valid number'),
    includeRiskMetrics: z.boolean().default(true),
    includeHistoricalData: z.boolean().default(false),
    includeTrancheDetails: z.boolean().default(true),
});

export type PoolAnalysisInput = z.infer<typeof PoolAnalysisInputSchema>;

// Investment Order Input Schema
export const InvestmentOrderInputSchema = z.object({
    investorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format'),
    poolId: z.string().regex(/^[0-9]+$/, 'Pool ID must be a valid number'),
    trancheType: z.enum(['Senior', 'Junior']),
    amount: z.string().regex(/^[0-9]+(\.[0-9]{1,2})?$/, 'Amount must be a valid number with max 2 decimal places'),
    network: z.enum(['arbitrum', 'ethereum']).default('arbitrum'),
    slippageTolerance: z.number().min(0).max(5).default(1),
    skipValidation: z.boolean().default(false),
});

export type InvestmentOrderInput = z.infer<typeof InvestmentOrderInputSchema>;

// Detailed Pool Analysis Schema
export const DetailedPoolAnalysisSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    assetType: z.string(),
    currentYield: z.string(),
    riskScore: z.number(),
    liquidityScore: z.number(),
    totalValueLocked: z.string(),
    minimumInvestment: z.string(),
    activeNetworks: z.array(z.string()),
    tranches: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        apy: z.string(),
        riskLevel: z.string(),
        totalInvested: z.string(),
        maxCapacity: z.string(),
        currentUtilization: z.string(),
    })),
    vaults: z.array(z.object({
        network: z.string(),
        currency: z.string(),
        address: z.string(),
        isActive: z.boolean(),
        totalLiquidity: z.string(),
        utilizationRate: z.string(),
    })),
    riskMetrics: z.object({
        volatilityIndex: z.string(),
        creditScore: z.string(),
        diversificationScore: z.string(),
        geographicSpread: z.string(),
        assetQuality: z.string(),
        defaultHistory: z.string(),
        recoveryRate: z.string(),
    }).optional(),
    historicalData: z.record(z.string(), z.object({
        yield: z.string(),
        tvl: z.string(),
        investors: z.number(),
        transactions: z.number(),
    })).optional(),
    metadata: z.object({
        website: z.string(),
        documentation: z.string(),
        legal: z.string(),
    }),
});

export type DetailedPoolAnalysis = z.infer<typeof DetailedPoolAnalysisSchema>;

// Investment Order Schema
export const InvestmentOrderSchema = z.object({
    orderId: z.string(),
    investorAddress: z.string(),
    poolId: z.string(),
    poolName: z.string(),
    trancheType: z.string(),
    amount: z.string(),
    network: z.string(),
    slippageTolerance: z.number(),
    status: z.string(),
    estimatedGas: z.string(),
    estimatedExecutionTime: z.string(),
    submittedAt: z.string(),
    transactionHash: z.string().optional(),
});

export type InvestmentOrder = z.infer<typeof InvestmentOrderSchema>;
