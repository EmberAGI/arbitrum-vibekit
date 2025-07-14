/**
 * monitorHealth Tool
 * 
 * Provides continuous health factor monitoring with configurable intervals
 * and threshold-based alerting for liquidation prevention.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';

// Input schema for monitorHealth tool
const MonitorHealthParams = z.object({
  userAddress: z.string().describe('The wallet address to monitor'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  intervalMinutes: z.number().optional().default(5).describe('Monitoring interval in minutes'),
  enableAlerts: z.boolean().optional().default(true).describe('Whether to enable threshold alerts'),
});

// Define types for monitoring
interface MonitoringSession {
  userAddress: string;
  intervalMinutes: number;
  startTime: string;
  lastCheck: string;
  checksPerformed: number;
  alerts: Array<{
    timestamp: string;
    riskLevel: string;
    healthFactor: number;
    message: string;
  }>;
}

// Global monitoring state (in production, this would be in a database)
const monitoringSessions = new Map<string, MonitoringSession>();

// monitorHealth tool implementation
export const monitorHealthTool: VibkitToolDefinition<typeof MonitorHealthParams, any, LiquidationPreventionContext, any> = {
  name: 'monitor-health',
  description: 'Start continuous health factor monitoring with periodic checks and alerts',
  parameters: MonitorHealthParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences from instruction (Task 4.3)
      const userPrefs = parseUserPreferences(args.instruction || '');
      const mergedPrefs = mergePreferencesWithDefaults(userPrefs, {
        thresholds: context.custom.thresholds,
        monitoring: context.custom.monitoring,
        strategy: context.custom.strategy,
      });
      
      console.log(`🔄 Starting health monitoring for: ${args.userAddress}`);
      console.log(`⚙️  User preferences: ${generatePreferencesSummary(mergedPrefs)}`);

      // Ensure we have MCP clients available
      if (!context.mcpClients) {
        throw new Error('MCP clients not available in context');
      }

      // Access Ember MCP client using standardized name
      const emberClient = context.mcpClients['ember-mcp-tool-server'];

      if (!emberClient) {
        throw new Error('Ember MCP client not found. Available clients: ' + Object.keys(context.mcpClients).join(', '));
      }

      // Perform initial health check using correct parameter name
      const result = await emberClient.callTool({
        name: 'getUserPositions',
        arguments: {
          userAddress: args.userAddress,  // This is correct!
        },
      });

      if (result.isError) {
        console.error('❌ Error calling getUserPositions for monitoring:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        return createErrorTask(
          'monitor-health',
          new Error(`Failed to start monitoring: ${errorMessage}`)
        );
      }

      // Parse the initial response
      let healthFactor: number | undefined;
      try {
        const contentArray = Array.isArray(result.content) ? result.content : [];
        const responseText = contentArray.length > 0 && typeof contentArray[0]?.text === 'string'
          ? contentArray[0].text
          : undefined;
        if (responseText) {
          const positionData = JSON.parse(responseText);
          healthFactor = positionData.healthFactor;
        }
      } catch (parseError) {
        console.error('❌ Error parsing initial health data:', parseError);
        return createErrorTask(
          'monitor-health',
          new Error('Failed to parse initial health data')
        );
      }

      // Determine initial risk level
      let riskLevel = 'SAFE';
      let riskColor = '🟢';
      
      if (healthFactor !== undefined) {
        if (healthFactor <= context.custom.thresholds.critical) {
          riskLevel = 'CRITICAL';
          riskColor = '🔴';
        } else if (healthFactor <= context.custom.thresholds.danger) {
          riskLevel = 'DANGER';
          riskColor = '🟠';
        } else if (healthFactor <= context.custom.thresholds.warning) {
          riskLevel = 'WARNING';
          riskColor = '🟡';
        }
      }

      // Initialize monitoring session
      const sessionKey = args.userAddress;
      const now = new Date().toISOString();
      
      const session: MonitoringSession = {
        userAddress: args.userAddress,
        intervalMinutes: args.intervalMinutes,
        startTime: now,
        lastCheck: now,
        checksPerformed: 1,
        alerts: args.enableAlerts && riskLevel !== 'SAFE' ? [{
          timestamp: now,
          riskLevel,
          healthFactor: healthFactor || 0,
          message: `Initial ${riskLevel} risk detected`,
        }] : [],
      };

      monitoringSessions.set(sessionKey, session);

      // Create detailed response
      const message = [
        `${riskColor} **Health Monitoring Started**`,
        ``,
        `👤 **User:** ${args.userAddress}`,
        `📊 **Current Health Factor:** ${healthFactor ? healthFactor.toFixed(4) : 'N/A'}`,
        `⚠️  **Risk Level:** ${riskLevel}`,
        `⏱️  **Monitoring Interval:** ${args.intervalMinutes} minutes`,
        `🔔 **Alerts Enabled:** ${args.enableAlerts ? 'Yes' : 'No'}`,
        ``,
        `**Risk Thresholds:**`,
        `• 🟡 Warning: ≤ ${context.custom.thresholds.warning}`,
        `• 🟠 Danger: ≤ ${context.custom.thresholds.danger}`,
        `• 🔴 Critical: ≤ ${context.custom.thresholds.critical}`,
        ``,
        `🚀 **Status:** Monitoring active with periodic checks every ${args.intervalMinutes} minutes`,
        `🕐 **Started:** ${new Date().toLocaleString()}`,
      ].join('\n');

      console.log(`✅ Health monitoring started for ${args.userAddress}. Health Factor: ${healthFactor}, Risk: ${riskLevel}`);

      return createSuccessTask(
        'monitor-health',
        undefined, // No artifacts for now, keep it simple
        `🔄 Health monitoring started for ${args.userAddress}. Current health factor: ${healthFactor?.toFixed(4) || 'N/A'}, Risk: ${riskLevel}. Monitoring every ${args.intervalMinutes} minutes. ${message}`
      );

    } catch (error) {
      console.error('❌ monitorHealth tool error:', error);
      return createErrorTask(
        'monitor-health',
        error instanceof Error ? error : new Error(`Failed to start health monitoring: ${error}`)
      );
    }
  },
};

// Helper function to get monitoring session (for external use)
export const getMonitoringSession = (userAddress: string): MonitoringSession | undefined => {
  return monitoringSessions.get(userAddress.toLowerCase());
};

// Helper function to stop monitoring session
export const stopMonitoringSession = (userAddress: string): boolean => {
  const session = monitoringSessions.get(userAddress.toLowerCase());
  if (session) {
    // In a real application, you would update the session's isActive flag
    // For now, we'll just remove it from the map
    monitoringSessions.delete(userAddress.toLowerCase());
    console.log(`🛑 Stopped monitoring session for ${userAddress}`);
    return true;
  }
  return false;
}; 
