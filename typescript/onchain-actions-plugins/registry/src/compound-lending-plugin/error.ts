// Compound V3 error handling
// Compound V3 uses Solidity custom errors which are automatically extracted from contract reverts

class CompoundError extends Error {
  public override message: string;
  public errorName: string;

  constructor(errorName: string) {
    super(errorName);
    this.name = 'CompoundError';
    this.errorName = errorName;
    this.message = errorName;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Helper functions

function extractErrorName(reason: string): string | null {
  if (!reason) {
    return null;
  }

  const revertedMatch = reason.match(/execution reverted:?\s*(.+)/i);
  if (revertedMatch) {
    const errorPart = revertedMatch[1]?.trim().replace(/^["']|["']$/g, '');
    return errorPart?.replace(/\(\)$/, '') || null;
  }

  const trimmed = reason.trim().replace(/\(\)$/, '');
  return trimmed && trimmed.length > 0 && trimmed.length < 100 ? trimmed : null;
}

function extractErrorReason(error: unknown): string | null {
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error !== 'object' || error === null) {
    return null;
  }

  if ('errorName' in error && typeof error.errorName === 'string') {
    return error.errorName;
  }

  if ('name' in error && typeof error.name === 'string') {
    return error.name;
  }
  if ('reason' in error && typeof error.reason === 'string') {
    return error.reason;
  }

  if ('message' in error && typeof error.message === 'string') {
    return error.message;
  }

  if ('shortMessage' in error && typeof error.shortMessage === 'string') {
    return error.shortMessage;
  }

  if (
    'data' in error &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'errorName' in error.data &&
    typeof error.data.errorName === 'string'
  ) {
    return error.data.errorName;
  }

  if (
    'data' in error &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'reason' in error.data &&
    typeof error.data.reason === 'string'
  ) {
    return error.data.reason;
  }

  return null;
}

// Public API

/**
 * Get a Compound error from a revert reason string
 * @param reason - The revert reason from the transaction
 * @returns CompoundError if error name can be extracted, null otherwise
 */
export function getCompoundError(reason: string): CompoundError | null {
  const errorName = extractErrorName(reason);
  return errorName ? new CompoundError(errorName) : null;
}

/**
 * Create a Compound error from an unknown error
 * @param reason - The revert reason from the transaction
 * @returns CompoundError with the extracted error name or original reason
 */
export function createCompoundError(reason: string): CompoundError {
  const errorName = extractErrorName(reason) || reason || 'Unknown Compound V3 error';
  return new CompoundError(errorName);
}

/**
 * Handle errors from Compound V3 contract interactions
 * @param error - The error object from a contract call that reverted
 * @returns CompoundError if error name can be extracted, null otherwise
 */
export function handleCompoundError(error: unknown): CompoundError | null {
  const reason = extractErrorReason(error);
  return reason ? getCompoundError(reason) : null;
}
