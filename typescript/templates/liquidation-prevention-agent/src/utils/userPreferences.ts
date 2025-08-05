/**
 * User Preferences Parser
 * 
 * Extracts user preferences and configuration from natural language instructions
 * for Task 4.3: Add user preference parsing from initial instructions
 */

import { z } from 'zod';

export interface UserPreferences {
  // Health factor preferences
  targetHealthFactor?: number;
  warningThreshold?: number;
  dangerThreshold?: number;
  criticalThreshold?: number;

  // Monitoring preferences
  monitoringInterval?: number; // in minutes
  enableContinuousMonitoring?: boolean;

  // Strategy preferences
  preferredStrategy?: 'auto' | '1' | '2' | '3';
  maxTransactionAmount?: number; // in USD
  minBalanceThreshold?: number; // in USD

  // Safety preferences
  enableNotifications?: boolean;
  maxSlippagePercent?: number;
  gasOptimization?: boolean;

  // Risk tolerance
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
}

// Schema for validating extracted preferences
export const UserPreferencesSchema = z.object({
  targetHealthFactor: z.number().min(1.0).max(2.0).optional(),
  warningThreshold: z.number().min(1.0).max(2.0).optional(),
  dangerThreshold: z.number().min(1.0).max(1.5).optional(),
  criticalThreshold: z.number().min(1.0).max(1.2).optional(),
  monitoringInterval: z.number().min(1).max(1440).optional(), // 1 minute to 24 hours
  enableContinuousMonitoring: z.boolean().optional(),
  preferredStrategy: z.enum(['auto', '1', '2', '3']).optional(),
  maxTransactionAmount: z.number().min(10).max(100000).optional(),
  minBalanceThreshold: z.number().min(1).max(10000).optional(),
  enableNotifications: z.boolean().optional(),
  maxSlippagePercent: z.number().min(0.1).max(10).optional(),
  gasOptimization: z.boolean().optional(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
});

/**
 * Parse user preferences from natural language instruction
 */
export function parseUserPreferences(instruction: string): UserPreferences {
  const preferences: UserPreferences = {};
  const lowerInstruction = instruction.toLowerCase();

  // Health factor preferences
  const hfMatch = lowerInstruction.match(/health factor.*?(\d+\.?\d*)/i);
  if (hfMatch && hfMatch[1]) {
    const value = parseFloat(hfMatch[1]);
    if (value >= 1.0 && value <= 2.0) {
      preferences.targetHealthFactor = value;
    }
  }

  // Warning threshold
  const warningMatch = lowerInstruction.match(/warning.*?(\d+\.?\d*)/i);
  if (warningMatch && warningMatch[1]) {
    const value = parseFloat(warningMatch[1]);
    if (value >= 1.0 && value <= 2.0) {
      preferences.warningThreshold = value;
    }
  }

  // Danger threshold
  const dangerMatch = lowerInstruction.match(/danger.*?(\d+\.?\d*)/i);
  if (dangerMatch && dangerMatch[1]) {
    const value = parseFloat(dangerMatch[1]);
    if (value >= 1.0 && value <= 1.5) {
      preferences.dangerThreshold = value;
    }
  }

  // Critical threshold
  const criticalMatch = lowerInstruction.match(/critical.*?(\d+\.?\d*)/i);
  if (criticalMatch && criticalMatch[1]) {
    const value = parseFloat(criticalMatch[1]);
    if (value >= 1.0 && value <= 1.2) {
      preferences.criticalThreshold = value;
    }
  }

  // Monitoring interval
  const intervalMatch = lowerInstruction.match(/(\d+)\s*(min|minute|hour|hr)/i);
  if (intervalMatch && intervalMatch[1] && intervalMatch[2]) {
    const value = parseInt(intervalMatch[1]);
    const unit = intervalMatch[2].toLowerCase();
    if (unit.includes('hour') || unit.includes('hr')) {
      preferences.monitoringInterval = value * 60; // Convert to minutes
    } else {
      preferences.monitoringInterval = value;
    }
  }

  // Continuous monitoring
  if (lowerInstruction.includes('continuous') || lowerInstruction.includes('monitor continuously')) {
    preferences.enableContinuousMonitoring = true;
  }

  // Transaction amount limits
  const amountMatch = lowerInstruction.match(/(\d+)\s*(usd|dollar)/i);
  if (amountMatch && amountMatch[1]) {
    const value = parseFloat(amountMatch[1]);
    if (value >= 10 && value <= 100000) {
      preferences.maxTransactionAmount = value;
    }
  }

  // Balance thresholds
  const balanceMatch = lowerInstruction.match(/min.*?(\d+)\s*(usd|dollar)/i);
  if (balanceMatch && balanceMatch[1]) {
    const value = parseFloat(balanceMatch[1]);
    if (value >= 1 && value <= 10000) {
      preferences.minBalanceThreshold = value;
    }
  }

  // Notifications
  if (lowerInstruction.includes('notify') || lowerInstruction.includes('alert') || lowerInstruction.includes('notification')) {
    preferences.enableNotifications = true;
  }

  // Slippage
  const slippageMatch = lowerInstruction.match(/(\d+\.?\d*)\s*%?\s*slippage/i);
  if (slippageMatch && slippageMatch[1]) {
    const value = parseFloat(slippageMatch[1]);
    if (value >= 0.1 && value <= 10) {
      preferences.maxSlippagePercent = value;
    }
  }

  // Gas optimization
  if (lowerInstruction.includes('gas') && (lowerInstruction.includes('optimize') || lowerInstruction.includes('save'))) {
    preferences.gasOptimization = true;
  }

  // Risk tolerance
  if (lowerInstruction.includes('conservative') || lowerInstruction.includes('safe')) {
    preferences.riskTolerance = 'conservative';
  } else if (lowerInstruction.includes('aggressive') || lowerInstruction.includes('risky')) {
    preferences.riskTolerance = 'aggressive';
  } else if (lowerInstruction.includes('moderate') || lowerInstruction.includes('balanced')) {
    preferences.riskTolerance = 'moderate';
  }

  return preferences;
}

/**
 * Merge user preferences with default configuration
 */
export function mergePreferencesWithDefaults(
  userPrefs: UserPreferences,
  defaults: {
    thresholds: { warning: number; danger: number; critical: number };
    monitoring: { intervalMs: number };
    strategy: { default: string; maxTransactionUsd: number; minSupplyBalanceUsd: number };
    targetHealthFactor?: number;
  }
): UserPreferences {
  return {
    // Apply user preferences with defaults as fallback
    targetHealthFactor: userPrefs.targetHealthFactor || defaults.targetHealthFactor || 1.03,
    warningThreshold: userPrefs.warningThreshold || defaults.thresholds.warning,
    dangerThreshold: userPrefs.dangerThreshold || defaults.thresholds.danger,
    criticalThreshold: userPrefs.criticalThreshold || defaults.thresholds.critical,
    monitoringInterval: userPrefs.monitoringInterval || Math.floor(defaults.monitoring.intervalMs / 60000), // Convert ms to minutes
    enableContinuousMonitoring: userPrefs.enableContinuousMonitoring ?? true,
    maxTransactionAmount: userPrefs.maxTransactionAmount || defaults.strategy.maxTransactionUsd,
    minBalanceThreshold: userPrefs.minBalanceThreshold || defaults.strategy.minSupplyBalanceUsd,
    enableNotifications: userPrefs.enableNotifications ?? true,
    maxSlippagePercent: userPrefs.maxSlippagePercent || 2.0,
    gasOptimization: userPrefs.gasOptimization ?? true,
    riskTolerance: userPrefs.riskTolerance || 'moderate',
  };
}

/**
 * Generate a summary of parsed preferences
 */
export function generatePreferencesSummary(preferences: UserPreferences): string {
  const summary: string[] = [];

  if (preferences.targetHealthFactor) {
    summary.push(`Target Health Factor: ${preferences.targetHealthFactor}`);
  }
  if (preferences.warningThreshold) {
    summary.push(`Warning Threshold: ${preferences.warningThreshold}`);
  }
  if (preferences.dangerThreshold) {
    summary.push(`Danger Threshold: ${preferences.dangerThreshold}`);
  }
  if (preferences.criticalThreshold) {
    summary.push(`Critical Threshold: ${preferences.criticalThreshold}`);
  }
  if (preferences.monitoringInterval) {
    summary.push(`Monitoring Interval: ${preferences.monitoringInterval} minutes`);
  }
  if (preferences.maxTransactionAmount) {
    summary.push(`Max Transaction Amount: $${preferences.maxTransactionAmount}`);
  }
  if (preferences.riskTolerance) {
    summary.push(`Risk Tolerance: ${preferences.riskTolerance}`);
  }

  return summary.length > 0 ? summary.join(', ') : 'Using default preferences';
} 
