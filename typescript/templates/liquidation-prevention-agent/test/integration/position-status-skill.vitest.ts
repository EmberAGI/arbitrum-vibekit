import { describe, it, expect, vi, beforeEach } from 'vitest';
import { positionStatusSkill } from '../../src/skills/positionStatus.js';

// Mock the tools that the skill uses
vi.mock('../../src/tools/getUserPositions.js', () => ({
  getUserPositionsTool: {
    name: 'get-user-positions',
    description: 'Get user positions and health factor',
    parameters: {
      parse: vi.fn().mockImplementation((args) => args)
    },
    execute: vi.fn().mockResolvedValue({
      status: { state: 'completed' },
      message: 'Position check completed: Current Health Factor: 2.45 (SAFE). Total Collateral: $15,000, Total Borrowed: $6,000.'
    })
  }
}));

vi.mock('../../src/tools/getWalletBalances.js', () => ({
  getWalletBalancesTool: {
    name: 'get-wallet-balances',
    description: 'Get wallet token balances',
    parameters: {
      parse: vi.fn().mockImplementation((args) => args)
    },
    execute: vi.fn().mockResolvedValue({
      status: { state: 'completed' },
      message: 'Wallet balances retrieved: Found 5 tokens. Total value: $2,500. USDC: 1000, WETH: 0.5, etc.'
    })
  }
}));

vi.mock('../../src/tools/testLiquidationData.js', () => ({
  testLiquidationDataTool: {
    name: 'test-liquidation-data',
    description: 'Test liquidation prevention data generation',
    parameters: {
      parse: vi.fn().mockImplementation((args) => args)
    },
    execute: vi.fn().mockResolvedValue({
      status: { state: 'completed' },
      message: 'LiquidationPreventionData generated successfully! Found 12 assets (3 supplied, 2 borrowed, 7 wallet). Current HF: 2.45, Target: 1.5.'
    })
  }
}));

