/**
 * Polymarket Contract Addresses and ABIs
 *
 * Reference: POLYMARKET_INTEGRATION.md
 * All contracts are deployed on Polygon Mainnet (Chain ID: 137)
 */

/**
 * Polygon Mainnet Contract Addresses
 */
export const POLYGON_CONTRACTS = {
  /** Main trading exchange contract */
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',

  /** ERC-1155 Conditional Tokens Framework contract */
  CTF_CONTRACT: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',

  /** USDC.e (bridged USDC) - collateral token */
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',

  /** Neg Risk Adapter for special market types */
  NEG_RISK_ADAPTER: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
} as const;

/**
 * Minimal ABIs for contract interactions
 */
export const CONTRACT_ABIS = {
  /**
   * CTF Contract (ERC-1155)
   * Used for: Checking and setting approval for trading position tokens,
   * and redeeming winning positions after market resolution.
   *
   * redeemPositions signature:
   *   function redeemPositions(
   *     address collateralToken,    // USDC address
   *     bytes32 parentCollectionId, // bytes32(0) for root
   *     bytes32 conditionId,        // Market condition ID
   *     uint256[] indexSets         // [1] for YES, [2] for NO, [1, 2] for both
   *   )
   */
  CTF_CONTRACT: [
    'function isApprovedForAll(address owner, address operator) view returns (bool)',
    'function setApprovalForAll(address operator, bool approved)',
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  ],

  /**
   * USDC.e Contract (ERC-20)
   * Used for: Checking allowance and approving USDC spending
   */
  USDC: [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
  ],
} as const;
