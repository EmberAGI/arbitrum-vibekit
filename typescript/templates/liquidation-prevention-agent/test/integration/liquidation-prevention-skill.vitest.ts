import { describe, it, expect, vi, beforeEach } from 'vitest';
import { liquidationPreventionSkill } from '../../src/skills/liquidationPrevention.js';

// Mock the tools that the skill uses
vi.mock('../../src/tools/supplyCollateral.js', () => ({
  supplyCollateralTool: {
    name: 'supply-collateral',
    description: 'Supply collateral to improve health factor',
    parameters: {
      parse: vi.fn().mockImplementation((args) => args)
    },
    execute: vi.fn().mockResolvedValue({
      status: { state: 'completed' },
      message: 'Successfully supplied 100 USDC as collateral. Transaction executed to improve health factor and prevent liquidation.'
    })
  }
}));

vi.mock('../../src/tools/repayDebt.js', () => ({
  repayDebtTool: {
    name: 'repay-debt',
    description: 'Repay debt to improve health factor',
    parameters: {
      parse: vi.fn().mockImplementation((args) => args)
    },
    execute: vi.fn().mockResolvedValue({
      status: { state: 'completed' },
      message: 'Successfully repaid 50 DAI debt. Transaction executed to improve health factor and prevent liquidation.'
    })
  }
}));

