import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { monitorHealthTool, getMonitoringSession, stopMonitoringSession, stopAllMonitoringSessions } from '../../src/tools/monitorHealth.js';

// Mock schemas and dependencies
vi.mock('ember-schemas', () => ({
  GetWalletLendingPositionsResponseSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  }
}));

vi.mock('arbitrum-vibekit-core', () => ({
  createSuccessTask: vi.fn().mockImplementation((name, artifacts, message) => ({
    status: { state: 'completed' },
    artifacts,
    message
  })),
  createErrorTask: vi.fn().mockImplementation((name, error) => ({
    status: { state: 'failed' },
    error: error.message
  })),
  parseMcpToolResponsePayload: vi.fn().mockImplementation((result, schema) => result.structuredContent)
}));

// Mock utility functions
vi.mock('../../src/utils/userPreferences.js', () => ({
  parseUserPreferences: vi.fn().mockReturnValue({
    targetHealthFactor: 1.5,
    riskTolerance: 'moderate'
  }),
  mergePreferencesWithDefaults: vi.fn().mockReturnValue({
    targetHealthFactor: 1.5,
    riskTolerance: 'moderate'
  }),
  generatePreferencesSummary: vi.fn().mockReturnValue('Target Health Factor: 1.5, Risk Tolerance: moderate')
}));

// Mock the intelligent prevention strategy tool
vi.mock('../../src/tools/intelligentPreventionStrategy.js', () => ({
  intelligentPreventionStrategyTool: {
    execute: vi.fn().mockResolvedValue({
      status: { state: 'completed' },
      message: 'Automatic prevention executed successfully'
    })
  }
}));

// Mock timers
vi.useFakeTimers();

