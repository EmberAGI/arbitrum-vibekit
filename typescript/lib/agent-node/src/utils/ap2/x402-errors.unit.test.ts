import { describe, it, expect } from 'vitest';

import {
  extractFailureCode,
  buildFailureMetadata,
  formatFailureMessage,
  type FailureContext,
} from './x402-errors.js';
import {
  X402_STATUS_KEY,
  X402_ERROR_KEY,
  X402_FAILURE_STAGE_KEY,
  X402_RECEIPTS_KEY,
  type X402FailureStage,
} from '../../workflows/x402-types.js';

describe('extractFailureCode()', () => {
  describe('Priority 1: Facilitator response parsing', () => {
    it('should extract code from error.code field', () => {
      // Given: facilitator response with nested error.code structure
      const facilitatorResponse = {
        error: {
          code: 'EXPIRED_PAYMENT',
          message: 'Payment authorization submitted after its expiry',
        },
      };

      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, facilitatorResponse, 'verify');

      // Then: should return the code from error.code field
      expect(code).toBe('EXPIRED_PAYMENT');
    });

    it('should extract code from errorCode field', () => {
      // Given: facilitator response with top-level errorCode field
      const facilitatorResponse = {
        errorCode: 'INSUFFICIENT_PAYMENT',
        message: 'Payment amount is less than required',
      };

      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, facilitatorResponse, 'verify');

      // Then: should return the code from errorCode field
      expect(code).toBe('INSUFFICIENT_PAYMENT');
    });

    it('should prefer error.code over errorCode field', () => {
      // Given: facilitator response with both error.code and errorCode fields
      const facilitatorResponse = {
        error: {
          code: 'PREFERRED_CODE',
        },
        errorCode: 'FALLBACK_CODE',
      };

      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, facilitatorResponse, 'verify');

      // Then: should prefer error.code over errorCode
      expect(code).toBe('PREFERRED_CODE');
    });

    it('should handle null/undefined facilitatorResponse', () => {
      // Given: no facilitator response
      // When: extracting failure code with null response
      const codeNull = extractFailureCode(new Error('test'), 400, null, 'verify');
      // When: extracting failure code with undefined response
      const codeUndefined = extractFailureCode(new Error('test'), 400, undefined, 'verify');

      // Then: should fall back to HTTP status mapping
      expect(codeNull).toBe('INVALID_PAYLOAD');
      expect(codeUndefined).toBe('INVALID_PAYLOAD');
    });
  });

  describe('Priority 2: HTTP status mapping', () => {
    it('should map 410 to EXPIRED_PAYMENT', () => {
      // Given: HTTP 410 status (Gone)
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), 410, undefined, undefined);

      // Then: should return EXPIRED_PAYMENT
      expect(code).toBe('EXPIRED_PAYMENT');
    });

    it('should map 402 to INSUFFICIENT_PAYMENT', () => {
      // Given: HTTP 402 status (Payment Required)
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), 402, undefined, undefined);

      // Then: should return INSUFFICIENT_PAYMENT
      expect(code).toBe('INSUFFICIENT_PAYMENT');
    });

    it('should map unknown 4xx to CLIENT_ERROR', () => {
      // Given: HTTP 418 status (I'm a teapot - unmapped 4xx)
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), 418, undefined, undefined);

      // Then: should return generic CLIENT_ERROR
      expect(code).toBe('CLIENT_ERROR');
    });

    it('should map unknown 5xx to SERVER_ERROR', () => {
      // Given: HTTP 599 status (unmapped 5xx)
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), 599, undefined, undefined);

      // Then: should return generic SERVER_ERROR
      expect(code).toBe('SERVER_ERROR');
    });

    it('should skip HTTP mapping when status is undefined', () => {
      // Given: no HTTP status
      // When: extracting failure code with verify stage
      const code = extractFailureCode(new Error('test'), undefined, undefined, 'verify');

      // Then: should fall back to stage-based code
      expect(code).toBe('VERIFY_FAILED');
    });
  });

  describe('Priority 3: Stage-based fallback', () => {
    it('should map requirements-load to REQUIREMENTS_MISSING', () => {
      // Given: failure at requirements-load stage
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, undefined, 'requirements-load');

      // Then: should return REQUIREMENTS_MISSING
      expect(code).toBe('REQUIREMENTS_MISSING');
    });

    it('should map payload-parse to INVALID_PAYLOAD', () => {
      // Given: failure at payload-parse stage
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, undefined, 'payload-parse');

      // Then: should return INVALID_PAYLOAD
      expect(code).toBe('INVALID_PAYLOAD');
    });

    it('should map verify to VERIFY_FAILED', () => {
      // Given: failure at verify stage
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, undefined, 'verify');

      // Then: should return VERIFY_FAILED
      expect(code).toBe('VERIFY_FAILED');
    });

    it('should map settle to SETTLE_FAILED', () => {
      // Given: failure at settle stage
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, undefined, 'settle');

      // Then: should return SETTLE_FAILED
      expect(code).toBe('SETTLE_FAILED');
    });

    it('should map internal-error to INTERNAL_ERROR', () => {
      // Given: failure at internal-error stage
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, undefined, 'internal-error');

      // Then: should return INTERNAL_ERROR
      expect(code).toBe('INTERNAL_ERROR');
    });

    it('should return UNKNOWN_ERROR when stage is undefined', () => {
      // Given: no stage, no HTTP status, no facilitator response
      // When: extracting failure code
      const code = extractFailureCode(new Error('test'), undefined, undefined, undefined);

      // Then: should return ultimate fallback UNKNOWN_ERROR
      expect(code).toBe('UNKNOWN_ERROR');
    });
  });
});

