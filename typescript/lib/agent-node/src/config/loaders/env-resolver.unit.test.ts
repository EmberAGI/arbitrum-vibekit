/**
 * Unit tests for env-resolver
 * Tests environment variable resolution with $env:VAR_NAME pattern
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  resolveEnvRef,
  resolveEnvRefs,
  redactEnvRefs,
  validateEnvVars,
  extractEnvRefs,
  EnvResolutionError,
} from './env-resolver.js';

describe('resolveEnvRef', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve environment variable reference', () => {
    // Given an environment variable is set
    process.env.API_KEY = 'test-api-key-123';

    // When resolving a reference
    const result = resolveEnvRef('$env:API_KEY');

    // Then should return the environment variable value
    expect(result).toBe('test-api-key-123');
  });

  it('should return original string for non-reference strings', () => {
    // Given a regular string
    const input = 'regular-string';

    // When resolving
    const result = resolveEnvRef(input);

    // Then should return unchanged
    expect(result).toBe('regular-string');
  });

  it('should throw EnvResolutionError for undefined required variable', () => {
    // Given an undefined environment variable
    delete process.env.MISSING_VAR;

    // When resolving a required reference
    // Then should throw EnvResolutionError
    expect(() => resolveEnvRef('$env:MISSING_VAR')).toThrow(EnvResolutionError);
    expect(() => resolveEnvRef('$env:MISSING_VAR')).toThrow(/MISSING_VAR is not defined/);
    expect(() => resolveEnvRef('$env:MISSING_VAR')).toThrow(/Please add it to your .env file/);
  });

  it('should return original reference for undefined optional variable', () => {
    // Given an undefined environment variable
    delete process.env.OPTIONAL_VAR;

    // When resolving with required: false
    const result = resolveEnvRef('$env:OPTIONAL_VAR', { required: false });

    // Then should return original reference
    expect(result).toBe('$env:OPTIONAL_VAR');
  });

  it('should accept uppercase letters, digits, and underscores in variable names', () => {
    // Given variables with valid names
    process.env.API_KEY_V2 = 'value1';
    process.env.DB_CONNECTION_STRING_123 = 'value2';

    // When resolving
    const result1 = resolveEnvRef('$env:API_KEY_V2');
    const result2 = resolveEnvRef('$env:DB_CONNECTION_STRING_123');

    // Then should resolve correctly
    expect(result1).toBe('value1');
    expect(result2).toBe('value2');
  });

  it('should reject variable names that do not start with uppercase letter or underscore', () => {
    // Given variables with invalid names
    process.env['123VAR'] = 'value';
    process.env.lowercase = 'value';

    // When resolving invalid patterns
    const result1 = resolveEnvRef('$env:123VAR');
    const result2 = resolveEnvRef('$env:lowercase');

    // Then should not match pattern and return original
    expect(result1).toBe('$env:123VAR');
    expect(result2).toBe('$env:lowercase');
  });
});

describe('resolveEnvRefs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.API_KEY = 'test-key';
    process.env.BASE_URL = 'https://example.com';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve references in nested objects', () => {
    // Given an object with nested environment references
    const config = {
      api: {
        key: '$env:API_KEY',
        url: '$env:BASE_URL',
      },
      name: 'test',
    };

    // When resolving
    const result = resolveEnvRefs(config);

    // Then should resolve all references
    expect(result.api.key).toBe('test-key');
    expect(result.api.url).toBe('https://example.com');
    expect(result.name).toBe('test');
  });

  it('should resolve references in arrays', () => {
    // Given an array with environment references
    const config = {
      args: ['--key', '$env:API_KEY', '--url', '$env:BASE_URL'],
    };

    // When resolving
    const result = resolveEnvRefs(config);

    // Then should resolve array items
    expect(result.args).toEqual(['--key', 'test-key', '--url', 'https://example.com']);
  });

  it('should preserve non-string values', () => {
    // Given an object with mixed types
    const config = {
      port: 3000,
      enabled: true,
      timeout: null,
      key: '$env:API_KEY',
    };

    // When resolving
    const result = resolveEnvRefs(config);

    // Then should preserve types
    expect(result.port).toBe(3000);
    expect(result.enabled).toBe(true);
    expect(result.timeout).toBe(null);
    expect(result.key).toBe('test-key');
  });
});

describe('redactEnvRefs', () => {
  it('should redact environment variable references', () => {
    // Given an object with environment references
    const config = {
      key: '$env:API_KEY',
      name: 'test',
    };

    // When redacting
    const result = redactEnvRefs(config);

    // Then should redact references
    expect(result.key).toBe('***REDACTED***');
    expect(result.name).toBe('test');
  });

  it('should redact fields with secret-like names', () => {
    // Given an object with secret field names
    const config = {
      apiKey: 'value1',
      password: 'value2',
      token: 'value3',
      secretValue: 'value4',
      normalField: 'value5',
    };

    // When redacting
    const result = redactEnvRefs(config);

    // Then should redact secret fields
    expect(result.apiKey).toBe('***REDACTED***');
    expect(result.password).toBe('***REDACTED***');
    expect(result.token).toBe('***REDACTED***');
    expect(result.secretValue).toBe('***REDACTED***');
    expect(result.normalField).toBe('value5');
  });

  it('should redact values containing secret-like keywords', () => {
    // Given strings that look like secrets
    const longKeyValue = 'sk-1234567890abcdefghijklmnopqrstuvwxyz-key';
    const longTokenValue = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9-token';

    // When redacting
    const result1 = redactEnvRefs(longKeyValue);
    const result2 = redactEnvRefs(longTokenValue);

    // Then should redact long values with keywords
    expect(result1).toBe('***REDACTED***');
    expect(result2).toBe('***REDACTED***');
  });

  it('should preserve short values and non-secret strings', () => {
    // Given short or non-secret values
    const shortValue = 'test';
    const urlValue = 'https://example.com';

    // When redacting
    const result1 = redactEnvRefs(shortValue);
    const result2 = redactEnvRefs(urlValue);

    // Then should preserve
    expect(result1).toBe('test');
    expect(result2).toBe('https://example.com');
  });
});

describe('validateEnvVars', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should pass when all variables are defined', () => {
    // Given all required variables are set
    process.env.VAR1 = 'value1';
    process.env.VAR2 = 'value2';

    // When validating
    // Then should not throw
    expect(() => validateEnvVars(['VAR1', 'VAR2'])).not.toThrow();
  });

  it('should throw EnvResolutionError for missing variables', () => {
    // Given some variables are undefined
    process.env.VAR1 = 'value1';
    delete process.env.VAR2;
    delete process.env.VAR3;

    // When validating
    // Then should throw with list of missing variables
    expect(() => validateEnvVars(['VAR1', 'VAR2', 'VAR3'])).toThrow(EnvResolutionError);
    expect(() => validateEnvVars(['VAR1', 'VAR2', 'VAR3'])).toThrow(
      /Missing required environment variables: VAR2, VAR3/,
    );
  });

  it('should pass for empty variable list', () => {
    // Given an empty list
    const vars: string[] = [];

    // When validating
    // Then should not throw
    expect(() => validateEnvVars(vars)).not.toThrow();
  });
});

describe('extractEnvRefs', () => {
  it('should extract environment variable references from object', () => {
    // Given an object with multiple references
    const config = {
      api: {
        key: '$env:API_KEY',
        url: '$env:BASE_URL',
      },
      db: {
        password: '$env:DB_PASSWORD',
      },
    };

    // When extracting
    const result = extractEnvRefs(config);

    // Then should return all unique variable names
    expect(result).toHaveLength(3);
    expect(result).toContain('API_KEY');
    expect(result).toContain('BASE_URL');
    expect(result).toContain('DB_PASSWORD');
  });

  it('should extract references from arrays', () => {
    // Given an array with references
    const config = {
      args: ['--key', '$env:API_KEY', '--token', '$env:AUTH_TOKEN'],
    };

    // When extracting
    const result = extractEnvRefs(config);

    // Then should find references in arrays
    expect(result).toHaveLength(2);
    expect(result).toContain('API_KEY');
    expect(result).toContain('AUTH_TOKEN');
  });

  it('should deduplicate references', () => {
    // Given an object with duplicate references
    const config = {
      key1: '$env:API_KEY',
      key2: '$env:API_KEY',
      key3: '$env:BASE_URL',
    };

    // When extracting
    const result = extractEnvRefs(config);

    // Then should return unique names
    expect(result).toHaveLength(2);
    expect(result).toContain('API_KEY');
    expect(result).toContain('BASE_URL');
  });

  it('should return empty array when no references found', () => {
    // Given an object without references
    const config = {
      key: 'regular-value',
      port: 3000,
    };

    // When extracting
    const result = extractEnvRefs(config);

    // Then should return empty array
    expect(result).toHaveLength(0);
  });

  it('should ignore invalid reference patterns', () => {
    // Given an object with invalid patterns
    const config = {
      valid: '$env:VALID_VAR',
      invalid1: '$env:lowercase',
      invalid2: '$env:123START',
      notRef: 'just-a-string',
    };

    // When extracting
    const result = extractEnvRefs(config);

    // Then should only extract valid pattern
    expect(result).toHaveLength(1);
    expect(result).toContain('VALID_VAR');
  });
});