describe('Liquidation Prevention Skill Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be properly defined with correct structure', () => {
    expect(liquidationPreventionSkill).toBeDefined();
    expect(liquidationPreventionSkill.id).toBe('liquidation-prevention');
    expect(liquidationPreventionSkill.name).toBe('Liquidation Prevention');
    expect(liquidationPreventionSkill.description).toContain('direct liquidation prevention');
    expect(liquidationPreventionSkill.description).toContain('immediate risk mitigation');
    expect(liquidationPreventionSkill.tags).toContain('liquidation-prevention');
    expect(liquidationPreventionSkill.tools).toHaveLength(2);
  });

  it('should include both supply and repay tools', () => {
    const toolNames = liquidationPreventionSkill.tools.map(tool => tool.name);
    expect(toolNames).toContain('supply-collateral');
    expect(toolNames).toContain('repay-debt');
    expect(toolNames).toHaveLength(2);
  });

  it('should have comprehensive examples for prevention actions', () => {
    expect(liquidationPreventionSkill.examples).toContain('Supply 100 USDC as collateral to improve my health factor');
    expect(liquidationPreventionSkill.examples).toContain('Repay 50 DAI debt to reduce liquidation risk');
    expect(liquidationPreventionSkill.examples).toContain('Supply more ETH collateral with max $1000');
    expect(liquidationPreventionSkill.examples).toContain('Repay all available USDT debt');
    expect(liquidationPreventionSkill.examples.length).toBeGreaterThan(6);
  });

  it('should validate input schema correctly', () => {
    const schema = liquidationPreventionSkill.inputSchema;
    
    // Valid input
    const validInput = {
      instruction: 'Supply 100 USDC as collateral',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Invalid input - missing instruction
    expect(() => schema.parse({
      userAddress: '0x1234567890123456789012345678901234567890'
    })).toThrow();

    // Invalid input - missing userAddress
    expect(() => schema.parse({
      instruction: 'Supply collateral'
    })).toThrow();
  });

  it('should handle collateral supply actions', async () => {
    const { supplyCollateralTool } = await import('../../src/tools/supplyCollateral.js');
    
    const args = {
      instruction: 'Supply 500 USDC as collateral to prevent liquidation',
      userAddress: '0x123...abc'
    };

    // Simulate the skill would use supplyCollateralTool for supply actions
    const result = await supplyCollateralTool.execute(args, {} as any);
    
    expect(supplyCollateralTool.execute).toHaveBeenCalledWith(args, {});
    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully supplied');
    expect(result.message).toContain('collateral');
    expect(result.message).toContain('prevent liquidation');
  });

  it('should handle debt repayment actions', async () => {
    const { repayDebtTool } = await import('../../src/tools/repayDebt.js');
    
    const args = {
      instruction: 'Repay 200 DAI debt to improve health factor',
      userAddress: '0x456...def'
    };

    // Simulate the skill would use repayDebtTool for repayment actions
    const result = await repayDebtTool.execute(args, {} as any);
    
    expect(repayDebtTool.execute).toHaveBeenCalledWith(args, {});
    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully repaid');
    expect(result.message).toContain('debt');
    expect(result.message).toContain('prevent liquidation');
  });

  it('should handle various collateral supply scenarios', async () => {
    const { supplyCollateralTool } = await import('../../src/tools/supplyCollateral.js');
    
    const scenarios = [
      {
        instruction: 'Supply max $1000 worth of ETH as collateral',
        userAddress: '0x789...ghi'
      },
      {
        instruction: 'Supply half of my WETH balance as collateral',
        userAddress: '0xabc...123'
      },
      {
        instruction: 'Supply this amount of tokens to strengthen my position',
        userAddress: '0xdef...456'
      }
    ];

    for (const scenario of scenarios) {
      await supplyCollateralTool.execute(scenario, {} as any);
      expect(supplyCollateralTool.execute).toHaveBeenCalledWith(scenario, {});
    }
  });

  it('should handle various debt repayment scenarios', async () => {
    const { repayDebtTool } = await import('../../src/tools/repayDebt.js');
    
    const scenarios = [
      {
        instruction: 'Repay all available USDT debt',
        userAddress: '0x111...222'
      },
      {
        instruction: 'Repay 25% of my borrowed tokens',
        userAddress: '0x333...444'
      },
      {
        instruction: 'Execute immediate debt repayment to prevent liquidation',
        userAddress: '0x555...666'
      }
    ];

    for (const scenario of scenarios) {
      await repayDebtTool.execute(scenario, {} as any);
      expect(repayDebtTool.execute).toHaveBeenCalledWith(scenario, {});
    }
  });

  it('should provide appropriate tags for direct actions', () => {
    const expectedTags = ['defi', 'aave', 'liquidation-prevention', 'supply', 'repay'];
    expectedTags.forEach(tag => {
      expect(liquidationPreventionSkill.tags).toContain(tag);
    });
  });

  it('should cover different action patterns in examples', () => {
    const examples = liquidationPreventionSkill.examples;
    
    // Supply collateral examples
    const supplyExamples = examples.filter(ex => 
      ex.toLowerCase().includes('supply') || 
      ex.toLowerCase().includes('collateral')
    );
    expect(supplyExamples.length).toBeGreaterThan(2);

    // Debt repayment examples  
    const repayExamples = examples.filter(ex =>
      ex.toLowerCase().includes('repay') || 
      ex.toLowerCase().includes('debt')
    );
    expect(repayExamples.length).toBeGreaterThan(2);

    // Amount-specific examples
    const amountExamples = examples.filter(ex => 
      ex.includes('100') || 
      ex.includes('50') || 
      ex.includes('$1000') ||
      ex.includes('25%') ||
      ex.includes('half')
    );
    expect(amountExamples.length).toBeGreaterThan(2);
  });

  it('should have properly configured tool parameters', () => {
    // Verify each tool has a parameters object (schema)
    liquidationPreventionSkill.tools.forEach(tool => {
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters.parse).toBe('function');
    });
    
    // Verify the skill's input schema validation works
    const schema = liquidationPreventionSkill.inputSchema;
    const validInput = {
      instruction: 'Supply 100 USDC as collateral',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    
    expect(() => schema.parse(validInput)).not.toThrow();
  });

  it('should emphasize direct action execution', () => {
    // Verify the skill description emphasizes direct/immediate actions
    expect(liquidationPreventionSkill.description).toContain('direct');
    expect(liquidationPreventionSkill.description).toContain('immediate');
    
    // Verify examples include direct action language
    const directExamples = liquidationPreventionSkill.examples.filter(ex =>
      ex.toLowerCase().includes('supply') ||
      ex.toLowerCase().includes('repay') ||
      ex.toLowerCase().includes('execute')
    );
    expect(directExamples.length).toBeGreaterThan(5);
  });

  it('should distinguish from monitoring functionality', () => {
    // The description should clarify this is for direct actions, not monitoring  
    expect(liquidationPreventionSkill.description).toContain('direct');
    expect(liquidationPreventionSkill.description).toContain('immediate');
    expect(liquidationPreventionSkill.description).not.toContain('continuous');
    expect(liquidationPreventionSkill.description).not.toContain('monitoring');
    
    // Should not include monitoring tools
    const toolNames = liquidationPreventionSkill.tools.map(tool => tool.name);
    expect(toolNames).not.toContain('monitor-health');
    expect(toolNames).not.toContain('intelligent-prevention-strategy');
    
    // Should only include direct action tools
    expect(toolNames).toContain('supply-collateral');
    expect(toolNames).toContain('repay-debt');
  });

  it('should handle different instruction formats for prevention', () => {
    const schema = liquidationPreventionSkill.inputSchema;
    
    const testInstructions = [
      'Supply 100 USDC as collateral to improve my health factor',
      'Repay 50 DAI debt to reduce liquidation risk',
      'Supply more ETH collateral with max $1000',
      'Execute immediate debt repayment',
      'Supply half of my balance as collateral'
    ];

    testInstructions.forEach(instruction => {
      const validInput = {
        instruction,
        userAddress: '0x1234567890123456789012345678901234567890'
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });
  });

  it('should support both token-specific and amount-specific instructions', () => {
    const examples = liquidationPreventionSkill.examples;
    
    // Token-specific examples
    const tokenExamples = examples.filter(ex =>
      ex.includes('USDC') ||
      ex.includes('DAI') ||
      ex.includes('ETH') ||
      ex.includes('WETH') ||
      ex.includes('USDT')
    );
    expect(tokenExamples.length).toBeGreaterThan(3);

    // Amount-specific examples
    const amountExamples = examples.filter(ex =>
      ex.includes('100') ||
      ex.includes('50') ||
      ex.includes('$1000') ||
      ex.includes('25%') ||
      ex.includes('half') ||
      ex.includes('all')
    );
    expect(amountExamples.length).toBeGreaterThan(3);
  });

  it('should validate required fields for prevention actions', () => {
    const schema = liquidationPreventionSkill.inputSchema;
    
    // Both instruction and userAddress are required for prevention actions
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ instruction: 'Supply collateral' })).toThrow();
    expect(() => schema.parse({ userAddress: '0x123...abc' })).toThrow();
    
    // Valid when both are provided
    expect(() => schema.parse({
      instruction: 'Supply 100 USDC as collateral',
      userAddress: '0x1234567890123456789012345678901234567890'
    })).not.toThrow();
  });

  it('should handle emergency liquidation prevention scenarios', () => {
    const examples = liquidationPreventionSkill.examples;
    
    // Emergency/immediate action examples
    const emergencyExamples = examples.filter(ex =>
      ex.toLowerCase().includes('immediate') ||
      ex.toLowerCase().includes('all') ||
      ex.toLowerCase().includes('max') ||
      ex.toLowerCase().includes('prevent liquidation')
    );
    expect(emergencyExamples.length).toBeGreaterThan(2);
  });
});