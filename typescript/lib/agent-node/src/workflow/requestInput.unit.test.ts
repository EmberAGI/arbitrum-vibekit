import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { requestInput } from './requestInput.js';

describe('requestInput', () => {
  it('should yield interrupted state and return validated input', async () => {
    const inputSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const generator = requestInput({
      message: 'Please provide your details',
      inputSchema,
    });

    // First yield should be interrupted state
    const firstYield = await generator.next();
    expect(firstYield.done).toBe(false);
    expect(firstYield.value).toEqual({
      type: 'interrupted',
      reason: 'input-required',
      message: 'Please provide your details',
      inputSchema,
    });

    // Resume with valid input
    const validInput = { name: 'John', age: 30 };
    const result = await generator.next(validInput);
    expect(result.done).toBe(true);
    expect(result.value).toEqual(validInput);
  });

  it('should use custom reason when provided', async () => {
    const inputSchema = z.object({ token: z.string() });

    const generator = requestInput({
      message: 'Please authenticate',
      inputSchema,
      reason: 'auth-required',
    });

    const firstYield = await generator.next();
    expect(firstYield.value).toMatchObject({
      type: 'interrupted',
      reason: 'auth-required',
    });
  });

  it('should retry on invalid input and eventually succeed', async () => {
    const inputSchema = z.object({
      email: z.string().email(),
    });

    const generator = requestInput({
      message: 'Please provide email',
      inputSchema,
      maxAttempts: 3,
    });

    // First yield
    await generator.next();

    // First attempt with invalid input
    const firstRetry = await generator.next({ email: 'invalid-email' });
    expect(firstRetry.done).toBe(false);
    expect(firstRetry.value).toMatchObject({
      type: 'interrupted',
      reason: 'input-required',
    });

    // Second attempt with valid input
    const validInput = { email: 'test@example.com' };
    const result = await generator.next(validInput);
    expect(result.done).toBe(true);
    expect(result.value).toEqual(validInput);
  });

  it('should throw error after maxAttempts with invalid input', async () => {
    const inputSchema = z.object({
      count: z.number().positive(),
    });

    const generator = requestInput({
      message: 'Please provide positive number',
      inputSchema,
      maxAttempts: 2,
    });

    // First yield
    await generator.next();

    // First invalid attempt
    await generator.next({ count: -1 });

    // Second invalid attempt should throw
    await expect(generator.next({ count: 0 })).rejects.toThrow(
      /Invalid input after 2 attempts/
    );
  });

  it('should use default maxAttempts of 3', async () => {
    const inputSchema = z.object({ valid: z.literal(true) });

    const generator = requestInput({
      message: 'Must be true',
      inputSchema,
    });

    // First yield
    await generator.next();

    // Three invalid attempts
    await generator.next({ valid: false });
    await generator.next({ valid: false });

    // Third attempt should throw (default maxAttempts = 3)
    await expect(generator.next({ valid: false })).rejects.toThrow(
      /Invalid input after 3 attempts/
    );
  });

  it('should provide proper TypeScript type inference', async () => {
    const inputSchema = z.object({
      name: z.string(),
      optional: z.number().optional(),
    });

    const generator = requestInput({
      message: 'Test typing',
      inputSchema,
    });

    await generator.next();
    const result = await generator.next({ name: 'test', optional: 42 });

    // TypeScript should infer the correct type
    const typedResult: { name: string; optional?: number } = result.value;
    expect(typedResult.name).toBe('test');
    expect(typedResult.optional).toBe(42);
  });
});
