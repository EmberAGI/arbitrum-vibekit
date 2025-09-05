/**
 * User Preferences Parser
 * 
 * Simplified version that extracts only the essential preferences from user instructions.
 * Only includes properties that are actually used in the business logic.
 */

import { z } from 'zod';

// Simplified user preferences interface - only properties actually used
export interface UserPreferences {
  targetHealthFactor?: number;
  intervalMinutes?: number;
  thresholds?: {
    warning?: number;
    danger?: number;
    critical?: number;
  };
}

// Context defaults interface (used for merging)
export interface ContextDefaults {
  thresholds?: {
    warning: number;
    danger: number;
    critical: number;
  };
  monitoring?: {
    intervalMinutes: number;
  };
  strategy?: {
    targetHealthFactor: number;
  };
  targetHealthFactor?: number;
}

/**
 * Parse user preferences from natural language instruction
 * Only extracts properties that are actually used in business logic
 */
export function parseUserPreferences(instruction: string): UserPreferences {
  const lowerInstruction = instruction.toLowerCase();
  const preferences: UserPreferences = {};

  // Extract target health factor (used in intelligentPreventionStrategy, monitorHealth)
  const healthFactorMatches = [
    /target.*health.*factor.*?(\d+(?:\.\d+)?)/i,
    /health.*factor.*?(\d+(?:\.\d+)?)/i,
    /hf.*?(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of healthFactorMatches) {
    const match = instruction.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      if (value > 0 && value <= 10) { // Reasonable bounds for health factor
        preferences.targetHealthFactor = value;
        break;
      }
    }
  }

  // Extract monitoring interval (used in monitorHealth)
  const intervalMatches = [
    /(?:every|check.*?every|interval.*?of).*?(\d+).*?minute/i,
    /(\d+).*?minute.*?interval/i,
    /monitor.*?(\d+).*?minute/i,
  ];

  for (const pattern of intervalMatches) {
    const match = instruction.match(pattern);
    if (match && match[1]) {
      const value = parseInt(match[1]);
      if (value > 0 && value <= 1440) { // Max 24 hours
        preferences.intervalMinutes = value;
        break;
      }
    }
  }

  // Extract threshold preferences (used for risk assessment)
  const thresholds: UserPreferences['thresholds'] = {};

  // Warning threshold
  const warningMatch = instruction.match(/warning.*?(?:threshold|factor).*?(\d+(?:\.\d+)?)/i);
  if (warningMatch && warningMatch[1]) {
    const value = parseFloat(warningMatch[1]);
    if (value > 0 && value <= 10) {
      thresholds.warning = value;
    }
  }

  // Danger threshold  
  const dangerMatch = instruction.match(/danger.*?(?:threshold|factor).*?(\d+(?:\.\d+)?)/i);
  if (dangerMatch && dangerMatch[1]) {
    const value = parseFloat(dangerMatch[1]);
    if (value > 0 && value <= 10) {
      thresholds.danger = value;
    }
  }

  // Critical threshold
  const criticalMatch = instruction.match(/critical.*?(?:threshold|factor).*?(\d+(?:\.\d+)?)/i);
  if (criticalMatch && criticalMatch[1]) {
    const value = parseFloat(criticalMatch[1]);
    if (value > 0 && value <= 10) {
      thresholds.critical = value;
    }
  }

  // Only set thresholds if at least one was found
  if (Object.keys(thresholds).length > 0) {
    preferences.thresholds = thresholds;
  }

  return preferences;
}

/**
 * Merge user preferences with context defaults
 */
export function mergePreferencesWithDefaults(
  userPrefs: UserPreferences,
  defaults: ContextDefaults
): UserPreferences {
  return {
    targetHealthFactor: userPrefs.targetHealthFactor
      || defaults.strategy?.targetHealthFactor
      || defaults.targetHealthFactor
      || 1.03,
    intervalMinutes: userPrefs.intervalMinutes
      || defaults.monitoring?.intervalMinutes
      || 15,
    thresholds: {
      warning: userPrefs.thresholds?.warning || defaults.thresholds?.warning || 2.0,
      danger: userPrefs.thresholds?.danger || defaults.thresholds?.danger || 1.5,
      critical: userPrefs.thresholds?.critical || defaults.thresholds?.critical || 1.1,
    },
  };
}

/**
 * Generate a concise summary of user preferences for logging
 */
export function generatePreferencesSummary(preferences: UserPreferences): string {
  const parts: string[] = [];

  if (preferences.targetHealthFactor) {
    parts.push(`Target HF: ${preferences.targetHealthFactor}`);
  }

  if (preferences.intervalMinutes) {
    parts.push(`Interval: ${preferences.intervalMinutes}min`);
  }

  if (preferences.thresholds) {
    const thresholdParts: string[] = [];
    if (preferences.thresholds.warning) thresholdParts.push(`warn:${preferences.thresholds.warning}`);
    if (preferences.thresholds.danger) thresholdParts.push(`danger:${preferences.thresholds.danger}`);
    if (preferences.thresholds.critical) thresholdParts.push(`crit:${preferences.thresholds.critical}`);

    if (thresholdParts.length > 0) {
      parts.push(`Thresholds: ${thresholdParts.join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join(' | ') : 'Using defaults';
} 
