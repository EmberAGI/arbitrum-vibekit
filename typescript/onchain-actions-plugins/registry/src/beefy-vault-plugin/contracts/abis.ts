// Contract ABIs and constants for Beefy vault interactions

// Standard ERC20 ABI for token operations
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function totalSupply() view returns (uint256)',
] as const;

// Beefy Vault ABI based on actual BeefyVaultV7.sol contract
export const BEEFY_VAULT_ABI = [
  // View functions (matching exact contract signatures)
  'function want() public view returns (address)',
  'function balance() public view returns (uint)',
  'function available() public view returns (uint256)',
  'function totalSupply() public view returns (uint256)',
  'function getPricePerFullShare() public view returns (uint256)',
  'function strategy() public view returns (address)',
  'function balanceOf(address account) view returns (uint256)',

  // Write functions (matching exact contract signatures)
  'function deposit(uint _amount) public',
  'function depositAll() external',
  'function withdraw(uint256 _shares) public',
  'function withdrawAll() external',
  'function earn() public',

  // Strategy management (owner only)
  'function proposeStrat(address _implementation) public',
  'function upgradeStrat() public',
  'function inCaseTokensGetStuck(address _token) external',

  // State variables (public getters)
  'function stratCandidate() public view returns (address implementation, uint proposedTime)',
  'function approvalDelay() public view returns (uint256)',

  // ERC20 inherited functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',

  // Events (matching contract events)
  'event NewStratCandidate(address implementation)',
  'event UpgradeStrat(address implementation)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
] as const;

// Constants
export const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Gas limits for different operations
export const GAS_LIMITS = {
  ERC20_APPROVE: 60000,
  VAULT_DEPOSIT: 200000,
  VAULT_DEPOSIT_ALL: 220000,
  VAULT_WITHDRAW: 180000,
  VAULT_WITHDRAW_ALL: 200000,
} as const;
