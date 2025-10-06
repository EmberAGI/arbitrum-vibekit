import { z } from 'zod';
import {
  defineSkill,
  createSuccessTask,
  createErrorTask,
  createArtifact,
  VibkitError,
} from 'arbitrum-vibekit-core';
import type { VibkitToolDefinition, AgentContext } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import { PassiveModeTask } from '../tasks/PassiveModeTask.js';
import { ActiveModeTask } from '../tasks/ActiveModeTask.js';
import { OperatingMode } from '../config/types.js';

// Input schema for the monitoring skill
export const monitoringSkillInputSchema = z.object({
  action: z.enum(['start', 'stop', 'status']).describe('Monitoring action to perform'),
  mode: z
    .nativeEnum(OperatingMode)
    .optional()
    .describe('Operating mode (passive or active) - only required for start action'),
});

type MonitoringSkillInput = z.infer<typeof monitoringSkillInputSchema>;

// Global task storage (in production, this would be persisted)
let currentTask: PassiveModeTask | ActiveModeTask | null = null;

/**
 * Start monitoring tool
 */
const startMonitoringTool: VibkitToolDefinition<
  typeof monitoringSkillInputSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'startMonitoring',
  description: 'Start automated LP position monitoring and rebalancing',
  parameters: monitoringSkillInputSchema,

  execute: async (params: MonitoringSkillInput, context: AgentContext<RebalancerContext>) => {
    try {
      if (params.action !== 'start') {
        return createErrorTask(
          'startMonitoring',
          new VibkitError('INVALID_ACTION', 400, 'This tool only handles start action')
        );
      }

      if (currentTask && currentTask.getStatus().state === 'working') {
        const artifact = createArtifact(
          [
            {
              kind: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  message: 'Monitoring is already active',
                  taskId: currentTask.id,
                },
                null,
                2
              ),
            },
          ],
          'Monitoring Status',
          'Current monitoring status'
        );
        return createSuccessTask('startMonitoring', [artifact]);
      }

      // Determine mode (use parameter or config default)
      const mode = params.mode || context.custom.config.mode;

      // Create appropriate task
      if (mode === OperatingMode.PASSIVE) {
        currentTask = new PassiveModeTask(context.custom);
      } else {
        currentTask = new ActiveModeTask(context.custom);
      }

      // Start the task
      currentTask.start();

      console.log(`✅ Started ${mode} monitoring (Task ID: ${currentTask.id})`);

      const artifact = createArtifact(
        [
          {
            kind: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `${mode} monitoring started successfully`,
                taskId: currentTask.id,
              },
              null,
              2
            ),
          },
        ],
        'Monitoring Started',
        `${mode} monitoring started successfully`
      );
      return createSuccessTask('startMonitoring', [artifact]);
    } catch (error) {
      console.error('❌ Error starting monitoring:', error);
      return createErrorTask(
        'startMonitoring',
        new VibkitError('MONITORING_ERROR', 500, `Failed to start monitoring: ${error}`)
      );
    }
  },
};

/**
 * Stop monitoring tool
 */
const stopMonitoringTool: VibkitToolDefinition<
  typeof monitoringSkillInputSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'stopMonitoring',
  description: 'Stop automated LP position monitoring',
  parameters: monitoringSkillInputSchema,

  execute: async (params: MonitoringSkillInput, context: AgentContext<RebalancerContext>) => {
    try {
      if (params.action !== 'stop') {
        return createErrorTask(
          'stopMonitoring',
          new VibkitError('INVALID_ACTION', 400, 'This tool only handles stop action')
        );
      }

      if (!currentTask) {
        const artifact = createArtifact(
          [
            {
              kind: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  message: 'No monitoring task is currently running',
                },
                null,
                2
              ),
            },
          ],
          'Stop Status',
          'No monitoring task running'
        );
        return createSuccessTask('stopMonitoring', [artifact]);
      }

      currentTask.stop();
      const taskType = currentTask.getTaskName();
      currentTask = null;

      console.log('✅ Monitoring stopped');

      const artifact = createArtifact(
        [
          {
            kind: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `${taskType} monitoring stopped successfully`,
              },
              null,
              2
            ),
          },
        ],
        'Monitoring Stopped',
        `${taskType} monitoring stopped successfully`
      );
      return createSuccessTask('stopMonitoring', [artifact]);
    } catch (error) {
      console.error('❌ Error stopping monitoring:', error);
      return createErrorTask(
        'stopMonitoring',
        new VibkitError('MONITORING_ERROR', 500, `Failed to stop monitoring: ${error}`)
      );
    }
  },
};

/**
 * Get monitoring status tool
 */
const getMonitoringStatusTool: VibkitToolDefinition<
  typeof monitoringSkillInputSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'getMonitoringStatus',
  description: 'Get current monitoring status and configuration',
  parameters: monitoringSkillInputSchema,

  execute: async (params: MonitoringSkillInput, context: AgentContext<RebalancerContext>) => {
    try {
      if (params.action !== 'status') {
        return createErrorTask(
          'getMonitoringStatus',
          new VibkitError('INVALID_ACTION', 400, 'This tool only handles status action')
        );
      }

      const status = {
        isActive: context.custom.monitoringState.isActive,
        mode: currentTask ? currentTask.getTaskName() : undefined,
        taskId: context.custom.monitoringState.taskId,
        lastCheck: context.custom.monitoringState.lastCheck?.toISOString(),
        currentPositions: context.custom.monitoringState.currentPositions,
        config: {
          mode: context.custom.config.mode,
          riskProfile: context.custom.config.riskProfile,
          checkInterval: context.custom.config.checkInterval,
          pool: `${context.custom.config.token0}/${context.custom.config.token1}`,
          telegramConfigured: !!context.custom.config.telegramBotToken,
        },
      };

      console.log('📊 Monitoring Status:', status);

      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(status, null, 2) }],
        'Monitoring Status',
        'Current monitoring status and configuration'
      );
      return createSuccessTask('getMonitoringStatus', [artifact]);
    } catch (error) {
      console.error('❌ Error getting monitoring status:', error);
      return createErrorTask(
        'getMonitoringStatus',
        new VibkitError('MONITORING_ERROR', 500, `Failed to get status: ${error}`)
      );
    }
  },
};

/**
 * Monitoring Control Skill
 *
 * Provides control over the automated monitoring and rebalancing system.
 * Supports starting, stopping, and checking status of monitoring tasks.
 */
export const monitoringSkill = defineSkill({
  id: 'monitoring-control',
  name: 'Monitoring Control',
  description: 'Control automated LP position monitoring and rebalancing system',
  tags: ['monitoring', 'automation', 'control', 'rebalancing', 'task-management'],
  examples: [
    'Start monitoring my positions',
    'Stop the monitoring system',
    'What is the monitoring status?',
    'Start passive monitoring',
    'Start active rebalancing',
    'Check if monitoring is running',
  ],
  inputSchema: monitoringSkillInputSchema,
  // No MCP servers needed - using direct GraphQL fetching
  tools: [startMonitoringTool, stopMonitoringTool, getMonitoringStatusTool],
  // No manual handler - use LLM orchestration for flexible routing
});