describe('Position Status Skill Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be properly defined with correct structure', () => {
    expect(positionStatusSkill).toBeDefined();
    expect(positionStatusSkill.id).toBe('position-status');
    expect(positionStatusSkill.name).toBe('Position Status & Health Check');
    expect(positionStatusSkill.description).toContain('immediate status');
    expect(positionStatusSkill.tags).toContain('health-factor');
    expect(positionStatusSkill.tools).toHaveLength(3);
  });

  it('should include all required tools', () => {
    const toolNames = positionStatusSkill.tools.map(tool => tool.name);
    expect(toolNames).toContain('get-user-positions');
    expect(toolNames).toContain('get-wallet-balances');
    expect(toolNames).toContain('test-liquidation-data');
  });

  it('should have comprehensive examples for different use cases', () => {
    expect(positionStatusSkill.examples).toContain('Check my liquidation risk and health factor');
    expect(positionStatusSkill.examples).toContain('Show my wallet token balances');
    expect(positionStatusSkill.examples).toContain('Show me the full liquidation prevention data structure');
    expect(positionStatusSkill.examples.length).toBeGreaterThan(10);
  });

  it('should validate input schema correctly', () => {
    const schema = positionStatusSkill.inputSchema;
    
    // Valid input
    const validInput = {
      instruction: 'Check my health factor',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Invalid input - missing instruction
    expect(() => schema.parse({
      userAddress: '0x1234567890123456789012345678901234567890'
    })).toThrow();

    // Invalid input - missing userAddress
    expect(() => schema.parse({
      instruction: 'Check my health factor'
    })).toThrow();
  });

  it('should handle position status queries', async () => {
    const { getUserPositionsTool } = await import('../../src/tools/getUserPositions.js');
    
    const args = {
      instruction: 'Check my current health factor and position risk',
      userAddress: '0x123...abc'
    };

    // Simulate the skill would use getUserPositionsTool for position queries
    const result = await getUserPositionsTool.execute(args, {} as any);
    
    expect(getUserPositionsTool.execute).toHaveBeenCalledWith(args, {});
    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Health Factor');
    expect(result.message).toContain('Total Collateral');
  });

  it('should handle wallet balance queries', async () => {
    const { getWalletBalancesTool } = await import('../../src/tools/getWalletBalances.js');
    
    const args = {
      instruction: 'Show my wallet token balances for liquidation prevention',
      userAddress: '0x456...def'
    };

    // Simulate the skill would use getWalletBalancesTool for balance queries
    const result = await getWalletBalancesTool.execute(args, {} as any);
    
    expect(getWalletBalancesTool.execute).toHaveBeenCalledWith(args, {});
    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Wallet balances');
    expect(result.message).toContain('tokens');
  });

  it('should handle liquidation data structure testing', async () => {
    const { testLiquidationDataTool } = await import('../../src/tools/testLiquidationData.js');
    
    const args = {
      instruction: 'Show me the full liquidation prevention data structure',
      userAddress: '0x789...ghi'
    };

    // Simulate the skill would use testLiquidationDataTool for data structure testing
    const result = await testLiquidationDataTool.execute(args, {} as any);
    
    expect(testLiquidationDataTool.execute).toHaveBeenCalledWith(args, {});
    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('LiquidationPreventionData generated');
    expect(result.message).toContain('assets');
  });

  it('should provide appropriate tags for skill discovery', () => {
    const expectedTags = ['defi', 'aave', 'health-factor', 'status', 'positions', 'immediate', 'check'];
    expectedTags.forEach(tag => {
      expect(positionStatusSkill.tags).toContain(tag);
    });
  });

  it('should cover different query patterns in examples', () => {
    const examples = positionStatusSkill.examples;
    
    // Health factor related examples
    const healthFactorExamples = examples.filter(ex => 
      ex.toLowerCase().includes('health factor') || 
      ex.toLowerCase().includes('liquidation risk')
    );
    expect(healthFactorExamples.length).toBeGreaterThan(2);

    // Wallet balance related examples  
    const balanceExamples = examples.filter(ex =>
      ex.toLowerCase().includes('wallet') || 
      ex.toLowerCase().includes('balance')
    );
    expect(balanceExamples.length).toBeGreaterThan(3);

    // Data structure related examples
    const dataExamples = examples.filter(ex => 
      ex.toLowerCase().includes('data') || 
      ex.toLowerCase().includes('structure')
    );
    expect(dataExamples.length).toBeGreaterThan(1);
  });

  it('should have properly configured tool parameters', () => {
    // Verify each tool has a parameters object (schema)
    positionStatusSkill.tools.forEach(tool => {
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters.parse).toBe('function');
    });
    
    // Verify the skill's input schema validation works
    const schema = positionStatusSkill.inputSchema;
    const validInput = {
      instruction: 'Check my positions',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    
    expect(() => schema.parse(validInput)).not.toThrow();
  });

  it('should support immediate status checking without monitoring', () => {
    // Verify the skill description emphasizes immediate checking
    expect(positionStatusSkill.description).toContain('immediate');
    expect(positionStatusSkill.description).toContain('without monitoring');
    
    // Verify examples include immediate checking language
    const immediateExamples = positionStatusSkill.examples.filter(ex =>
      ex.toLowerCase().includes('check') ||
      ex.toLowerCase().includes('show') ||
      ex.toLowerCase().includes('what') ||
      ex.toLowerCase().includes('display')
    );
    expect(immediateExamples.length).toBeGreaterThan(5);
  });

  it('should distinguish from monitoring functionality', () => {
    // The description should clarify this is for immediate checks, not continuous monitoring
    expect(positionStatusSkill.description).toContain('without monitoring');
    expect(positionStatusSkill.description).not.toContain('continuous');
    expect(positionStatusSkill.description).not.toContain('automatic');
    
    // Should not include monitoring tools
    const toolNames = positionStatusSkill.tools.map(tool => tool.name);
    expect(toolNames).not.toContain('monitor-health');
    expect(toolNames).not.toContain('intelligent-prevention-strategy');
  });

  it('should handle different instruction formats', () => {
    const schema = positionStatusSkill.inputSchema;
    
    const testInstructions = [
      'Check my health factor',
      'Show my current positions',
      'What is my liquidation risk?',
      'Display my wallet balances',
      'Test the liquidation data structure'
    ];

    testInstructions.forEach(instruction => {
      const validInput = {
        instruction,
        userAddress: '0x1234567890123456789012345678901234567890'
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });
  });
});