import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';

// Load environment variables from .env file for tests
dotenv.config();

describe('Ember Agent Setup', () => {
  it('should have basic setup working', () => {
    expect(true).toBe(true);
  });

  it('should be able to import zod', async () => {
    const { z } = await import('zod');
    const schema = z.string();
    expect(schema.parse('hello')).toBe('hello');
  });

  it('should be in test environment', () => {
    expect(process.env.NODE_ENV).toBe('test'); // Vitest sets NODE_ENV to 'test'
    expect(typeof process).toBe('object');
  });
});
