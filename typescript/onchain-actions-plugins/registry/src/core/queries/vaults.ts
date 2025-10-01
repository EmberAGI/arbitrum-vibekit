import type {
  GetVaultsRequest,
  GetVaultsResponse,
  GetVaultPerformanceRequest,
  GetVaultPerformanceResponse,
  GetUserVaultPositionsRequest,
  GetUserVaultPositionsResponse,
  GetVaultStrategiesRequest,
  GetVaultStrategiesResponse,
  GetVaultBoostsRequest,
  GetVaultBoostsResponse,
} from '../schemas/vaults.js';

/**
 * Interface defining the queries that vault plugins must implement
 */
export interface VaultQueries {
  /**
   * Get available vaults for a given chain
   */
  getVaults: (params: GetVaultsRequest) => Promise<GetVaultsResponse>;

  /**
   * Get performance metrics for a specific vault
   */
  getVaultPerformance: (params: GetVaultPerformanceRequest) => Promise<GetVaultPerformanceResponse>;

  /**
   * Get user's vault positions across all vaults
   */
  getUserVaultPositions: (
    params: GetUserVaultPositionsRequest
  ) => Promise<GetUserVaultPositionsResponse>;

  /**
   * Get available vault strategies for a given chain
   */
  getVaultStrategies: (params: GetVaultStrategiesRequest) => Promise<GetVaultStrategiesResponse>;

  /**
   * Get available vault boosts (additional reward programs)
   */
  getVaultBoosts: (params: GetVaultBoostsRequest) => Promise<GetVaultBoostsResponse>;
}
