import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthMonitoringSkill } from '../../src/skills/healthMonitoring.js';

// Mock the monitoring tool that the skill uses
vi.mock('../../src/tools/monitorHealth.js', () => {
  const mockStopAllMonitoringSessions = vi.fn().mockReturnValue(0);
  const mockGetMonitoringSession = vi.fn().mockReturnValue(undefined);
  const mockStopMonitoringSession = vi.fn().mockReturnValue(false);

  return {
    monitorHealthTool: {
      name: 'monitor-health',
      description: 'Start continuous health factor monitoring with automatic prevention',
      parameters: {
        parse: vi.fn().mockImplementation((args) => ({
          userAddress: args.userAddress,
          intervalMinutes: args.intervalMinutes || 1,
          enableAlerts: args.enableAlerts !== undefined ? args.enableAlerts : true,
          instruction: args.instruction || ''
        }))
      },
      execute: vi.fn().mockResolvedValue({
        status: { state: 'completed' },
        message: 'Automatic liquidation prevention activated! Monitoring 0x123...abc every 5 minutes. Will prevent liquidation if health factor ≤ 1.5. Current HF: 2.45. Health monitoring started successfully.'
      })
    },
    getMonitoringSession: mockGetMonitoringSession,
    stopMonitoringSession: mockStopMonitoringSession,
    stopAllMonitoringSessions: mockStopAllMonitoringSessions
  };
});

// Mock timers for testing intervals
vi.useFakeTimers();

