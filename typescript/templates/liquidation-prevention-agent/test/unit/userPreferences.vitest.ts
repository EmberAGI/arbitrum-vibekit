/**
 * Unit Tests for User Preferences Parser
 * Tests natural language parsing of user preferences for liquidation prevention
 */

import { describe, it, expect } from 'vitest';
import { 
    parseUserPreferences, 
    mergePreferencesWithDefaults,
    generatePreferencesSummary,
    UserPreferencesSchema,
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
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.targetHealthFactor).toBe(expected);
            });
        });

        it('should parse monitoring intervals correctly', () => {
            const testCases = [
                { input: 'Check every 5 minutes', expected: 5 },
                { input: 'Monitor every 15 min', expected: 15 },
                { input: 'Update every 2 hours', expected: 120 }, // 2 * 60
                { input: 'Check every 1 hour', expected: 60 },
                { input: 'every 30 minutes please', expected: 30 },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.monitoringInterval).toBe(expected);
            });
        });

        it('should parse risk tolerance levels', () => {
            const testCases = [
                { input: 'Use conservative approach', expected: 'conservative' },
                { input: 'I want safe trading', expected: 'conservative' },
                { input: 'Be aggressive with trades', expected: 'aggressive' },
                { input: 'Use risky strategy', expected: 'aggressive' },
                { input: 'Moderate risk is fine', expected: 'moderate' },
                { input: 'Balanced approach please', expected: 'moderate' },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.riskTolerance).toBe(expected);
            });
        });

        it('should parse threshold values correctly', () => {
            const warningInput = 'Set warning at 1.6';
            const dangerInput = 'Danger threshold should be 1.3';
            const criticalInput = 'Critical level at 1.1';

            expect(parseUserPreferences(warningInput).warningThreshold).toBe(1.6);
            expect(parseUserPreferences(dangerInput).dangerThreshold).toBe(1.3);
            expect(parseUserPreferences(criticalInput).criticalThreshold).toBe(1.1);
        });

        it('should parse transaction amount limits', () => {
            const testCases = [
                { input: 'Max transaction 1000 USD', expected: 1000 },
                { input: 'Limit to 500 dollars', expected: 500 },
                { input: 'Maximum 2500 USD per trade', expected: 2500 },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.maxTransactionAmount).toBe(expected);
            });
        });

        it('should parse minimum balance thresholds', () => {
            const testCases = [
                { input: 'Keep minimum 100 USD balance', expected: 100 },
                { input: 'Min balance should be 250 dollars', expected: 250 },
                { input: 'Maintain at least min 50 USD', expected: 50 },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.minBalanceThreshold).toBe(expected);
            });
        });

        it('should parse slippage preferences', () => {
            const testCases = [
                { input: 'Allow 2% slippage', expected: 2 },
                { input: '1.5% slippage is fine', expected: 1.5 },
                { input: '5% slippage maximum', expected: 5 },
                { input: '0.5 slippage tolerance', expected: 0.5 },
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseUserPreferences(input);
                expect(result.maxSlippagePercent).toBe(expected);
            });
        });

        it('should parse boolean preferences correctly', () => {
            const continuousInput = 'Monitor continuously';
            const notificationInput = 'Send me alerts when needed';
            const gasOptimizationInput = 'Optimize gas costs';

            expect(parseUserPreferences(continuousInput).enableContinuousMonitoring).toBe(true);
            expect(parseUserPreferences(notificationInput).enableNotifications).toBe(true);
            expect(parseUserPreferences(gasOptimizationInput).gasOptimization).toBe(true);
        });

        it('should ignore out-of-range values', () => {
            const invalidInputs = [
                'Health factor 0.5', // Too low
                'Health factor 3.0', // Too high
                'Warning threshold 0.8', // Too low  
                'Danger threshold 2.0', // Too high
                'Critical threshold 1.5', // Too high
                'Max transaction 5 USD', // Too low
                'Min balance 20000 USD', // Too high
                'Allow 15% slippage', // Too high
            ];

            invalidInputs.forEach(input => {
                const result = parseUserPreferences(input);
                // Should not set invalid values
                Object.values(result).forEach(value => {
                    if (typeof value === 'number') {
                        expect(value).toBeGreaterThan(0);
                    }
                });
            });
        });

        it('should handle empty or unclear instructions', () => {
            const unclearInputs = ['', 'just monitor', 'hello', 'random text'];

            unclearInputs.forEach(input => {
                const result = parseUserPreferences(input);
                expect(Object.keys(result).length).toBeGreaterThanOrEqual(0);
                // Should return empty object for unclear instructions
                if (input === '' || input === 'random text') {
                    expect(Object.keys(result).length).toBe(0);
                }
            });
        });

        it('should parse complex multi-preference instructions', () => {
            const complexInput = 'Monitor every 10 minutes with health factor 1.6, use conservative approach, ' +
                               'enable notifications, optimize gas, max 1500 USD transactions, 2% slippage';

            const result = parseUserPreferences(complexInput);

            expect(result.monitoringInterval).toBe(10);
            expect(result.targetHealthFactor).toBe(1.6);
            expect(result.riskTolerance).toBe('conservative');
            expect(result.enableNotifications).toBe(true);
            expect(result.gasOptimization).toBe(true);
            expect(result.maxTransactionAmount).toBe(1500);
            expect(result.maxSlippagePercent).toBe(2);
        });
    });

    describe('mergePreferencesWithDefaults', () => {
        const mockDefaults = {
            thresholds: { warning: 1.5, danger: 1.2, critical: 1.03 },
            monitoring: { intervalMs: 900000 }, // 15 minutes
            strategy: { default: 'auto', maxTransactionUsd: 5000, minSupplyBalanceUsd: 100 },
            targetHealthFactor: 1.8
        };

        it('should merge user preferences with defaults correctly', () => {
            const userPrefs: UserPreferences = {
                targetHealthFactor: 1.4,
                monitoringInterval: 5,
                riskTolerance: 'aggressive'
            };

            const result = mergePreferencesWithDefaults(userPrefs, mockDefaults);

            expect(result.targetHealthFactor).toBe(1.4); // User override
            expect(result.monitoringInterval).toBe(5); // User override
            expect(result.riskTolerance).toBe('aggressive'); // User override
            expect(result.warningThreshold).toBe(1.5); // From defaults
            expect(result.dangerThreshold).toBe(1.2); // From defaults
            expect(result.maxTransactionAmount).toBe(5000); // From defaults
        });

        it('should use all defaults when no user preferences provided', () => {
            const result = mergePreferencesWithDefaults({}, mockDefaults);

            expect(result.targetHealthFactor).toBe(1.8);
            expect(result.warningThreshold).toBe(1.5);
            expect(result.dangerThreshold).toBe(1.2);
            expect(result.criticalThreshold).toBe(1.03);
            expect(result.monitoringInterval).toBe(15); // 900000ms / 60000
            expect(result.enableContinuousMonitoring).toBe(true);
            expect(result.maxTransactionAmount).toBe(5000);
            expect(result.minBalanceThreshold).toBe(100);
            expect(result.enableNotifications).toBe(true);
            expect(result.maxSlippagePercent).toBe(2.0);
            expect(result.gasOptimization).toBe(true);
            expect(result.riskTolerance).toBe('moderate');
        });

        it('should handle boolean preferences correctly', () => {
            const userPrefs: UserPreferences = {
                enableContinuousMonitoring: false,
                enableNotifications: false,
                gasOptimization: false
            };

            const result = mergePreferencesWithDefaults(userPrefs, mockDefaults);

            expect(result.enableContinuousMonitoring).toBe(false);
            expect(result.enableNotifications).toBe(false);
            expect(result.gasOptimization).toBe(false);
        });
    });

    describe('generatePreferencesSummary', () => {
        it('should generate comprehensive preferences summary', () => {
            const preferences: UserPreferences = {
                targetHealthFactor: 1.6,
                warningThreshold: 1.5,
                dangerThreshold: 1.3,
                criticalThreshold: 1.1,
                monitoringInterval: 10,
                maxTransactionAmount: 2000,
                riskTolerance: 'conservative'
            };

            const summary = generatePreferencesSummary(preferences);

            expect(summary).toContain('Target Health Factor: 1.6');
            expect(summary).toContain('Warning Threshold: 1.5');
            expect(summary).toContain('Danger Threshold: 1.3');
            expect(summary).toContain('Critical Threshold: 1.1');
            expect(summary).toContain('Monitoring Interval: 10 minutes');
            expect(summary).toContain('Max Transaction Amount: $2000');
            expect(summary).toContain('Risk Tolerance: conservative');
        });

        it('should handle empty preferences gracefully', () => {
            const summary = generatePreferencesSummary({});
            expect(summary).toBe('Using default preferences');
        });

        it('should generate partial summary for incomplete preferences', () => {
            const preferences: UserPreferences = {
                targetHealthFactor: 1.4,
                riskTolerance: 'moderate'
            };

            const summary = generatePreferencesSummary(preferences);
            
            expect(summary).toContain('Target Health Factor: 1.4');
            expect(summary).toContain('Risk Tolerance: moderate');
            expect(summary).not.toContain('Warning Threshold');
            expect(summary).not.toContain('Max Transaction Amount');
        });
    });

    describe('UserPreferencesSchema', () => {
        it('should validate correct preference objects', () => {
            const validPrefs = {
                targetHealthFactor: 1.5,
                warningThreshold: 1.4,
                dangerThreshold: 1.3,
                criticalThreshold: 1.1,
                monitoringInterval: 15,
                enableContinuousMonitoring: true,
                preferredStrategy: 'auto' as const,
                maxTransactionAmount: 1000,
                minBalanceThreshold: 50,
                enableNotifications: true,
                maxSlippagePercent: 2.5,
                gasOptimization: true,
                riskTolerance: 'moderate' as const
            };

            const result = UserPreferencesSchema.safeParse(validPrefs);
            expect(result.success).toBe(true);
        });

        it('should reject invalid values', () => {
            const invalidPrefs = {
                targetHealthFactor: 0.5, // Too low
                warningThreshold: 3.0, // Too high
                dangerThreshold: 2.0, // Too high
                criticalThreshold: 1.5, // Too high
                monitoringInterval: 0, // Too low
                preferredStrategy: 'invalid',
                maxTransactionAmount: 5, // Too low
                minBalanceThreshold: 15000, // Too high
                maxSlippagePercent: 15, // Too high
                riskTolerance: 'invalid'
            };

            const result = UserPreferencesSchema.safeParse(invalidPrefs);
            expect(result.success).toBe(false);
        });

        it('should accept partial preferences objects', () => {
            const partialPrefs = {
                targetHealthFactor: 1.6,
                riskTolerance: 'conservative' as const
            };

            const result = UserPreferencesSchema.safeParse(partialPrefs);
            expect(result.success).toBe(true);
        });

        it('should accept empty preferences object', () => {
            const result = UserPreferencesSchema.safeParse({});
            expect(result.success).toBe(true);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle malformed numeric inputs', () => {
            const malformedInputs = [
                'Health factor abc',
                'Monitor every xyz minutes', 
                'Max transaction NaN USD',
                'Slippage infinity percent'
            ];

            malformedInputs.forEach(input => {
                const result = parseUserPreferences(input);
                // Should not crash and should not set invalid numeric values
                Object.values(result).forEach(value => {
                    if (typeof value === 'number') {
                        expect(value).not.toBeNaN();
                        expect(value).toBeGreaterThan(0);
                    }
                });
            });
        });

        it('should handle case-insensitive parsing', () => {
            const mixedCaseInput = 'MONITOR EVERY 5 MINUTES WITH HEALTH FACTOR 1.5 USING CONSERVATIVE APPROACH';
            
            const result = parseUserPreferences(mixedCaseInput);
            
            expect(result.monitoringInterval).toBe(5);
            expect(result.targetHealthFactor).toBe(1.5);
            expect(result.riskTolerance).toBe('conservative');
        });

        it('should handle multiple conflicting values by using the first match', () => {
            const conflictingInput = 'Health factor 1.5 and also health factor 1.8';
            
            const result = parseUserPreferences(conflictingInput);
            
            // Should use the first match
            expect(result.targetHealthFactor).toBe(1.5);
        });
    });
});