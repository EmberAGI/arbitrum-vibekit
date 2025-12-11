// Compound V3 error handling
// Error names are whitelisted from the official Compound V3 Comet interface ABI
// https://docs.compound.finance/public/files/comet-interface-abi-98f438b.json

class CompoundError extends Error {
  public errorName: string;

  constructor(errorName: string) {
    super(errorName);
    this.name = 'CompoundError';
    this.errorName = errorName;

    // Fix prototype chain for proper instanceof checks
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, CompoundError.prototype);
    }
  }
}

// Valid Compound V3 error names from the Comet interface ABI
const VALID_COMPOUND_ERROR_NAMES = new Set([
  'Absurd',
  'AlreadyInitialized',
  'BadAmount',
  'BadAsset',
  'BadDecimals',
  'BadDiscount',
  'BadMinimum',
  'BadNonce',
  'BadPrice',
  'BadSignatory',
  'BorrowCFTooLarge',
  'BorrowTooSmall',
  'InsufficientReserves',
  'InvalidInt104',
  'InvalidInt256',
  'InvalidUInt104',
  'InvalidUInt128',
  'InvalidUInt64',
  'InvalidValueS',
  'InvalidValueV',
  'LiquidateCFTooLarge',
  'NegativeNumber',
  'NoSelfTransfer',
  'NotCollateralized',
  'NotForSale',
  'NotLiquidatable',
  'Paused',
  'SignatureExpired',
  'SupplyCapExceeded',
  'TimestampTooLarge',
  'TooManyAssets',
  'TooMuchSlippage',
  'TransferInFailed',
  'TransferOutFailed',
  'Unauthorized',
]);

// Standard JavaScript error names that should not be treated as Compound errors
const STANDARD_ERROR_NAMES = new Set([
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'EvalError',
  'URIError',
  'Error',
]);

function isValidCompoundError(errorName: string): boolean {
  return VALID_COMPOUND_ERROR_NAMES.has(errorName) && !STANDARD_ERROR_NAMES.has(errorName);
}

function extractErrorName(reason: string): string | null {
  if (!reason) {
    return null;
  }

  // Try to extract from "execution reverted: ErrorName" pattern
  const revertedMatch = reason.match(/execution reverted:?\s*(.+)/i);
  if (revertedMatch) {
    const errorName = revertedMatch[1]
      ?.trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\(\)$/, '');
    return errorName && isValidCompoundError(errorName) ? errorName : null;
  }

  // Try direct match
  const trimmed = reason.trim().replace(/\(\)$/, '');
  return trimmed && isValidCompoundError(trimmed) ? trimmed : null;
}

function extractErrorReason(error: unknown): string | null {
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error !== 'object' || error === null) {
    return null;
  }

  // For standard JS errors, extract nested reason/message
  if ('name' in error && typeof error.name === 'string' && STANDARD_ERROR_NAMES.has(error.name)) {
    const errorObj = error as Record<string, unknown>;
    return (
      (typeof errorObj['reason'] === 'string' && errorObj['reason']) ||
      (typeof errorObj['message'] === 'string' && errorObj['message']) ||
      (typeof errorObj['shortMessage'] === 'string' && errorObj['shortMessage']) ||
      null
    );
  }

  // Extract from various error object properties
  const errorObj = error as Record<string, unknown>;
  const data = errorObj['data'] as Record<string, unknown> | undefined;
  const candidates = [
    errorObj['errorName'],
    errorObj['reason'],
    errorObj['message'],
    errorObj['shortMessage'],
    data?.['errorName'],
    data?.['reason'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return null;
}

/**
 * Get a Compound error from a revert reason string
 * @returns CompoundError if error name can be extracted, null otherwise
 */
export function getCompoundError(reason: string): CompoundError | null {
  const errorName = extractErrorName(reason);
  return errorName ? new CompoundError(errorName) : null;
}

/**
 * Create a Compound error from an unknown error
 * @returns CompoundError with the extracted error name or a generic fallback
 */
export function createCompoundError(reason: string): CompoundError {
  const errorName = extractErrorName(reason) || 'Unknown Compound V3 error';
  return new CompoundError(errorName);
}

/**
 * Handle errors from Compound V3 contract interactions
 * @returns CompoundError if error name can be extracted, null otherwise
 */
export function handleCompoundError(error: unknown): CompoundError | null {
  const reason = extractErrorReason(error);
  return reason ? getCompoundError(reason) : null;
}
