import { Centrifuge } from '@centrifuge/sdk';
import type { CentrifugeConfig } from '../types/centrifuge.js';

export class CentrifugeSDKClient {
    private centrifuge!: Centrifuge;
    private config: CentrifugeConfig;

    constructor(config: CentrifugeConfig = {
        environment: 'mainnet',
        rpcUrls: { '1': 'http://127.0.0.1:8545' } // Local Anvil fork
    }) {
        this.config = config;
        this.initializeSDK();
    }

    private initializeSDK() {
        try {
            // console.log('🔧 [CentrifugeSDK] Initializing with config:', this.config);

            // Map our config to the actual SDK config
            const sdkConfig: any = {
                environment: this.config.environment === 'demo' ? 'testnet' : this.config.environment,
            };

            // Use local fork RPC URL if available
            if (this.config.rpcUrls && this.config.rpcUrls['1']) {
                // console.log('🔗 [CentrifugeSDK] Using local RPC:', this.config.rpcUrls['1']);
                sdkConfig.rpcUrls = this.config.rpcUrls;
            } else if (this.config.rpcUrls) {
                sdkConfig.rpcUrls = this.config.rpcUrls;
            }

            if (this.config.indexerUrl) {
                sdkConfig.indexerUrl = this.config.indexerUrl;
            }
            if (this.config.ipfsUrl) {
                sdkConfig.ipfsUrl = this.config.ipfsUrl;
            }

            this.centrifuge = new Centrifuge(sdkConfig);

            // console.log('✅ [CentrifugeSDK] Successfully initialized');
        } catch (error) {
            // console.error('❌ [CentrifugeSDK] Failed to initialize:', error);
            throw new Error(`Failed to initialize Centrifuge SDK: ${error}`);
        }
    }

    /**
     * Get all available pools
     */
    async getAllPools() {
        try {
            // console.log('🔍 [CentrifugeSDK] Fetching all pools...');
            const pools = await this.centrifuge.pools();
            // console.log(`✅ [CentrifugeSDK] Found pools`);
            return pools;
        } catch (error) {
            // console.error('❌ [CentrifugeSDK] Failed to fetch pools from SDK:', error);
            throw new Error(`Failed to fetch pools: ${error.message}`);
        }
    }

    /**
     * Get a specific pool by ID
     */
    async getPool(poolId: string) {
        try {
            // console.log(`🔍 [CentrifugeSDK] Fetching pool ${poolId}...`);
            const pool = await this.centrifuge.pool(poolId as any);
            // console.log(`✅ [CentrifugeSDK] Successfully fetched pool ${poolId}`);
            return pool;
        } catch (error) {
            console.error(`❌ [CentrifugeSDK] Failed to fetch pool ${poolId}:`, error);
            throw new Error(`Failed to fetch pool ${poolId}: ${error}`);
        }
    }

    /**
     * Get active networks for a pool
     */
    async getPoolActiveNetworks(poolId: string) {
        try {
            // console.log(`🔍 [CentrifugeSDK] Fetching active networks for pool ${poolId}...`);
            const pool = await this.centrifuge.pool(poolId as any);
            const networks = await pool.activeNetworks();
            // console.log(`✅ [CentrifugeSDK] Found active networks for pool ${poolId}`);
            return networks;
        } catch (error) {
            console.error(`❌ [CentrifugeSDK] Failed to fetch active networks for pool ${poolId}:`, error);
            throw new Error(`Failed to fetch active networks for pool ${poolId}: ${error}`);
        }
    }

    /**
     * Get vaults for a specific network and tranche
     */
    async getVaults(poolId: string, networkId: number, trancheId: string) {
        try {
            // console.log(`🔍 [CentrifugeSDK] Fetching vaults for pool ${poolId}, network ${networkId}, tranche ${trancheId}...`);
            const pool = await this.centrifuge.pool(poolId as any);
            const network = await pool.network(networkId);
            const vaults = await network.vaults(trancheId as any);
            // console.log(`✅ [CentrifugeSDK] Found vaults`);
            return vaults;
        } catch (error) {
            console.error(`❌ [CentrifugeSDK] Failed to fetch vaults:`, error);
            throw new Error(`Failed to fetch vaults: ${error}`);
        }
    }

    /**
     * Get investment status for an investor
     */
    async getInvestmentStatus(vault: any, investorAddress: string) {
        try {
            // console.log(`🔍 [CentrifugeSDK] Fetching investment status for ${investorAddress}...`);
            const investment = await vault.investment(investorAddress);
            // console.log(`✅ [CentrifugeSDK] Successfully fetched investment status`);
            return investment;
        } catch (error) {
            console.error(`❌ [CentrifugeSDK] Failed to fetch investment status:`, error);
            throw new Error(`Failed to fetch investment status: ${error}`);
        }
    }

    /**
     * Set signer for transactions
     */
    setSigner(signer: any) {
        try {
            // console.log('🔧 [CentrifugeSDK] Setting signer...');
            this.centrifuge.setSigner(signer);
            // console.log('✅ [CentrifugeSDK] Signer set successfully');
        } catch (error) {
            console.error('❌ [CentrifugeSDK] Failed to set signer:', error);
            throw new Error(`Failed to set signer: ${error}`);
        }
    }

    /**
     * Get the underlying Centrifuge instance
     */
    getInstance() {
        return this.centrifuge;
    }
}
