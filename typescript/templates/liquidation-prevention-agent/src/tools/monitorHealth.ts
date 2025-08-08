/**
 * monitorHealth Tool
 * 
 * Provides continuous health factor monitoring with configurable intervals
 * and threshold-based alerting for liquidation prevention.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { GetWalletLendingPositionsResponseSchema } from 'ember-schemas';
import type { LiquidationPreventionContext, MonitoringSession } from '../context/types.js';
import { parseUserPreferences } from '../utils/userPreferences.js';

// Input schema for monitorHealth tool
const MonitorHealthParams = z.object({
  userAddress: z.string().describe('The wallet address to monitor'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  intervalMinutes: z.number().optional().default(1).describe('Monitoring interval in minutes'),
  enableAlerts: z.boolean().optional().default(true).describe('Whether to enable threshold alerts'),
});

// MonitoringSession interface is imported from '../context/types.js'

// Global monitoring state (in production, this would be in a database)
const monitoringSessions = new Map<string, MonitoringSession>();

// Store the MCP client and context for use in background monitoring
let globalMcpClient: any = null;
let globalContext: LiquidationPreventionContext | null = null;

// Background monitoring function
async function performHealthCheck(userAddress: string): Promise<void> {
  const session = monitoringSessions.get(userAddress);
  if (!session || !session.isActive || !globalMcpClient || !globalContext) {
    console.log(`❌ Monitoring session not found or inactive for ${userAddress}`);
    return;
  }

  try {
    console.log(`🔄 [${new Date().toLocaleTimeString()}] Performing automated health check for ${userAddress}`);
    
    // Get fresh position data using ember MCP client
    const emberClient = globalMcpClient;

    if (!emberClient) {
      console.error(`❌ Ember MCP client not found for ${userAddress}`);
      return;
    }

    console.log(`📡 Fetching lending positions using getWalletLendingPositions for ${userAddress}...`);

    // Get current positions
    const positionsResult = await emberClient.callTool({
      name: 'getWalletLendingPositions',
      arguments: { walletAddress: userAddress },
    });

    if (positionsResult.isError) {
      console.error(`❌ Error fetching positions for ${userAddress}:`, positionsResult.content);
      return;
    }

    // Parse the response using proper schema validation
    const positionData = parseMcpToolResponsePayload(positionsResult, GetWalletLendingPositionsResponseSchema);
    
    // Extract health factor from the standardized response
    const positions = positionData.positions || [];
    const firstPosition = positions[0];
    const currentHealthFactor = firstPosition?.healthFactor ? parseFloat(firstPosition.healthFactor) : undefined;

    console.log(`📥 Retrieved ${positions.length} positions for ${userAddress}`);
    console.log("session.checksPerformed", session.checksPerformed);

    // Update session
    session.lastCheck = new Date().toISOString();
    session.checksPerformed += 1;

    console.log(`📊 Health Factor for ${userAddress}: ${currentHealthFactor?.toFixed(4) || 'N/A'}, Target: ${session.targetHealthFactor}`);

    // Check if action is needed
    if (currentHealthFactor && currentHealthFactor <= session.targetHealthFactor) {
      console.log(`🚨 LIQUIDATION RISK DETECTED! Health Factor ${currentHealthFactor.toFixed(4)} ≤ ${session.targetHealthFactor}`);
      
      // Add alert
      session.alerts.push({
        timestamp: new Date().toISOString(),
        riskLevel: 'CRITICAL',
        healthFactor: currentHealthFactor,
        message: `Automatic prevention triggered - HF: ${currentHealthFactor.toFixed(4)} ≤ ${session.targetHealthFactor}`,
      });

      console.log(`⚠️ Triggering automatic prevention strategy for ${userAddress}`);

      // Trigger automatic prevention
      await triggerAutomaticPrevention(userAddress, currentHealthFactor, session.targetHealthFactor);
    } else {
      console.log(`✅ Health Factor OK for ${userAddress}: ${currentHealthFactor?.toFixed(4)} > ${session.targetHealthFactor}`);
    }
    const nextRun = new Date(Date.now() + session.intervalMinutes * 60 * 1000);
    console.log(`🛠️ Health check completed for ${userAddress}. Total checks: ${session.checksPerformed}`);
    console.log(`⏭️ Next health check for ${userAddress} scheduled at: ${nextRun.toLocaleString()}`);

  } catch (error) {
    console.error(`❌ Error during health check for ${userAddress}:`, error);
  }
}

// Trigger automatic prevention
async function triggerAutomaticPrevention(userAddress: string, currentHF: number, targetHF: number): Promise<void> {
  
  console.log("triggerAutomaticPrevention........:", userAddress, currentHF, targetHF);
  if (!globalMcpClient || !globalContext) {
    console.error('❌ MCP client or context not available for automatic prevention');
    return;
  }

  try {
    console.log(`⚡ EXECUTING AUTOMATIC LIQUIDATION PREVENTION for ${userAddress}`);
    console.log(`📊 Current HF: ${currentHF.toFixed(4)}, Target HF: ${targetHF}`);

    // Import the intelligent prevention strategy tool dynamically
    const { intelligentPreventionStrategyTool } = await import('./intelligentPreventionStrategy.js');
    
    // Execute the prevention strategy
    const result = await intelligentPreventionStrategyTool.execute(
      {
        userAddress,
        targetHealthFactor: targetHF,
        instruction: `Automatic prevention triggered - current HF: ${currentHF.toFixed(4)}, target: ${targetHF}`,
        chainId: '42161', // Default to Arbitrum
      },
      {
        custom: {
          ...globalContext,
          mcpClient: globalMcpClient,
        },
      }
    );

    if (result.status?.state === 'completed') {
      console.log(`✅ Automatic prevention executed successfully for ${userAddress}`);
    } else {
      console.error(`❌ Automatic prevention failed for ${userAddress}:`, result);
    }

  } catch (error) {
    console.error(`❌ Error executing automatic prevention for ${userAddress}:`, error);
  }
}

// monitorHealth tool implementation
export const monitorHealthTool: VibkitToolDefinition<typeof MonitorHealthParams, any, LiquidationPreventionContext, any> = {
  name: 'monitor-health',
  description: 'Start continuous health factor monitoring with periodic checks and automatic liquidation prevention',
  parameters: MonitorHealthParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences for targetHealthFactor and intervalMinutes
      const userPrefs = parseUserPreferences(args.instruction || '');
      
      const targetHF = userPrefs.targetHealthFactor || 1.03;
      console.log(`🔄 Starting health monitoring for: ${args.userAddress}`);
      if (userPrefs.targetHealthFactor) {
        console.log(`🎯 User specified Target Health Factor: ${userPrefs.targetHealthFactor}`);
      }
      if (userPrefs.intervalMinutes) {
        console.log(`⏱️ User specified Interval: ${userPrefs.intervalMinutes} minutes`);
      }
      console.log(`🎯 Target Health Factor: ${targetHF} (action will be triggered if HF ≤ ${targetHF})`);

      // Access Ember MCP client from custom context
      const emberClient = context.custom.mcpClient;

      if (!emberClient) {
        throw new Error('Ember MCP client not found in context');
      }

      // Store global references for background monitoring
      globalMcpClient = emberClient;
      globalContext = context.custom;

      // Stop existing monitoring session if any
      const existingSession = monitoringSessions.get(args.userAddress);
      if (existingSession?.timerId) {
        clearInterval(existingSession.timerId);
        console.log(`🛑 Stopped existing monitoring session for ${args.userAddress}`);
      }

      // Perform initial health check
      const result = await emberClient.callTool({
        name: 'getWalletLendingPositions',
        arguments: {
          walletAddress: args.userAddress,
        },
      });

      console.log("getWalletLendingPositions result", result);
      if (result.isError) {
        console.error('❌ Error calling getWalletLendingPositions for monitoring:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        return createErrorTask(
          'monitor-health',
          new Error(`Failed to start monitoring: ${errorMessage}`)
        );
      }

      // Parse the initial response using proper schema validation
      let healthFactor: number | undefined;
      try {
        const positionData = parseMcpToolResponsePayload(result, GetWalletLendingPositionsResponseSchema);
        
        // Extract health factor from the standardized response
        const positions = positionData.positions || [];
        const firstPosition = positions[0];
        healthFactor = firstPosition?.healthFactor ? parseFloat(firstPosition.healthFactor) : undefined;
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
        if (healthFactor <= targetHF) {
          riskLevel = 'CRITICAL';
          riskColor = '🔴';
          console.log(`🚨 IMMEDIATE ACTION NEEDED: Health Factor ${healthFactor.toFixed(4)} ≤ ${targetHF}`);
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
        isActive: true,
        targetHealthFactor: targetHF,
        alerts: args.enableAlerts && riskLevel !== 'SAFE' ? [{
          timestamp: now,
          riskLevel,
          healthFactor: healthFactor || 0,
          message: `Initial ${riskLevel} risk detected`,
        }] : [],
      };

      // Set up periodic monitoring with setInterval
      const intervalMs = args.intervalMinutes * 60 * 1000; // Convert minutes to milliseconds
      session.timerId = setInterval(() => {
        performHealthCheck(args.userAddress);
      }, intervalMs);

      monitoringSessions.set(sessionKey, session);

      console.log(`✅ Automatic monitoring started for ${args.userAddress}`);
      console.log(`⏰ Will check every ${args.intervalMinutes} minutes (${intervalMs}ms)`);
      console.log(`🎯 Will trigger prevention if Health Factor ≤ ${targetHF}`);

      // If already at risk, trigger immediate action
      if (healthFactor && healthFactor <= targetHF) {
        console.log(`🚨 Immediate prevention needed - triggering now!`);
        setTimeout(() => triggerAutomaticPrevention(args.userAddress, healthFactor, targetHF), 1000);
      }

      // Create detailed response
      const message = [
        `${riskColor} **Automatic Liquidation Prevention Started**`,
        ``,
        `👤 **User:** ${args.userAddress}`,
        `📊 **Current Health Factor:** ${healthFactor ? healthFactor.toFixed(4) : 'N/A'}`,
        `🎯 **Target Health Factor:** ${targetHF} (prevention triggers if HF ≤ ${targetHF})`,
        `⚠️  **Risk Level:** ${riskLevel}`,
        `⏱️  **Check Interval:** ${args.intervalMinutes} minutes`,
        `🤖 **Auto-Prevention:** ${healthFactor && healthFactor <= targetHF ? 'TRIGGERING NOW' : 'Armed and ready'}`,
        ``,
        `**How it works:**`,
        `• Checks your health factor every ${args.intervalMinutes} minutes`,
        `• If HF drops to ${targetHF} or below, automatically prevents liquidation`,
        `• Uses intelligent strategy selection (supply collateral, repay debt, or both)`,
        `• Runs continuously in the background`,
        ``,
        `🚀 **Status:** Active monitoring with automatic protection`,
        `🕐 **Started:** ${new Date().toLocaleString()}`,
      ].join('\n');

      return createSuccessTask(
        'monitor-health',
        undefined,
        `🤖 Automatic liquidation prevention activated! Monitoring ${args.userAddress} every ${args.intervalMinutes} minutes. Will prevent liquidation if health factor ≤ ${targetHF}. Current HF: ${healthFactor?.toFixed(4) || 'N/A'}. ${message}`
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
  return monitoringSessions.get(userAddress);
};

// Helper function to stop monitoring session
export const stopMonitoringSession = (userAddress: string): boolean => {
  const session = monitoringSessions.get(userAddress);
  if (session) {
    if (session.timerId) {
      clearInterval(session.timerId);
      console.log(`⏰ Cleared timer for ${userAddress}`);
    }
    session.isActive = false;
    monitoringSessions.delete(userAddress);
    console.log(`🛑 Stopped monitoring session for ${userAddress}`);
    return true;
  }
  return false;
};

// Helper function to stop all monitoring sessions (for graceful shutdown)
export const stopAllMonitoringSessions = (): number => {
  let stoppedCount = 0;
  for (const [userAddress, session] of monitoringSessions.entries()) {
    if (session.timerId) {
      clearInterval(session.timerId);
    }
    session.isActive = false;
    stoppedCount++;
  }
  monitoringSessions.clear();
  return stoppedCount;
}; 