describe('monitorHealth Tool', () => {
  let mockMcpClient: any;
  let mockContext: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });

    mockMcpClient = {
      callTool: vi.fn()
    };

    mockContext = {
      custom: {
        mcpClient: mockMcpClient,
        thresholds: {
          warning: 1.5,
          danger: 1.2,
          critical: 1.05
        },
        monitoring: {
          enabled: true,
          interval: 300
        },
        strategy: {
          autoPrevent: true,
          targetHealthFactor: 1.5
        }
      }
    };

    // Stop all existing monitoring sessions before each test
    stopAllMonitoringSessions();
  });

  afterEach(() => {
    // Clean up any monitoring sessions after each test
    stopAllMonitoringSessions();
    vi.clearAllTimers();
  });

  it('should be defined and have correct properties', () => {
    expect(monitorHealthTool).toBeDefined();
    expect(monitorHealthTool.name).toBe('monitor-health');
    expect(monitorHealthTool.description).toBeDefined();
    // expect(monitorHealthTool.description).toContain('continuous health factor monitoring');
    // expect(monitorHealthTool.description).toContain('automatic liquidation prevention');
    expect(monitorHealthTool.parameters).toBeDefined();
    expect(typeof monitorHealthTool.execute).toBe('function');
  });

  it('should start monitoring for safe health factor', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '2.5',
          totalCollateralUsd: '10000',
          totalBorrowsUsd: '4000'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    const args = {
      userAddress: '0x123...abc',
      intervalMinutes: 5,
      enableAlerts: true,
      instruction: 'Monitor with moderate risk tolerance'
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'getWalletLendingPositions',
      arguments: {
        walletAddress: '0x123...abc'
      }
    });

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Automatic liquidation prevention activated');
    expect(result.message).toContain('Monitoring 0x123...abc every 5 minutes');
    expect(result.message).toContain('Current HF: 2.5000');

    // Check that monitoring session was created
    const session = getMonitoringSession('0x123...abc');
    expect(session).toBeDefined();
    expect(session?.userAddress).toBe('0x123...abc');
    expect(session?.intervalMinutes).toBe(5);
    expect(session?.isActive).toBe(true);
    expect(session?.targetHealthFactor).toBe(1.5);
  });

  it('should start monitoring and trigger immediate prevention for critical health factor', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.02',
          totalCollateralUsd: '5000',
          totalBorrowsUsd: '4800'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    const args = {
      userAddress: '0x456...def',
      intervalMinutes: 1,
      enableAlerts: true,
      instruction: 'Emergency monitoring - health factor is critical'
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Current HF: 1.0200');
    expect(result.message).toContain('TRIGGERING NOW');

    // Check that monitoring session was created with alert
    const session = getMonitoringSession('0x456...def');
    expect(session).toBeDefined();
    expect(session?.alerts).toHaveLength(1);
    expect(session?.alerts[0]?.riskLevel).toBe('CRITICAL');
    expect(session?.alerts[0]?.healthFactor).toBe(1.02);
  });

  it('should handle warning risk level correctly', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.4',
          totalCollateralUsd: '8000',
          totalBorrowsUsd: '5500'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    // Use custom preferences to set target HF higher than current
    const { mergePreferencesWithDefaults } = await import('../../src/utils/userPreferences.js');
    vi.mocked(mergePreferencesWithDefaults).mockReturnValueOnce({
      targetHealthFactor: 1.3, // Set target lower than current HF to avoid immediate trigger
      riskTolerance: 'moderate'
    });

    const args = {
      userAddress: '0x789...ghi',
      intervalMinutes: 2,
      enableAlerts: true
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('🟡');
    expect(result.message).toContain('Current HF: 1.4000');

    const session = getMonitoringSession('0x789...ghi');
    expect(session?.alerts).toHaveLength(1);
    expect(session?.alerts[0]?.riskLevel).toBe('WARNING');
  });

  it('should handle danger risk level correctly', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.15',
          totalCollateralUsd: '6000',
          totalBorrowsUsd: '5000'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    // Use custom preferences to set target HF lower than current
    const { mergePreferencesWithDefaults } = await import('../../src/utils/userPreferences.js');
    vi.mocked(mergePreferencesWithDefaults).mockReturnValueOnce({
      targetHealthFactor: 1.1, // Set target lower than current HF to avoid immediate trigger
      riskTolerance: 'moderate'
    });

    const args = {
      userAddress: '0xabc...123',
      intervalMinutes: 1,
      enableAlerts: true
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('🟠');
    expect(result.message).toContain('Current HF: 1.1500');

    const session = getMonitoringSession('0xabc...123');
    expect(session?.alerts).toHaveLength(1);
    expect(session?.alerts[0]?.riskLevel).toBe('DANGER');
  });

  it('should handle missing health factor data', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          totalCollateralUsd: '1000',
          totalBorrowsUsd: '0'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    const args = {
      userAddress: '0xdef...456',
      intervalMinutes: 5
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Current HF: N/A');

    const session = getMonitoringSession('0xdef...456');
    expect(session?.alerts).toHaveLength(0);
  });

  it('should handle MCP client errors', async () => {
    mockMcpClient.callTool.mockResolvedValue({
      isError: true,
      content: [{ text: 'Failed to fetch positions' }]
    });

    const args = {
      userAddress: '0x111...222',
      intervalMinutes: 1
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('Failed to start monitoring: Failed to fetch positions');
  });

  it('should handle missing MCP client', async () => {
    const contextWithoutMcp = {
      custom: {
        mcpClient: null,
        thresholds: mockContext.custom.thresholds
      }
    };

    const args = {
      userAddress: '0x333...444',
      intervalMinutes: 1
    };

    const result = await monitorHealthTool.execute(args, contextWithoutMcp as any);
    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('Ember MCP client not found in context');
  });

  it('should stop existing monitoring session when starting new one', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '2.0',
          totalCollateralUsd: '5000',
          totalBorrowsUsd: '2000'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    const args = {
      userAddress: '0x555...666',
      intervalMinutes: 3
    };

    // Start first monitoring session
    await monitorHealthTool.execute(args, mockContext);
    let session = getMonitoringSession('0x555...666');
    expect(session?.isActive).toBe(true);

    // Start second monitoring session for the same user
    await monitorHealthTool.execute(args, mockContext);
    session = getMonitoringSession('0x555...666');
    expect(session?.isActive).toBe(true);
    expect(session?.checksPerformed).toBe(1); // Reset to 1 for new session
  });

  it('should validate input parameters correctly', () => {
    const schema = monitorHealthTool.parameters;

    // Valid input with defaults
    const validInput = {
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Valid input with custom parameters
    const validCustomInput = {
      userAddress: '0x1234567890123456789012345678901234567890',
      intervalMinutes: 10,
      enableAlerts: false,
      instruction: 'Custom monitoring preferences'
    };
    expect(() => schema.parse(validCustomInput)).not.toThrow();

    // Invalid input - missing userAddress
    expect(() => schema.parse({
      intervalMinutes: 5
    })).toThrow();

    // Invalid input - wrong type for intervalMinutes
    expect(() => schema.parse({
      userAddress: '0x1234567890123456789012345678901234567890',
      intervalMinutes: 'invalid'
    })).toThrow();

    // Invalid input - wrong type for enableAlerts
    expect(() => schema.parse({
      userAddress: '0x1234567890123456789012345678901234567890',
      enableAlerts: 'invalid'
    })).toThrow();
  });

  it('should handle alerts disabled correctly', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.4',
          totalCollateralUsd: '3000',
          totalBorrowsUsd: '2000'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    const args = {
      userAddress: '0x777...888',
      intervalMinutes: 5,
      enableAlerts: false
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');

    const session = getMonitoringSession('0x777...888');
    expect(session?.alerts).toHaveLength(0); // No alerts when disabled
  });

  it('should handle response parsing errors', async () => {
    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: null
    });

    // Mock the parseMcpToolResponsePayload to throw an error
    const { parseMcpToolResponsePayload } = await import('arbitrum-vibekit-core');
    vi.mocked(parseMcpToolResponsePayload).mockImplementationOnce(() => {
      throw new Error('Invalid response format');
    });

    const args = {
      userAddress: '0x999...000',
      intervalMinutes: 1
    };

    const result = await monitorHealthTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('Failed to parse initial health data');
  });

  it('should use default interval when not specified', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '3.0',
          totalCollateralUsd: '15000',
          totalBorrowsUsd: '5000'
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    // Parse with schema to get default value
    const schema = monitorHealthTool.parameters;
    const parsedArgs = schema.parse({
      userAddress: '0xaaa...bbb'
      // intervalMinutes not specified - should default to 1
    });

    const result = await monitorHealthTool.execute(parsedArgs, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('every 1 minutes');

    const session = getMonitoringSession('0xaaa...bbb');
    expect(session?.intervalMinutes).toBe(1);
  });

  describe('Helper Functions', () => {
    it('should get monitoring session correctly', async () => {
      const mockPositionsResponse = {
        structuredContent: {
          positions: [{
            healthFactor: '2.0',
            totalCollateralUsd: '5000',
            totalBorrowsUsd: '2000'
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsResponse.structuredContent
      });

      const args = {
        userAddress: '0xccc...ddd',
        intervalMinutes: 2
      };

      await monitorHealthTool.execute(args, mockContext);

      const session = getMonitoringSession('0xccc...ddd');
      expect(session).toBeDefined();
      expect(session?.userAddress).toBe('0xccc...ddd');
      expect(session?.intervalMinutes).toBe(2);

      // Non-existent session should return undefined
      const nonExistentSession = getMonitoringSession('0x000...111');
      expect(nonExistentSession).toBeUndefined();
    });

    it('should stop monitoring session correctly', async () => {
      const mockPositionsResponse = {
        structuredContent: {
          positions: [{
            healthFactor: '1.8',
            totalCollateralUsd: '4000',
            totalBorrowsUsd: '2000'
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsResponse.structuredContent
      });

      const args = {
        userAddress: '0xeee...fff',
        intervalMinutes: 3
      };

      await monitorHealthTool.execute(args, mockContext);

      let session = getMonitoringSession('0xeee...fff');
      expect(session?.isActive).toBe(true);

      const stopped = stopMonitoringSession('0xeee...fff');
      expect(stopped).toBe(true);

      session = getMonitoringSession('0xeee...fff');
      expect(session).toBeUndefined();

      // Trying to stop non-existent session should return false
      const notStopped = stopMonitoringSession('0x000...222');
      expect(notStopped).toBe(false);
    });

    it('should stop all monitoring sessions correctly', async () => {
      const mockPositionsResponse = {
        structuredContent: {
          positions: [{
            healthFactor: '2.2',
            totalCollateralUsd: '6000',
            totalBorrowsUsd: '2500'
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsResponse.structuredContent
      });

      // Start multiple monitoring sessions
      await monitorHealthTool.execute({ userAddress: '0x111...aaa', intervalMinutes: 1 }, mockContext);
      await monitorHealthTool.execute({ userAddress: '0x222...bbb', intervalMinutes: 2 }, mockContext);

      expect(getMonitoringSession('0x111...aaa')).toBeDefined();
      expect(getMonitoringSession('0x222...bbb')).toBeDefined();

      const stoppedCount = stopAllMonitoringSessions();
      expect(stoppedCount).toBe(2);

      expect(getMonitoringSession('0x111...aaa')).toBeUndefined();
      expect(getMonitoringSession('0x222...bbb')).toBeUndefined();
    });
  });
});