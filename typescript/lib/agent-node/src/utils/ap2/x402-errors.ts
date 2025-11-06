import type { PaymentPayload, PaymentRequirements } from 'x402/types';

import {
  X402_STATUS_KEY,
  X402_ERROR_KEY,
  X402_FAILURE_STAGE_KEY,
  X402_RECEIPTS_KEY,
  type X402FailureStage,
  type X402FailureMetadata,
  type X402FailureReceipt,
} from '../../workflow/x402-types.js';

/**
 * Context information for building failure metadata
 */
export interface FailureContext {
  paymentRequirements?: PaymentRequirements;
  paymentPayload?: PaymentPayload;
  facilitatorUrl?: string;
  httpStatus?: number;
  facilitatorResponse?: unknown;
}

/**
 * Extracts a canonical failure code from error details
 *
 * Priority order:
 * 1. Facilitator response error code (if present)
 * 2. HTTP status code mapping
 * 3. Stage-based fallback
 *
 * @param _error - The caught error object (reserved for future use)
 * @param httpStatus - HTTP status code from facilitator (if available)
 * @param facilitatorResponse - Response body from facilitator (if available)
 * @param stage - The failure stage for fallback codes
 * @returns Canonical error code string
 */
export function extractFailureCode(
  _error: unknown,
  httpStatus?: number,
  facilitatorResponse?: unknown,
  stage?: X402FailureStage,
): string {
  // Try to extract error code from facilitator response
  if (facilitatorResponse && typeof facilitatorResponse === 'object') {
    const responseObj = facilitatorResponse as Record<string, unknown>;
    if (responseObj['error'] && typeof responseObj['error'] === 'object') {
      const errorObj = responseObj['error'] as Record<string, unknown>;
      if (typeof errorObj['code'] === 'string') {
        return errorObj['code'];
      }
    }
    if (typeof responseObj['errorCode'] === 'string') {
      return responseObj['errorCode'];
    }
  }

  // Map HTTP status codes to canonical failure codes
  if (httpStatus) {
    switch (httpStatus) {
      case 400:
        return 'INVALID_PAYLOAD';
      case 401:
        return 'UNAUTHORIZED';
      case 402:
        return 'INSUFFICIENT_PAYMENT';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 408:
        return 'TIMEOUT';
      case 410:
        return 'EXPIRED_PAYMENT';
      case 500:
        return 'FACILITATOR_ERROR';
      case 502:
      case 503:
      case 504:
        return 'FACILITATOR_UNAVAILABLE';
      default:
        if (httpStatus >= 400 && httpStatus < 500) {
          return 'CLIENT_ERROR';
        }
        if (httpStatus >= 500) {
          return 'SERVER_ERROR';
        }
    }
  }

  // Fall back to stage-based codes
  if (stage) {
    switch (stage) {
      case 'requirements-load':
        return 'REQUIREMENTS_MISSING';
      case 'payload-parse':
        return 'INVALID_PAYLOAD';
      case 'verify':
        return 'VERIFY_FAILED';
      case 'settle':
        return 'SETTLE_FAILED';
      case 'internal-error':
        return 'INTERNAL_ERROR';
    }
  }

  // Ultimate fallback
  return 'UNKNOWN_ERROR';
}

/**
 * Extracts a human-readable error reason from an error object
 *
 * @param error - The caught error object
 * @returns Human-readable error message
 */
function extractErrorReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj['message'] === 'string') {
      return errorObj['message'];
    }
    if (typeof errorObj['reason'] === 'string') {
      return errorObj['reason'];
    }
  }
  return 'Unknown error occurred';
}

/**
 * Builds complete failure metadata following x402 spec
 *
 * @param stage - The stage at which payment failed
 * @param error - The caught error object
 * @param context - Additional context (requirements, payload, facilitator details)
 * @returns Complete X402FailureMetadata object
 */
export function buildFailureMetadata(
  stage: X402FailureStage,
  error: unknown,
  context: FailureContext = {},
): X402FailureMetadata {
  const errorReason = extractErrorReason(error);
  const failureCode = extractFailureCode(
    error,
    context.httpStatus,
    context.facilitatorResponse,
    stage,
  );

  // Build failure receipt following x402 spec
  const receipt: X402FailureReceipt = {
    success: false,
    errorReason,
  };

  // Add network if available from payment requirements
  if (context.paymentRequirements?.network) {
    receipt.network = context.paymentRequirements.network;
  }

  // Build complete metadata object
  const metadata: X402FailureMetadata = {
    [X402_STATUS_KEY]: 'payment-failed',
    [X402_ERROR_KEY]: failureCode,
    [X402_FAILURE_STAGE_KEY]: stage,
    [X402_RECEIPTS_KEY]: [receipt],
  };

  // Add optional fields when available
  if (context.httpStatus !== undefined) {
    metadata.http_status = context.httpStatus;
  }
  if (context.facilitatorUrl) {
    metadata.facilitator_url = context.facilitatorUrl;
  }
  if (context.facilitatorResponse !== undefined) {
    metadata.facilitator_response = context.facilitatorResponse;
  }
  if (context.paymentRequirements) {
    metadata.payment_requirements = context.paymentRequirements;
  }
  if (context.paymentPayload) {
    metadata.payment_payload = context.paymentPayload;
  }

  return metadata;
}

/**
 * Formats a human-readable failure message
 *
 * Format: "x402 payment failed at {stage}: {reason} (code: {code})"
 *
 * @param stage - The failure stage
 * @param reason - Human-readable reason
 * @param code - Failure code
 * @returns Formatted message string
 */
export function formatFailureMessage(
  stage: X402FailureStage,
  reason: string,
  code: string,
): string {
  return `x402 payment failed at ${stage}: ${reason} (code: ${code})`;
}