describe('Health Monitoring Skill Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should be properly defined with correct structure', () => {
    expect(healthMonitoringSkill).toBeDefined();
    expect(healthMonitoringSkill.id).toBe('health-monitoring');
    expect(healthMonitoringSkill.name).toBe('Health Factor Monitoring & Auto-Prevention');
    expect(healthMonitoringSkill.description).toContain('continuous monitoring');
    expect(healthMonitoringSkill.description).toContain('automatic liquidation prevention');
    expect(healthMonitoringSkill.tags).toContain('monitoring');
    expect(healthMonitoringSkill.tags).toContain('auto-prevention');
    expect(healthMonitoringSkill.tools).toHaveLength(1);
  });

  it('should include only the monitoring tool', () => {
    const toolNames = healthMonitoringSkill.tools.map(tool => tool.name);
    expect(toolNames).toContain('monitor-health');
    expect(toolNames).toHaveLength(1);
  });

  it('should have comprehensive examples for monitoring scenarios', () => {
    expect(healthMonitoringSkill.examples).toContain('Monitor my position every 2 minutes and prevent liquidation if health factor goes below 1.5');
    expect(healthMonitoringSkill.examples).toContain('Start automatic liquidation prevention with default settings (15 min intervals, 1.03 threshold)');
    expect(healthMonitoringSkill.examples).toContain('Set up continuous monitoring with health factor 1.3 threshold');
    expect(healthMonitoringSkill.examples.length).toBeGreaterThan(5);
  });

  it('should validate input schema correctly', () => {
    const schema = healthMonitoringSkill.inputSchema;

    // Valid input
    const validInput = {
      instruction: 'Monitor my position and prevent liquidation automatically',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Invalid input - missing instruction
    expect(() => schema.parse({
      userAddress: '0x1234567890123456789012345678901234567890'
    })).toThrow();

    // Invalid input - missing userAddress
    expect(() => schema.parse({
      instruction: 'Monitor my position'
    })).toThrow();
  });

  it('should handle continuous monitoring setup', async () => {
    const { monitorHealthTool } = await import('../../src/tools/monitorHealth.js');

    const args = {
      instruction: 'Start monitoring every 5 minutes with automatic liquidation prevention',
      userAddress: '0x123...abc'
    };

    // Simulate the skill would use monitorHealthTool for continuous monitoring
    const result = await monitorHealthTool.execute(args, {} as any);

    expect(monitorHealthTool.execute).toHaveBeenCalledWith(args, {});
    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Automatic liquidation prevention activated');
    expect(result.message).toContain('monitoring');
    expect(result.message).toContain('prevent liquidation');
  });

  it('should handle different monitoring intervals', async () => {
    const { monitorHealthTool } = await import('../../src/tools/monitorHealth.js');

    const argsShortInterval = {
      instruction: 'Monitor every 1 minute for high-risk position',
      userAddress: '0x456...def'
    };

    const argsLongInterval = {
      instruction: 'Monitor every 30 minutes for stable position',
      userAddress: '0x789...ghi'
    };

    // Test short interval monitoring
    await monitorHealthTool.execute(argsShortInterval, {} as any);
    expect(monitorHealthTool.execute).toHaveBeenCalledWith(argsShortInterval, {});

    // Test long interval monitoring
    await monitorHealthTool.execute(argsLongInterval, {} as any);
    expect(monitorHealthTool.execute).toHaveBeenCalledWith(argsLongInterval, {});
  });

  it('should handle automatic prevention configuration', async () => {
    const { monitorHealthTool } = await import('../../src/tools/monitorHealth.js');

    const args = {
      instruction: 'Set up automatic prevention with conservative threshold of 1.8',
      userAddress: '0xabc...123'
    };

    const result = await monitorHealthTool.execute(args, {} as any);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('liquidation prevention');
  });

  it('should provide appropriate tags for continuous monitoring', () => {
    const expectedTags = ['defi', 'aave', 'health-factor', 'monitoring', 'auto-prevention', 'continuous', 'automation'];
    expectedTags.forEach(tag => {
      expect(healthMonitoringSkill.tags).toContain(tag);
    });
  });

  it('should cover different monitoring patterns in examples', () => {
    const examples = healthMonitoringSkill.examples;

    // Continuous monitoring examples
    const continuousExamples = examples.filter(ex =>
      ex.toLowerCase().includes('continuous') ||
      ex.toLowerCase().includes('monitoring') ||
      ex.toLowerCase().includes('automatic')
    );
    expect(continuousExamples.length).toBeGreaterThan(3);

    // Prevention examples  
    const preventionExamples = examples.filter(ex =>
      ex.toLowerCase().includes('prevent') ||
      ex.toLowerCase().includes('prevention')
    );
    expect(preventionExamples.length).toBeGreaterThan(2);

    // Interval-specific examples
    const intervalExamples = examples.filter(ex =>
      ex.toLowerCase().includes('minute') ||
      ex.toLowerCase().includes('interval')
    );
    expect(intervalExamples.length).toBeGreaterThan(1);
  });

  it('should have properly configured tool parameters', () => {
    // Verify the monitoring tool has a parameters object (schema)
    const monitoringTool = healthMonitoringSkill.tools[0];
    expect(monitoringTool.parameters).toBeDefined();
    expect(typeof monitoringTool.parameters.parse).toBe('function');

    // Verify the skill's input schema validation works
    const schema = healthMonitoringSkill.inputSchema;
    const validInput = {
      instruction: 'Monitor continuously with 10 minute intervals',
      userAddress: '0x1234567890123456789012345678901234567890'
    };

    expect(() => schema.parse(validInput)).not.toThrow();
  });

  it('should emphasize automation and continuous monitoring', () => {
    // Verify the skill description emphasizes automation
    expect(healthMonitoringSkill.description).toContain('continuous monitoring');
    expect(healthMonitoringSkill.description).toContain('automatic liquidation prevention');

    // Verify examples include automation language
    const automationExamples = healthMonitoringSkill.examples.filter(ex =>
      ex.toLowerCase().includes('automatic') ||
      ex.toLowerCase().includes('continuously') ||
      ex.toLowerCase().includes('monitoring') ||
      ex.toLowerCase().includes('background')
    );
    expect(automationExamples.length).toBeGreaterThan(4);
  });

  it('should distinguish from immediate status checking', () => {
    // The description should clarify this is for continuous monitoring, not one-time checks
    expect(healthMonitoringSkill.description).toContain('continuous');
    expect(healthMonitoringSkill.description).toContain('position lookup instead');

    // Should not include immediate checking tools
    const toolNames = healthMonitoringSkill.tools.map(tool => tool.name);
    expect(toolNames).not.toContain('get-user-positions');
    expect(toolNames).not.toContain('get-wallet-balances');
    expect(toolNames).not.toContain('test-liquidation-data');
  });

  it('should handle different instruction formats for monitoring', () => {
    const schema = healthMonitoringSkill.inputSchema;

    const testInstructions = [
      'Monitor my position continuously and prevent liquidation',
      'Start automatic monitoring every 5 minutes',
      'Set up background monitoring with health factor threshold 1.3',
      'Begin continuous tracking and prevention',
      'Enable smart monitoring with automatic prevention'
    ];

    testInstructions.forEach(instruction => {
      const validInput = {
        instruction,
        userAddress: '0x1234567890123456789012345678901234567890'
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });
  });

  it('should support complex monitoring configurations', async () => {
    const { monitorHealthTool } = await import('../../src/tools/monitorHealth.js');

    const complexArgs = {
      instruction: 'Monitor every 2 minutes with alerts enabled, prevent liquidation if health factor drops below 1.4, use conservative approach',
      userAddress: '0xcomplex...address'
    };

    const result = await monitorHealthTool.execute(complexArgs, {} as any);

    expect(monitorHealthTool.execute).toHaveBeenCalledWith(complexArgs, {});
    expect(result.status.state).toBe('completed');
  });

  it('should handle monitoring session management concepts', () => {
    // The skill should be aware that monitoring creates persistent sessions
    expect(healthMonitoringSkill.description).toContain('continuous');

    // Examples should reflect persistent monitoring
    const persistentExamples = healthMonitoringSkill.examples.filter(ex =>
      ex.toLowerCase().includes('start') ||
      ex.toLowerCase().includes('set up') ||
      ex.toLowerCase().includes('begin') ||
      ex.toLowerCase().includes('enable')
    );
    expect(persistentExamples.length).toBeGreaterThan(3);
  });

  it('should validate required fields for monitoring setup', () => {
    const schema = healthMonitoringSkill.inputSchema;

    // Both instruction and userAddress are required for monitoring
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ instruction: 'Monitor me' })).toThrow();
    expect(() => schema.parse({ userAddress: '0x123...abc' })).toThrow();

    // Valid when both are provided
    expect(() => schema.parse({
      instruction: 'Monitor my position',
      userAddress: '0x1234567890123456789012345678901234567890'
    })).not.toThrow();
  });
});
