import { describe, expect, it } from 'vitest';

// Given: Integration tests load secrets from `.env.test` via the CLI command
// When: The suite boots
// Then: The workflow can read provider keys without importing dotenv

describe('environment wiring', () => {
  it('exposes provider keys from the Node --env-file flag', () => {
    expect(process.env['API_KEY']).toBeDefined();
    expect(process.env['CUSTOM_RPC_URL']).toBeDefined();
  });
});
