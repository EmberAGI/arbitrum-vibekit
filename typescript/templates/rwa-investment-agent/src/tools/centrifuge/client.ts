import { z } from 'zod';

// Centrifuge API response schemas
export const CentrifugePoolSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    assetClass: z.string(),
    currency: z.string(),
    totalValue: z.string(),
    availableForInvestment: z.string(),
    minInvestment: z.string(),
    maxInvestment: z.string(),
    expectedYield: z.number(),
    riskScore: z.number(),
    maturityDate: z.string().optional(),
    poolStatus: z.enum(['OPEN', 'CLOSED', 'FUNDED']),
    tinRatio: z.number().optional(),
    dropRatio: z.number().optional(),
});

export const CentrifugeAssetSchema = z.object({
    id: z.string(),
    poolId: z.string(),
    assetType: z.string(),
    description: z.string(),
    value: z.string(),
    status: z.enum(['ACTIVE', 'LIQUIDATED', 'MATURED']),
    riskRating: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    yield: z.number(),
    maturityDate: z.string().optional(),
});

export type CentrifugePool = z.infer<typeof CentrifugePoolSchema>;
export type CentrifugeAsset = z.infer<typeof CentrifugeAssetSchema>;

export class CentrifugeClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl = 'https://api.centrifuge.io') {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    async getPools(): Promise<CentrifugePool[]> {
        try {
            console.log('🔍 [Centrifuge] Fetching available pools...');

            // For MVP, return realistic mock data that simulates real Centrifuge pools
            // In production, this would make actual API calls to Centrifuge
            const mockPools: CentrifugePool[] = [
                {
                    id: 'pool-001',
                    name: 'Berlin Commercial Real Estate',
                    description: 'Tokenized commercial property in Berlin, Germany',
                    assetClass: 'REAL_ESTATE',
                    currency: 'USDC',
                    totalValue: '2500000',
                    availableForInvestment: '500000',
                    minInvestment: '1000',
                    maxInvestment: '100000',
                    expectedYield: 8.5,
                    riskScore: 45,
                    maturityDate: '2026-12-31',
                    poolStatus: 'OPEN',
                    tinRatio: 0.7,
                    dropRatio: 0.3,
                },
                {
                    id: 'pool-002',
                    name: 'Tesla Supply Chain Invoices',
                    description: 'Invoice financing for Tesla suppliers',
                    assetClass: 'INVOICES',
                    currency: 'USDC',
                    totalValue: '1500000',
                    availableForInvestment: '300000',
                    minInvestment: '500',
                    maxInvestment: '50000',
                    expectedYield: 12.0,
                    riskScore: 35,
                    maturityDate: '2025-06-30',
                    poolStatus: 'OPEN',
                },
                {
                    id: 'pool-003',
                    name: 'Amazon Reforestation Credits',
                    description: 'Carbon credit tokens from Amazon rainforest projects',
                    assetClass: 'CARBON_CREDITS',
                    currency: 'USDC',
                    totalValue: '800000',
                    availableForInvestment: '200000',
                    minInvestment: '100',
                    maxInvestment: '25000',
                    expectedYield: 6.0,
                    riskScore: 65,
                    poolStatus: 'OPEN',
                },
                {
                    id: 'pool-004',
                    name: 'European Infrastructure Fund',
                    description: 'Public-private partnership infrastructure projects',
                    assetClass: 'INFRASTRUCTURE',
                    currency: 'USDC',
                    totalValue: '5000000',
                    availableForInvestment: '1000000',
                    minInvestment: '5000',
                    maxInvestment: '200000',
                    expectedYield: 9.5,
                    riskScore: 55,
                    maturityDate: '2027-12-31',
                    poolStatus: 'OPEN',
                },
            ];

            console.log(`✅ [Centrifuge] Found ${mockPools.length} pools`);
            return mockPools;
        } catch (error) {
            console.error('❌ [Centrifuge] Error fetching pools:', error);
            throw new Error(`Failed to fetch Centrifuge pools: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getPoolAssets(poolId: string): Promise<CentrifugeAsset[]> {
        try {
            console.log(`🔍 [Centrifuge] Fetching assets for pool ${poolId}...`);

            // Mock assets for the specific pool
            const mockAssets: Record<string, CentrifugeAsset[]> = {
                'pool-001': [
                    {
                        id: 'asset-001-1',
                        poolId: 'pool-001',
                        assetType: 'COMMERCIAL_PROPERTY',
                        description: 'Office building in Berlin Mitte',
                        value: '1200000',
                        status: 'ACTIVE',
                        riskRating: 'MEDIUM',
                        yield: 8.5,
                        maturityDate: '2026-12-31',
                    },
                    {
                        id: 'asset-001-2',
                        poolId: 'pool-001',
                        assetType: 'COMMERCIAL_PROPERTY',
                        description: 'Retail space in Berlin Kreuzberg',
                        value: '1300000',
                        status: 'ACTIVE',
                        riskRating: 'MEDIUM',
                        yield: 8.5,
                        maturityDate: '2026-12-31',
                    },
                ],
                'pool-002': [
                    {
                        id: 'asset-002-1',
                        poolId: 'pool-002',
                        assetType: 'SUPPLY_CHAIN_INVOICE',
                        description: 'Tesla supplier invoice - Electronics components',
                        value: '750000',
                        status: 'ACTIVE',
                        riskRating: 'LOW',
                        yield: 12.0,
                        maturityDate: '2025-06-30',
                    },
                    {
                        id: 'asset-002-2',
                        poolId: 'pool-002',
                        assetType: 'SUPPLY_CHAIN_INVOICE',
                        description: 'Tesla supplier invoice - Battery materials',
                        value: '750000',
                        status: 'ACTIVE',
                        riskRating: 'LOW',
                        yield: 12.0,
                        maturityDate: '2025-06-30',
                    },
                ],
                'pool-003': [
                    {
                        id: 'asset-003-1',
                        poolId: 'pool-003',
                        assetType: 'CARBON_CREDIT',
                        description: 'Amazon rainforest preservation - 1000 tons CO2',
                        value: '400000',
                        status: 'ACTIVE',
                        riskRating: 'HIGH',
                        yield: 6.0,
                    },
                    {
                        id: 'asset-003-2',
                        poolId: 'pool-003',
                        assetType: 'CARBON_CREDIT',
                        description: 'Amazon reforestation project - 1000 tons CO2',
                        value: '400000',
                        status: 'ACTIVE',
                        riskRating: 'HIGH',
                        yield: 6.0,
                    },
                ],
                'pool-004': [
                    {
                        id: 'asset-004-1',
                        poolId: 'pool-004',
                        assetType: 'INFRASTRUCTURE_PROJECT',
                        description: 'High-speed rail connection - Paris to Berlin',
                        value: '2500000',
                        status: 'ACTIVE',
                        riskRating: 'MEDIUM',
                        yield: 9.5,
                        maturityDate: '2027-12-31',
                    },
                    {
                        id: 'asset-004-2',
                        poolId: 'pool-004',
                        assetType: 'INFRASTRUCTURE_PROJECT',
                        description: 'Renewable energy grid - European Union',
                        value: '2500000',
                        status: 'ACTIVE',
                        riskRating: 'MEDIUM',
                        yield: 9.5,
                        maturityDate: '2027-12-31',
                    },
                ],
            };

            const assets = mockAssets[poolId] || [];
            console.log(`✅ [Centrifuge] Found ${assets.length} assets for pool ${poolId}`);
            return assets;
        } catch (error) {
            console.error(`❌ [Centrifuge] Error fetching assets for pool ${poolId}:`, error);
            throw new Error(`Failed to fetch pool assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getPoolDetails(poolId: string): Promise<CentrifugePool | null> {
        try {
            const pools = await this.getPools();
            return pools.find(pool => pool.id === poolId) || null;
        } catch (error) {
            console.error(`❌ [Centrifuge] Error fetching pool details for ${poolId}:`, error);
            return null;
        }
    }

    async searchPools(filters: {
        assetClass?: string;
        minYield?: number;
        maxRisk?: number;
        minInvestment?: string;
        maxInvestment?: string;
    }): Promise<CentrifugePool[]> {
        try {
            console.log('🔍 [Centrifuge] Searching pools with filters:', filters);

            const allPools = await this.getPools();
            let filteredPools = allPools;

            if (filters.assetClass) {
                filteredPools = filteredPools.filter(pool =>
                    pool.assetClass.toLowerCase() === filters.assetClass!.toLowerCase()
                );
            }

            if (filters.minYield) {
                filteredPools = filteredPools.filter(pool =>
                    pool.expectedYield >= filters.minYield!
                );
            }

            if (filters.maxRisk) {
                filteredPools = filteredPools.filter(pool =>
                    pool.riskScore <= filters.maxRisk!
                );
            }

            if (filters.minInvestment) {
                filteredPools = filteredPools.filter(pool =>
                    parseFloat(pool.minInvestment) <= parseFloat(filters.minInvestment!)
                );
            }

            if (filters.maxInvestment) {
                filteredPools = filteredPools.filter(pool =>
                    parseFloat(pool.maxInvestment) >= parseFloat(filters.maxInvestment!)
                );
            }

            console.log(`✅ [Centrifuge] Found ${filteredPools.length} pools matching filters`);
            return filteredPools;
        } catch (error) {
            console.error('❌ [Centrifuge] Error searching pools:', error);
            throw new Error(`Failed to search pools: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
