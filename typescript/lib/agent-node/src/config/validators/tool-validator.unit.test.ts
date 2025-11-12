/**
 * Unit tests for tool-validator
 * Tests tool namespacing with double underscore separator (server__tool)
 * per PRD specification at prd.md:67
 */

import { describe, it, expect } from 'vitest';

import {
  canonicalizeName,
  isValidToolName,
  extractServerName,
  extractToolName,
  createToolNamespace,
  validateToolNames,
  hasValidCharacters,
  ToolValidationException,
} from './tool-validator.js';

describe('tool naming with double underscore separator (PRD specification)', () => {
  describe('canonicalizeName', () => {
    it('should convert hyphens to underscores', () => {
      // Given names with hyphens
      expect(canonicalizeName('my-server')).toBe('my_server');
      expect(canonicalizeName('my-tool-name')).toBe('my_tool_name');
      expect(canonicalizeName('server-123')).toBe('server_123');
    });

    it('should leave names without hyphens unchanged', () => {
      // Given names without hyphens
      expect(canonicalizeName('my_server')).toBe('my_server');
      expect(canonicalizeName('mytool')).toBe('mytool');
      expect(canonicalizeName('server123')).toBe('server123');
    });

    it('should convert camelCase to snake_case', () => {
      // Given camelCase names
      expect(canonicalizeName('createSwap')).toBe('create_swap');
      expect(canonicalizeName('possibleSwaps')).toBe('possible_swaps');
      expect(canonicalizeName('HTTPRequest')).toBe('http_request');
      expect(canonicalizeName('getAPIKey')).toBe('get_api_key');
    });
  });

  describe('isValidToolName', () => {
    it('should accept valid namespaced tool names with double underscore separator', () => {
      // Given valid tool names with server__tool pattern per PRD
      const validNames = ['server__tool', 'my_server__my_tool', 'server123__tool456', 'a__b'];

      // When validating each name
      // Then all should be valid
      validNames.forEach((name) => {
        expect(isValidToolName(name)).toBe(true);
      });
    });

    it('should reject tool names without double underscore separator', () => {
      // Given tool names missing the separator
      const invalidNames = [
        'servertool', // no separator
        'server_tool', // only single underscore
        'server.tool', // dot separator (incorrect)
      ];

      // When validating each name
      // Then all should be invalid
      invalidNames.forEach((name) => {
        expect(isValidToolName(name)).toBe(false);
      });
    });

    it('should reject tool names with invalid characters', () => {
      // Given tool names with truly invalid characters
      const invalidNames = [
        'Server__Tool', // uppercase
        'server name__tool', // space
        'server@name__tool', // special character
        'server.name__tool', // dot in server name
      ];

      // When validating each name
      // Then all should be invalid
      invalidNames.forEach((name) => {
        expect(isValidToolName(name)).toBe(false);
      });
    });

    it('should reject tool names that do not start with a letter', () => {
      // Given tool names starting with non-letter
      const invalidNames = ['123server__tool', '_server__tool', '9__tool'];

      // When validating each name
      // Then all should be invalid
      invalidNames.forEach((name) => {
        expect(isValidToolName(name)).toBe(false);
      });
    });
  });

  describe('extractServerName', () => {
    it('should extract server name from valid namespaced tool', () => {
      // Given a valid namespaced tool name
      const toolName = 'my_server__my_tool';

      // When extracting server name
      const result = extractServerName(toolName);

      // Then should return server name
      expect(result).toBe('my_server');
    });

    it('should return null for tool names without double underscore', () => {
      // Given tool names with wrong format
      const invalidNames = ['server.tool', 'servertool', 'server_tool'];

      // When extracting server name
      // Then should return null
      invalidNames.forEach((name) => {
        expect(extractServerName(name)).toBeNull();
      });
    });
  });

  describe('extractToolName', () => {
    it('should extract tool name from valid namespaced tool', () => {
      // Given a valid namespaced tool name
      const toolName = 'my_server__my_tool';

      // When extracting tool name
      const result = extractToolName(toolName);

      // Then should return tool name
      expect(result).toBe('my_tool');
    });

    it('should return null for tool names without double underscore', () => {
      // Given tool names with wrong format
      const invalidNames = ['server.tool', 'servertool', 'server_tool'];

      // When extracting tool name
      // Then should return null
      invalidNames.forEach((name) => {
        expect(extractToolName(name)).toBeNull();
      });
    });
  });

  describe('createToolNamespace', () => {
    it('should create namespaced tool name with double underscore', () => {
      // Given server and tool names
      const serverName = 'my_server';
      const toolName = 'my_tool';

      // When creating namespace
      const result = createToolNamespace(serverName, toolName);

      // Then should use double underscore separator
      expect(result).toBe('my_server__my_tool');
    });

    it('should canonicalize hyphens in server and tool names', () => {
      // Given server and tool names with hyphens
      const serverName = 'my-server';
      const toolName = 'my-tool';

      // When creating namespace
      const result = createToolNamespace(serverName, toolName);

      // Then hyphens should be converted to underscores
      expect(result).toBe('my_server__my_tool');
    });

    it('should canonicalize mixed hyphens and underscores', () => {
      // Given names with both hyphens and underscores
      const serverName = 'my-server_name';
      const toolName = 'my_tool-name';

      // When creating namespace
      const result = createToolNamespace(serverName, toolName);

      // Then hyphens should be converted to underscores
      expect(result).toBe('my_server_name__my_tool_name');
    });
  });

  describe('hasValidCharacters', () => {
    it('should accept lowercase letters, digits, and underscores', () => {
      // Given valid character combinations (lowercase snake_case only)
      const validNames = [
        'abc',
        'abc123',
        'abc_def',
        'a_1_b_2',
        'server__tool',
        'my_server',
        'tool_123',
      ];

      // When validating
      // Then all should be valid
      validNames.forEach((name) => {
        expect(hasValidCharacters(name)).toBe(true);
      });
    });

    it('should reject uppercase letters and invalid special characters', () => {
      // Given invalid character combinations
      const invalidNames = ['ABC', 'Abc', 'abc.def', 'abc def', 'abc@def'];

      // When validating
      // Then all should be invalid
      invalidNames.forEach((name) => {
        expect(hasValidCharacters(name)).toBe(false);
      });
    });
  });
});

