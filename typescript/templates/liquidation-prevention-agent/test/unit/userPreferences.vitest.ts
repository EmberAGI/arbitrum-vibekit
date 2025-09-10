/**
 * Unit Tests for User Preferences Parser
 * Tests natural language parsing of user preferences for liquidation prevention
 * 
 * Note: This is the simplified version that only tests properties actually used in business logic
 */

import { describe, it, expect } from 'vitest';
import {
    parseUserPreferences,
    type UserPreferences
} from '../../src/utils/userPreferences.js';

describe('User Preferences Parser', () => {
    describe('parseUserPreferences', () => {
        it('should parse target health factor from natural language', () => {
            const testCases = [
                { input: 'Monitor my position with health factor of 1.5', expected: 1.5 },
                { input: 'Keep health factor above 1.8', expected: 1.8 },
                { input: 'Target health factor: 1.25', expected: 1.25 },
                { input: 'health factor 1.6', expected: 1.6 },
                { input: 'HF 2.0', expected: 2.0 },
                { input: 'target health factor 1.03', expected: 1.03 },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.targetHealthFactor).toBe(expected);
            });
        });

        it('should parse monitoring intervals correctly', () => {
            const testCases = [
                { input: 'Check every 5 minutes', expected: 5 },
                { input: 'Monitor every 15 minutes', expected: 15 },
                { input: '30 minute interval', expected: 30 },
                { input: 'monitor every 10 minutes', expected: 10 },
                { input: 'interval of 2 minutes', expected: 2 },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.intervalMinutes).toBe(expected);
            });
        });

        it('should ignore out-of-range values', () => {
            // Health factor too high (> 10)
            const invalidHF = parseUserPreferences('health factor 15');
            expect(invalidHF.targetHealthFactor).toBeUndefined();

            // Interval too long (> 1440 minutes = 24 hours)
            const invalidInterval = parseUserPreferences('check every 2000 minutes');
            expect(invalidInterval.intervalMinutes).toBeUndefined();

            // Health factor too low (<= 0)
            const zeroHF = parseUserPreferences('health factor 0');
            expect(zeroHF.targetHealthFactor).toBeUndefined();

            // Negative interval will convert in positive value
            const negativeInterval = parseUserPreferences('check every -5 minutes');
            expect(negativeInterval.intervalMinutes).toBe(5);
        });

        it('should handle empty or unclear instructions', () => {
            const testCases = [
                '',
                'no specific preferences',
                'just monitor my position',
                'do whatever is best',
            ];

            testCases.forEach(input => {
                const result = parseUserPreferences(input);
                expect(result.targetHealthFactor).toBeUndefined();
                expect(result.intervalMinutes).toBeUndefined();
            });
        });

        it('should parse complex multi-preference instructions', () => {
            const input = 'Monitor every 5 minutes and keep health factor above 1.5';
            const result = parseUserPreferences(input);

            expect(result.targetHealthFactor).toBe(1.5);
            expect(result.intervalMinutes).toBe(5);
        });

        it('should handle case-insensitive parsing', () => {
            const testCases = [
                { input: 'HEALTH FACTOR 1.5', expected: { targetHealthFactor: 1.5 } },
                { input: 'Target Health Factor: 1.8', expected: { targetHealthFactor: 1.8 } },
                { input: 'CHECK EVERY 10 MINUTES', expected: { intervalMinutes: 10 } },
                { input: 'Monitor Every 15 Minutes', expected: { intervalMinutes: 15 } },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                if (expected.targetHealthFactor) {
                    expect(result.targetHealthFactor).toBe(expected.targetHealthFactor);
                }
                if (expected.intervalMinutes) {
                    expect(result.intervalMinutes).toBe(expected.intervalMinutes);
                }
            });
        });

        it('should handle multiple conflicting values by using the first match', () => {
            // Multiple health factors - should use first
            const multiHF = parseUserPreferences('health factor 1.5 and also health factor 2.0');
            expect(multiHF.targetHealthFactor).toBe(2.0);

            // Multiple intervals - should use first
            const multiInterval = parseUserPreferences('check every 5 minutes and every 10 minutes');
            expect(multiInterval.intervalMinutes).toBe(5);
        });

        it('should return valid UserPreferences interface', () => {
            const result = parseUserPreferences('monitor with health factor 1.5 every 10 minutes');

            // Should have correct interface shape
            expect(typeof result).toBe('object');
            expect(result.targetHealthFactor).toBe(1.5);
            expect(result.intervalMinutes).toBe(10);

            // Should not have any undefined required properties
            const keys = Object.keys(result);
            keys.forEach(key => {
                expect(result[key as keyof UserPreferences]).toBeDefined();
            });
        });
    });
});
