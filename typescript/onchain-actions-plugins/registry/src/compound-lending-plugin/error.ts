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

    // Fix prototype chain for proper instanceof checks
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, CompoundError.prototype);
    }
  }
}

// Helper functions

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

function extractErrorName(reason: string): string | null {
  if (!reason) {
    return null;
  }

  const revertedMatch = reason.match(/execution reverted:?\s*(.+)/i);
  if (revertedMatch) {
    const errorPart = revertedMatch[1]?.trim().replace(/^["']|["']$/g, '');
    const errorName = errorPart?.replace(/\(\)$/, '') || null;
    // Don't treat standard JS errors as Compound errors
    if (errorName && !STANDARD_ERROR_NAMES.has(errorName)) {
      return errorName;
    }
    return null;
  }

  const trimmed = reason.trim().replace(/\(\)$/, '');
  // Don't treat standard JS errors or very short strings as Compound errors
  if (trimmed && trimmed.length > 0 && trimmed.length < 100 && !STANDARD_ERROR_NAMES.has(trimmed)) {
    return trimmed;
  }
  return null;
}

function extractErrorReason(error: unknown): string | null {
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error !== 'object' || error === null) {
    return null;
  }

  // Skip standard JavaScript errors - they're not Compound contract errors
  if ('name' in error && typeof error.name === 'string') {
    if (STANDARD_ERROR_NAMES.has(error.name)) {
      // For standard JS errors, check if there's a reason/message that might contain Compound error info
      if ('reason' in error && typeof error.reason === 'string') {
        return error.reason;
      }
      if ('message' in error && typeof error.message === 'string') {
        return error.message;
      }
      if ('shortMessage' in error && typeof error.shortMessage === 'string') {
        return error.shortMessage;
      }
      // Don't return standard error names as they're not Compound errors
      return null;
    }
  }

  if ('errorName' in error && typeof error.errorName === 'string') {
    return error.errorName;
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
  if (!errorName || typeof errorName !== 'string') {
    return null;
  }
  try {
    return new CompoundError(errorName);
  } catch {
    return null;
  }
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