describe('buildFailureMetadata()', () => {
  it('should build base metadata with required fields', () => {
    // Given: minimal failure context
    const stage: X402FailureStage = 'verify';
    const error = new Error('Payment verification failed');

    // When: building failure metadata
    const metadata = buildFailureMetadata(stage, error, {});

    // Then: should include all required fields
    expect(metadata[X402_STATUS_KEY]).toBe('payment-failed');
    expect(metadata[X402_ERROR_KEY]).toBe('VERIFY_FAILED');
    expect(metadata[X402_FAILURE_STAGE_KEY]).toBe('verify');
    expect(metadata[X402_RECEIPTS_KEY]).toHaveLength(1);
    expect(metadata[X402_RECEIPTS_KEY][0]).toMatchObject({
      success: false,
      errorReason: 'Payment verification failed',
    });
  });

  it('should include http_status when provided', () => {
    // Given: context with HTTP status
    const context: FailureContext = {
      httpStatus: 410,
    };

    // When: building failure metadata
    const metadata = buildFailureMetadata('verify', new Error('Expired'), context);

    // Then: should include http_status field
    expect(metadata.http_status).toBe(410);
    expect(metadata[X402_ERROR_KEY]).toBe('EXPIRED_PAYMENT');
  });

  it('should include facilitator_url when provided', () => {
    // Given: context with facilitator URL
    const context: FailureContext = {
      facilitatorUrl: 'https://x402.org/facilitator',
    };

    // When: building failure metadata
    const metadata = buildFailureMetadata('verify', new Error('Failed'), context);

    // Then: should include facilitator_url field
    expect(metadata.facilitator_url).toBe('https://x402.org/facilitator');
  });

  it('should include facilitator_response when provided', () => {
    // Given: context with facilitator response
    const facilitatorResponse = {
      error: {
        code: 'EXPIRED_PAYMENT',
        message: 'Payment expired',
      },
    };
    const context: FailureContext = {
      facilitatorResponse,
    };

    // When: building failure metadata
    const metadata = buildFailureMetadata('verify', new Error('Failed'), context);

    // Then: should include facilitator_response field
    expect(metadata.facilitator_response).toEqual(facilitatorResponse);
  });

  it('should include payment_requirements and payment_payload when provided', () => {
    // Given: context with payment requirements and payload
    const context: FailureContext = {
      paymentRequirements: {
        scheme: 'exact',
        network: 'base-sepolia',
        payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        amount: '100',
      },
      paymentPayload: {
        scheme: 'exact',
        network: 'base-sepolia',
        payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        amount: '100',
      },
    };

    // When: building failure metadata
    const metadata = buildFailureMetadata('verify', new Error('Failed'), context);

    // Then: should include both requirements and payload
    expect(metadata.payment_requirements).toEqual(context.paymentRequirements);
    expect(metadata.payment_payload).toEqual(context.paymentPayload);
  });

  it('should extract network from payment requirements into receipt', () => {
    // Given: context with payment requirements containing network
    const context: FailureContext = {
      paymentRequirements: {
        scheme: 'exact',
        network: 'base-sepolia',
        payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        amount: '100',
      },
    };

    // When: building failure metadata
    const metadata = buildFailureMetadata('verify', new Error('Failed'), context);

    // Then: receipt should include network field
    expect(metadata[X402_RECEIPTS_KEY][0].network).toBe('base-sepolia');
  });

  it('should handle undefined context gracefully', () => {
    // Given: no context provided
    // When: building failure metadata
    const metadata = buildFailureMetadata('internal-error', new Error('Unexpected error'));

    // Then: should build valid metadata with only required fields
    expect(metadata[X402_STATUS_KEY]).toBe('payment-failed');
    expect(metadata[X402_ERROR_KEY]).toBe('INTERNAL_ERROR');
    expect(metadata[X402_FAILURE_STAGE_KEY]).toBe('internal-error');
    expect(metadata[X402_RECEIPTS_KEY]).toHaveLength(1);
    expect(metadata.http_status).toBeUndefined();
    expect(metadata.facilitator_url).toBeUndefined();
  });

  it('should extract error reason from Error objects', () => {
    // Given: standard Error object
    const error = new Error('Connection timeout');

    // When: building failure metadata
    const metadata = buildFailureMetadata('verify', error, {});

    // Then: should extract message from Error object
    expect(metadata[X402_RECEIPTS_KEY][0].errorReason).toBe('Connection timeout');
  });

  it('should extract error reason from string errors', () => {
    // Given: string error
    const error = 'Invalid payment format';

    // When: building failure metadata
    const metadata = buildFailureMetadata('payload-parse', error, {});

    // Then: should use string as error reason
    expect(metadata[X402_RECEIPTS_KEY][0].errorReason).toBe('Invalid payment format');
  });

  it('should extract error reason from plain objects with message field', () => {
    // Given: plain object with message field
    const error = {
      message: 'Facilitator unavailable',
      code: 503,
    };

    // When: building failure metadata
    const metadata = buildFailureMetadata('verify', error, {});

    // Then: should extract message field
    expect(metadata[X402_RECEIPTS_KEY][0].errorReason).toBe('Facilitator unavailable');
  });
});

describe('formatFailureMessage()', () => {
  it('should format message with stage, reason, and code', () => {
    // Given: failure details
    const stage: X402FailureStage = 'verify';
    const reason = 'Payment authorization submitted after its expiry';
    const code = 'EXPIRED_PAYMENT';

    // When: formatting failure message
    const message = formatFailureMessage(stage, reason, code);

    // Then: should follow prescribed format
    expect(message).toBe(
      'x402 payment failed at verify: Payment authorization submitted after its expiry (code: EXPIRED_PAYMENT)',
    );
  });
});
