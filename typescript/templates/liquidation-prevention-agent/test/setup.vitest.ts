import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';

dotenv.config();

describe('Liquidation Prevention Agent Setup', () => {
    it('should have basic setup working', () => {
        expect(true).toBe(true);
    });

    it('should be able to import zod', async () => {
        const { z } = await import('zod');
        const schema = z.string();
        expect(schema.parse('hello')).toBe('hello');
    });

    it('should be in test environment', () => {
        expect(process.env.NODE_ENV).toBe('test');
        expect(typeof process).toBe('object');
    });
}
);
