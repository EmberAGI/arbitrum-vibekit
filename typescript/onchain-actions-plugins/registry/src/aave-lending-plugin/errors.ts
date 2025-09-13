// based on https://github.com/aave-dao/aave-v3-origin/blob/083bd38a137b42b5df04e22ad4c9e72454365d0d/src/contracts/protocol/libraries/helpers/Errors.sol

class AaveError extends Error {
  public description: string;
  public override message: string;

  constructor(code: string, name: string, description: string) {
    const message = name + ` (${code}): ` + description;
    super(message);
    this.name = 'AaveError';
    this.description = description;
    this.message = message;

    // Ensures proper prototype chain in transpiled JavaScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type AaveErrorData = {
  name: string;
  description: string;
};

export const AAVE_ERROR_CODES: Record<string, AaveErrorData> = {
  '1': {
    name: 'CALLER_NOT_POOL_ADMIN',
    description: 'The caller of the function is not a pool admin',
  },
  '2': {
    name: 'CALLER_NOT_EMERGENCY_ADMIN',
    description: 'The caller of the function is not an emergency admin',
  },
  '3': {
    name: 'CALLER_NOT_POOL_OR_EMERGENCY_ADMIN',
    description: 'The caller of the function is not a pool or emergency admin',
  },
  '4': {
    name: 'CALLER_NOT_RISK_OR_POOL_ADMIN',
    description: 'The caller of the function is not a risk or pool admin',
  },
  '5': {
    name: 'CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN',
    description: 'The caller of the function is not an asset listing or pool admin',
  },
  '6': {
    name: 'CALLER_NOT_BRIDGE',
    description: 'The caller of the function is not a bridge',
  },
  '7': {
    name: 'ADDRESSES_PROVIDER_NOT_REGISTERED',
    description: 'Pool addresses provider is not registered',
  },
  '8': {
    name: 'INVALID_ADDRESSES_PROVIDER_ID',
    description: 'Invalid id for the pool addresses provider',
  },
  '9': { name: 'NOT_CONTRACT', description: 'Address is not a contract' },
  '10': {
    name: 'CALLER_NOT_POOL_CONFIGURATOR',
    description: 'The caller of the function is not the pool configurator',
  },
  '11': {
    name: 'CALLER_NOT_ATOKEN',
    description: 'The caller of the function is not an AToken',
  },
  '12': {
    name: 'INVALID_ADDRESSES_PROVIDER',
    description: 'The address of the pool addresses provider is invalid',
  },
  '13': {
    name: 'INVALID_FLASHLOAN_EXECUTOR_RETURN',
    description: 'Invalid return value of the flashloan executor function',
  },
  '14': {
    name: 'RESERVE_ALREADY_ADDED',
    description: 'Reserve has already been added to reserve list',
  },
  '15': {
    name: 'NO_MORE_RESERVES_ALLOWED',
    description: 'Maximum amount of reserves in the pool reached',
  },
  '16': {
    name: 'EMODE_CATEGORY_RESERVED',
    description: 'Zero eMode category is reserved for volatile heterogeneous assets',
  },
  '17': {
    name: 'INVALID_EMODE_CATEGORY_ASSIGNMENT',
    description: 'Invalid eMode category assignment to asset',
  },
  '18': {
    name: 'RESERVE_LIQUIDITY_NOT_ZERO',
    description: 'The liquidity of the reserve needs to be 0',
  },
  '19': {
    name: 'FLASHLOAN_PREMIUM_INVALID',
    description: 'Invalid flashloan premium',
  },
  '20': {
    name: 'INVALID_RESERVE_PARAMS',
    description: 'Invalid risk parameters for the reserve',
  },
  '21': {
    name: 'INVALID_EMODE_CATEGORY_PARAMS',
    description: 'Invalid risk parameters for the eMode category',
  },
  '22': {
    name: 'BRIDGE_PROTOCOL_FEE_INVALID',
    description: 'Invalid bridge protocol fee',
  },
  '23': {
    name: 'CALLER_MUST_BE_POOL',
    description: 'The caller of this function must be a pool',
  },
  '24': { name: 'INVALID_MINT_AMOUNT', description: 'Invalid amount to mint' },
  '25': { name: 'INVALID_BURN_AMOUNT', description: 'Invalid amount to burn' },
  '26': {
    name: 'INVALID_AMOUNT',
    description: 'Amount must be greater than 0',
  },
  '27': {
    name: 'RESERVE_INACTIVE',
    description: 'Action requires an active reserve',
  },
  '28': {
    name: 'RESERVE_FROZEN',
    description: 'Action cannot be performed because the reserve is frozen',
  },
  '29': {
    name: 'RESERVE_PAUSED',
    description: 'Action cannot be performed because the reserve is paused',
  },
  '30': {
    name: 'BORROWING_NOT_ENABLED',
    description: 'Borrowing is not enabled',
  },
  '32': {
    name: 'NOT_ENOUGH_AVAILABLE_USER_BALANCE',
    description: 'User cannot withdraw more than the available balance',
  },
  '33': {
    name: 'INVALID_INTEREST_RATE_MODE_SELECTED',
    description: 'Invalid interest rate mode selected',
  },
  '34': {
    name: 'COLLATERAL_BALANCE_IS_ZERO',
    description: 'The collateral balance is 0',
  },
  '35': {
    name: 'HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD',
    description: 'Health factor is lesser than the liquidation threshold',
  },
  '36': {
    name: 'COLLATERAL_CANNOT_COVER_NEW_BORROW',
    description: 'There is not enough collateral to cover a new borrow',
  },
  '37': {
    name: 'COLLATERAL_SAME_AS_BORROWING_CURRENCY',
    description: 'Collateral is (mostly) the same currency that is being borrowed',
  },
  '39': {
    name: 'NO_DEBT_OF_SELECTED_TYPE',
    description: 'For repayment of a specific type of debt, the user needs to have debt that type',
  },
  '40': {
    name: 'NO_EXPLICIT_AMOUNT_TO_REPAY_ON_BEHALF',
    description: 'To repay on behalf of a user an explicit amount to repay is needed',
  },
  '42': {
    name: 'NO_OUTSTANDING_VARIABLE_DEBT',
    description: 'User does not have outstanding variable rate debt on this reserve',
  },
  '43': {
    name: 'UNDERLYING_BALANCE_ZERO',
    description: 'The underlying balance needs to be greater than 0',
  },
  '44': {
    name: 'INTEREST_RATE_REBALANCE_CONDITIONS_NOT_MET',
    description: 'Interest rate rebalance conditions were not met',
  },
  '45': {
    name: 'HEALTH_FACTOR_NOT_BELOW_THRESHOLD',
    description: 'Health factor is not below the threshold',
  },
  '46': {
    name: 'COLLATERAL_CANNOT_BE_LIQUIDATED',
    description: 'The collateral chosen cannot be liquidated',
  },
  '47': {
    name: 'SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER',
    description: 'User did not borrow the specified currency',
  },
  '49': {
    name: 'INCONSISTENT_FLASHLOAN_PARAMS',
    description: 'Inconsistent flashloan parameters',
  },
  '50': { name: 'BORROW_CAP_EXCEEDED', description: 'Borrow cap is exceeded' },
  '51': { name: 'SUPPLY_CAP_EXCEEDED', description: 'Supply cap is exceeded' },
  '52': {
    name: 'UNBACKED_MINT_CAP_EXCEEDED',
    description: 'Unbacked mint cap is exceeded',
  },
  '53': {
    name: 'DEBT_CEILING_EXCEEDED',
    description: 'Debt ceiling is exceeded',
  },
  '54': {
    name: 'UNDERLYING_CLAIMABLE_RIGHTS_NOT_ZERO',
    description: 'Claimable rights over underlying not zero (aToken supply or accruedToTreasury)',
  },
  '56': {
    name: 'VARIABLE_DEBT_SUPPLY_NOT_ZERO',
    description: 'Variable debt supply is not zero',
  },
  '57': { name: 'LTV_VALIDATION_FAILED', description: 'Ltv validation failed' },
  '58': {
    name: 'INCONSISTENT_EMODE_CATEGORY',
    description: 'Inconsistent eMode category',
  },
  '59': {
    name: 'PRICE_ORACLE_SENTINEL_CHECK_FAILED',
    description: 'Price oracle sentinel validation failed',
  },
  '60': {
    name: 'ASSET_NOT_BORROWABLE_IN_ISOLATION',
    description: 'Asset is not borrowable in isolation mode',
  },
  '61': {
    name: 'RESERVE_ALREADY_INITIALIZED',
    description: 'Reserve has already been initialized',
  },
  '62': {
    name: 'USER_IN_ISOLATION_MODE_OR_LTV_ZERO',
    description: 'User is in isolation mode or ltv is zero',
  },
  '63': {
    name: 'INVALID_LTV',
    description: 'Invalid ltv parameter for the reserve',
  },
  '64': {
    name: 'INVALID_LIQ_THRESHOLD',
    description: 'Invalid liquidity threshold parameter for the reserve',
  },
  '65': {
    name: 'INVALID_LIQ_BONUS',
    description: 'Invalid liquidity bonus parameter for the reserve',
  },
  '66': {
    name: 'INVALID_DECIMALS',
    description: 'Invalid decimals parameter of the underlying asset of the reserve',
  },
  '67': {
    name: 'INVALID_RESERVE_FACTOR',
    description: 'Invalid reserve factor parameter for the reserve',
  },
  '68': {
    name: 'INVALID_BORROW_CAP',
    description: 'Invalid borrow cap for the reserve',
  },
  '69': {
    name: 'INVALID_SUPPLY_CAP',
    description: 'Invalid supply cap for the reserve',
  },
  '70': {
    name: 'INVALID_LIQUIDATION_PROTOCOL_FEE',
    description: 'Invalid liquidation protocol fee for the reserve',
  },
  '71': {
    name: 'INVALID_EMODE_CATEGORY',
    description: 'Invalid eMode category for the reserve',
  },
  '72': {
    name: 'INVALID_UNBACKED_MINT_CAP',
    description: 'Invalid unbacked mint cap for the reserve',
  },
  '73': {
    name: 'INVALID_DEBT_CEILING',
    description: 'Invalid debt ceiling for the reserve',
  },
  '74': { name: 'INVALID_RESERVE_INDEX', description: 'Invalid reserve index' },
  '75': {
    name: 'ACL_ADMIN_CANNOT_BE_ZERO',
    description: 'ACL admin cannot be set to the zero address',
  },
  '76': {
    name: 'INCONSISTENT_PARAMS_LENGTH',
    description: 'Array parameters that should be equal length are not',
  },
  '77': {
    name: 'ZERO_ADDRESS_NOT_VALID',
    description: 'Zero address not valid',
  },
  '78': { name: 'INVALID_EXPIRATION', description: 'Invalid expiration' },
  '79': { name: 'INVALID_SIGNATURE', description: 'Invalid signature' },
  '80': {
    name: 'OPERATION_NOT_SUPPORTED',
    description: 'Operation not supported',
  },
  '81': {
    name: 'DEBT_CEILING_NOT_ZERO',
    description: 'Debt ceiling is not zero',
  },
  '82': { name: 'ASSET_NOT_LISTED', description: 'Asset is not listed' },
  '83': {
    name: 'INVALID_OPTIMAL_USAGE_RATIO',
    description: 'Invalid optimal usage ratio',
  },
  '85': {
    name: 'UNDERLYING_CANNOT_BE_RESCUED',
    description: 'The underlying asset cannot be rescued',
  },
  '86': {
    name: 'ADDRESSES_PROVIDER_ALREADY_ADDED',
    description: 'Reserve has already been added to reserve list',
  },
  '87': {
    name: 'POOL_ADDRESSES_DO_NOT_MATCH',
    description:
      'The token implementation pool address and the pool address provided by the initializing pool do not match',
  },
  '89': {
    name: 'SILOED_BORROWING_VIOLATION',
    description: 'User is trying to borrow multiple assets including a siloed one',
  },
  '90': {
    name: 'RESERVE_DEBT_NOT_ZERO',
    description: 'The total debt of the reserve needs to be 0',
  },
  '91': {
    name: 'FLASHLOAN_DISABLED',
    description: 'FlashLoaning for this asset is disabled',
  },
  '92': {
    name: 'INVALID_MAX_RATE',
    description: 'The expect maximum borrow rate is invalid',
  },
  '93': {
    name: 'WITHDRAW_TO_ATOKEN',
    description: 'Withdrawing to the aToken is not allowed',
  },
  '94': {
    name: 'SUPPLY_TO_ATOKEN',
    description: 'Supplying to the aToken is not allowed',
  },
  '95': {
    name: 'SLOPE_2_MUST_BE_GTE_SLOPE_1',
    description: 'Variable interest rate slope 2 can not be lower than slope 1',
  },
  '96': {
    name: 'CALLER_NOT_RISK_OR_POOL_OR_EMERGENCY_ADMIN',
    description: 'The caller of the function is not a risk, pool or emergency admin',
  },
  '97': {
    name: 'LIQUIDATION_GRACE_SENTINEL_CHECK_FAILED',
    description: 'Liquidation grace sentinel validation failed',
  },
  '98': {
    name: 'INVALID_GRACE_PERIOD',
    description: 'Grace period above a valid range',
  },
  '99': {
    name: 'INVALID_FREEZE_STATE',
    description: 'Reserve is already in the passed freeze state',
  },
  '100': {
    name: 'NOT_BORROWABLE_IN_EMODE',
    description: 'Asset not borrowable in eMode',
  },
};

export function getAaveError(code: string): AaveError | null {
  const err = AAVE_ERROR_CODES[code];
  if (err) {
    return new AaveError(code, err.name, err.description);
  }
  return null;
}
