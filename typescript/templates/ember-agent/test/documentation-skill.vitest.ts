import { describe, test, expect } from 'vitest';
import { documentationSkill, type DocumentationSkillInput } from '../src/skills/documentation.js';
import { askCamelotTool, type AskCamelotToolInput } from '../src/tools/askCamelot.js';

describe('Documentation Skill', () => {
  test('should be able to import documentation skill', () => {
    expect(documentationSkill).toBeDefined();
    expect(typeof documentationSkill).toBe('object');
  });

  test('should have correct skill metadata', () => {
    expect(documentationSkill.id).toBe('protocol-documentation');
    expect(documentationSkill.name).toBe('Protocol Documentation Expert');
    expect(documentationSkill.description).toContain(
      'Expert knowledge about supported DeFi protocols'
    );
    expect(Array.isArray(documentationSkill.tags)).toBe(true);
    expect(documentationSkill.tags).toContain('documentation');
    expect(documentationSkill.tags).toContain('camelot');
    expect(documentationSkill.tags).toContain('arbitrum');
  });

  test('should have valid input schema', () => {
    expect(documentationSkill.inputSchema).toBeDefined();

    // Test valid input
    const validInput: DocumentationSkillInput = {
      question: 'What is Camelot DEX?',
    };

    const parseResult = documentationSkill.inputSchema.safeParse(validInput);
    expect(parseResult.success).toBe(true);
  });

  test('should accept various types of questions', () => {
    const validInputs: DocumentationSkillInput[] = [
      { question: 'What is Camelot DEX?' },
      { question: 'How does xGRAIL work?' },
      { question: 'Explain GRAIL tokenomics' },
      { question: 'What are Nitro Pools?' },
      { question: 'Tell me about AMM V3 vs V4' },
    ];

    for (const input of validInputs) {
      const parseResult = documentationSkill.inputSchema.safeParse(input);
      expect(parseResult.success).toBe(true);
    }
  });

  test('should reject invalid input', () => {
    const invalidInputs = [
      {}, // missing question
      { question: '' }, // empty question
      { question: 123 }, // wrong type
      { question: null }, // null value
      { question: undefined }, // undefined value
    ];

    for (const input of invalidInputs) {
      const parseResult = documentationSkill.inputSchema.safeParse(input);
      expect(parseResult.success).toBe(false);
    }
  });

  test('should have comprehensive examples', () => {
    expect(Array.isArray(documentationSkill.examples)).toBe(true);
    expect(documentationSkill.examples.length).toBeGreaterThan(5);

    // Check for key Camelot-related examples
    const examplesText = documentationSkill.examples.join(' ').toLowerCase();
    expect(examplesText).toContain('camelot');
    expect(examplesText).toContain('xgrail');
    expect(examplesText).toContain('grail');
    expect(examplesText).toContain('amm');
  });

  test('should have askCamelot tool defined', () => {
    expect(documentationSkill.tools).toBeDefined();
    expect(Array.isArray(documentationSkill.tools)).toBe(true);
    expect(documentationSkill.tools).toContain(askCamelotTool);
  });

  test('should not have a manual handler (LLM orchestration)', () => {
    expect(documentationSkill.handler).toBeUndefined();
  });
});

describe('Ask Camelot Tool', () => {
  test('should be able to import askCamelot tool', () => {
    expect(askCamelotTool).toBeDefined();
    expect(typeof askCamelotTool).toBe('object');
  });

  test('should have correct tool metadata', () => {
    expect(askCamelotTool.name).toBe('ask-camelot');
    expect(askCamelotTool.description).toContain('Answer questions about Camelot DEX');
    expect(askCamelotTool.parameters).toBeDefined();
  });

  test('should have valid parameter schema', () => {
    expect(askCamelotTool.parameters).toBeDefined();

    // Test valid input
    const validInput: AskCamelotToolInput = {
      question: 'What is GRAIL token?',
    };

    const parseResult = askCamelotTool.parameters.safeParse(validInput);
    expect(parseResult.success).toBe(true);
  });

  test('should accept various Camelot-related questions', () => {
    const validInputs: AskCamelotToolInput[] = [
      { question: 'What is GRAIL token?' },
      { question: 'How does the launchpad work?' },
      { question: 'What is the Round Table program?' },
      { question: 'Explain concentrated liquidity AMM' },
      { question: 'How are fees distributed?' },
    ];

    for (const input of validInputs) {
      const parseResult = askCamelotTool.parameters.safeParse(input);
      expect(parseResult.success).toBe(true);
    }
  });

  test('should have execute function defined', () => {
    expect(askCamelotTool.execute).toBeDefined();
    expect(typeof askCamelotTool.execute).toBe('function');
  });
});

describe('Documentation Skill Integration', () => {
  test('should have documentation skill properly configured for the agent', () => {
    // Validate that the skill can be used by the framework
    expect(documentationSkill.id).toBeTruthy();
    expect(documentationSkill.name).toBeTruthy();
    expect(documentationSkill.description).toBeTruthy();
    expect(documentationSkill.inputSchema).toBeTruthy();
    expect(documentationSkill.tools.length).toBeGreaterThan(0);

    // Validate that all required properties exist
    expect(documentationSkill).toHaveProperty('id');
    expect(documentationSkill).toHaveProperty('name');
    expect(documentationSkill).toHaveProperty('description');
    expect(documentationSkill).toHaveProperty('tags');
    expect(documentationSkill).toHaveProperty('examples');
    expect(documentationSkill).toHaveProperty('inputSchema');
    expect(documentationSkill).toHaveProperty('tools');
  });

  test('should integrate well with the agent framework', () => {
    // Check that the skill follows Vibekit patterns
    expect(documentationSkill.tags).toContain('documentation');
    expect(documentationSkill.examples.length).toBeGreaterThan(1);
    expect(
      documentationSkill.tools.every(
        tool =>
          typeof tool === 'object' &&
          'name' in tool &&
          'description' in tool &&
          'parameters' in tool &&
          'execute' in tool
      )
    ).toBe(true);
  });
});
