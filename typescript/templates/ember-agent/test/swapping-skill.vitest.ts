import { describe, it, expect } from 'vitest';

describe('Swapping Skill', () => {
  it('should be able to import swapping skill', async () => {
    const { swappingSkill } = await import('../src/skills/swapping.js');
    expect(swappingSkill).toBeDefined();
    expect(typeof swappingSkill).toBe('object');
  });

  it('should have correct skill metadata', async () => {
    const { swappingSkill } = await import('../src/skills/swapping.js');

    expect(swappingSkill.id).toBe('token-swapping');
    expect(swappingSkill.name).toBe('Token Swapping');
    expect(swappingSkill.description).toContain('token swaps');
    expect(swappingSkill.tags).toContain('defi');
    expect(swappingSkill.tags).toContain('swapping');
    expect(swappingSkill.examples).toHaveLength(5);
    expect(swappingSkill.examples[0]).toContain('USDC');
  });

  it('should have valid input schema', async () => {
    const { swappingSkillInputSchema } = await import('../src/skills/swapping.js');

    // Test valid input
    const validInput = {
      instruction: 'Swap 100 USDC for ETH',
      userAddress: '0x1234567890abcdef1234567890abcdef12345678',
    };

    const result = swappingSkillInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.instruction).toBe(validInput.instruction);
      expect(result.data.userAddress).toBe(validInput.userAddress);
    }
  });

  it('should accept input without userAddress', async () => {
    const { swappingSkillInputSchema } = await import('../src/skills/swapping.js');

    const validInput = {
      instruction: 'Swap 100 USDC for ETH',
    };

    const result = swappingSkillInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.instruction).toBe(validInput.instruction);
      expect(result.data.userAddress).toBeUndefined();
    }
  });

  it('should reject invalid input', async () => {
    const { swappingSkillInputSchema } = await import('../src/skills/swapping.js');

    // Missing instruction
    const invalidInput = {
      userAddress: '0x1234567890abcdef1234567890abcdef12345678',
    };

    const result = swappingSkillInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should have at least one tool defined', async () => {
    const { swappingSkill } = await import('../src/skills/swapping.js');

    expect(swappingSkill.tools).toBeDefined();
    expect(Array.isArray(swappingSkill.tools)).toBe(true);
    expect(swappingSkill.tools.length).toBeGreaterThan(0);

    const swapTool = swappingSkill.tools[0];
    expect(swapTool).toBeDefined();
    expect(swapTool!.name).toBe('swap-tokens');
    expect(swapTool!.description).toContain('swap');
    expect(swapTool!.parameters).toBeDefined();
    expect(typeof swapTool!.execute).toBe('function');
  });

  it('should have properly defined tool parameters', async () => {
    const { swappingSkill } = await import('../src/skills/swapping.js');

    const swapTool = swappingSkill.tools[0];
    expect(swapTool).toBeDefined();
    const parameters = swapTool!.parameters;

    // Test valid tool parameters
    const validParams = {
      fromToken: 'USDC',
      toToken: 'ETH',
      amount: '100',
      fromChain: 'Arbitrum',
    };

    const result = parameters.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should not have a manual handler (LLM orchestration)', async () => {
    const { swappingSkill } = await import('../src/skills/swapping.js');

    expect(swappingSkill.handler).toBeUndefined();
  });
});