describe('validateToolNames', () => {
  it('should pass when all tool names are valid and unique', () => {
    // Given valid unique tool names
    const tools = new Map([
      ['server_a__tool_1', { server: 'server-a', source: 'skill-1' }],
      ['server_b__tool_2', { server: 'server-b', source: 'skill-2' }],
    ]);

    // When validating
    // Then no error should be thrown
    expect(() => validateToolNames(tools)).not.toThrow();
  });

  it('should throw ToolValidationException for invalid tool name format', () => {
    // Given tool with invalid format (using dot instead of double underscore)
    const tools = new Map([['server.tool', { server: 'server', source: 'skill-1' }]]);

    // When validating
    // Then should throw ToolValidationException
    expect(() => validateToolNames(tools)).toThrow(ToolValidationException);
    expect(() => validateToolNames(tools)).toThrow(/Invalid tool name format/);
  });

  it('should not allow duplicate tool names in the same map', () => {
    // Note: Maps inherently prevent duplicate keys, so duplicate detection
    // within a single Map is handled by JavaScript's Map data structure.
    // This test verifies that behavior is as expected.
    const tools = new Map([
      ['server__tool', { server: 'server-a', source: 'skill-1' }],
      ['server__tool', { server: 'server-b', source: 'skill-2' }], // Overwrites first
    ]);

    // When validating
    // Then the Map only contains one entry (second overwrote first)
    expect(tools.size).toBe(1);
    expect(tools.get('server__tool')?.server).toBe('server-b');

    // And validation should pass since there's only one tool
    expect(() => validateToolNames(tools)).not.toThrow();
  });

  it('should include error details in exception', () => {
    // Given tool with invalid format
    const tools = new Map([
      ['invalid-name', { server: 'test-server', skill: 'test-skill', source: 'skill' }],
    ]);

    // When validating
    try {
      validateToolNames(tools);
      expect.fail('Should have thrown');
    } catch (error) {
      // Then exception should contain error details
      expect(error).toBeInstanceOf(ToolValidationException);
      const validationError = error as ToolValidationException;
      expect(validationError.errors).toHaveLength(1);
      expect(validationError.errors[0]?.tool).toBe('invalid-name');
      expect(validationError.errors[0]?.server).toBe('test-server');
    }
  });

  it('should accept tool names with numbers and underscores', () => {
    // Given tool names with valid characters
    const tools = new Map([
      ['server_123__tool_456', { server: 'server-123', source: 'skill-1' }],
      ['my_server__my_tool', { server: 'my-server', source: 'skill-2' }],
    ]);

    // When validating
    // Then no error should be thrown
    expect(() => validateToolNames(tools)).not.toThrow();
  });

  it('should reject tool names starting with non-letter', () => {
    // Given tool names starting with digit or underscore
    const tools = new Map([
      ['123server__tool', { server: 'server', source: 'skill' }],
      ['_server__tool', { server: 'server', source: 'skill' }],
    ]);

    // When validating
    // Then should throw
    expect(() => validateToolNames(tools)).toThrow(ToolValidationException);
  });
});
