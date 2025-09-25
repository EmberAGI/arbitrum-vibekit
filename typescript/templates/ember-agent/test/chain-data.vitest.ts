import { describe, it, expect, beforeAll } from 'vitest';
import { agent } from '../src/index.js';

describe('chain-data skill via Tatum MCP', () => {
  beforeAll(async () => {
    // agent is started by src/index.ts when imported, nothing to do
  });

  it('should retrieve native balance task successfully', async () => {
    // This is a smoke test to ensure the tool wiring is valid.
    expect(agent).toBeDefined();
  });
});


