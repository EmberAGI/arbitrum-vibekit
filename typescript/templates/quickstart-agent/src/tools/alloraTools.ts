/**
 * Allora Tools - Wrappers for Allora MCP server functionality
 * These tools integrate with the Allora MCP server to fetch prediction market data
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task, Message, TaskState } from '@google-a2a/types/src/types.js';
import type { HelloContext } from '../context/types.js';

// Helper to create task IDs
const createTaskId = () => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Schema definitions
const ListTopicsSchema = z.object({});

const GetInferenceSchema = z.object({
  topicID: z.number().describe('The topic ID to fetch inference for'),
});

const AnalyzePredictionsSchema = z.object({
  query: z.string().describe('What aspect of predictions to analyze'),
  topicIds: z.array(z.number()).optional().describe('Specific topic IDs to analyze'),
  includeConfidence: z.boolean().optional().describe('Include confidence analysis'),
});

/**
 * List all available prediction topics from Allora
 */
export const listAlloraTopicsTool: VibkitToolDefinition<
  typeof ListTopicsSchema,
  Task | Message,
  HelloContext
> = {
  name: 'list_prediction_topics',
  description: 'List all available prediction and inference topics from the Allora network',
  parameters: ListTopicsSchema,
  execute: async (_args, context) => {
    try {
      const topics = context.custom?.availableTopics || [];
      const count = topics.length;
      
      return {
        id: createTaskId(),
        contextId: `list-topics-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: 'completed' as TaskState,
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Found ${count} prediction topics from Allora network.` 
            }],
          },
        },
        artifacts: [{
          name: 'prediction-topics',
          parts: [{ 
            kind: 'data' as const, 
            data: { topics, count, source: 'Allora Network' } 
          }],
        }],
      } as unknown as Task;
    } catch (error) {
      return {
        id: createTaskId(),
        contextId: `list-topics-error-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: 'failed' as TaskState,
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Error listing topics: ${(error as Error).message}` 
            }],
          },
        },
      } as unknown as Task;
    }
  },
};

/**
 * Get inference data for a specific topic
 */
export const getAlloraInferenceTool: VibkitToolDefinition<
  typeof GetInferenceSchema,
  Task | Message,
  HelloContext
> = {
  name: 'get_prediction_inference',
  description: 'Fetch prediction/inference data for a specific Allora topic ID',
  parameters: GetInferenceSchema,
  execute: async (args, _context) => {
    try {
      // This will be enhanced by the MCP server
      return {
        id: createTaskId(),
        contextId: `get-inference-${args.topicID}-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: 'completed' as TaskState,
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Retrieving inference data for topic ${args.topicID}...` 
            }],
          },
        },
        artifacts: [{
          name: `topic-${args.topicID}-inference`,
          parts: [{ 
            kind: 'data' as const, 
            data: { 
              topicID: args.topicID, 
              status: 'fetching',
              note: 'Actual data will be provided by Allora MCP server' 
            } 
          }],
        }],
      } as unknown as Task;
    } catch (error) {
      return {
        id: createTaskId(),
        contextId: `get-inference-error-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: 'failed' as TaskState,
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Error fetching inference: ${(error as Error).message}` 
            }],
          },
        },
      } as unknown as Task;
    }
  },
};

/**
 * Analyze prediction data and provide insights
 */
export const analyzePredictionTool: VibkitToolDefinition<
  typeof AnalyzePredictionsSchema,
  Task | Message,
  HelloContext
> = {
  name: 'analyze_predictions',
  description: 'Analyze prediction data and provide market insights',
  parameters: AnalyzePredictionsSchema,
  execute: async (args, context) => {
    try {
      const { query, topicIds, includeConfidence } = args;
      const timestamp = new Date().toISOString();
      
      // Basic analysis logic that will be enhanced by LLM
      let analysis = `Analysis for: ${query}\n`;
      
      if (topicIds && topicIds.length > 0) {
        analysis += `Focusing on topics: ${topicIds.join(', ')}\n`;
      }
      
      if (includeConfidence) {
        analysis += `Confidence metrics will be included in the analysis.\n`;
      }
      
      if (context.custom.metadata.hasAlloraConnection) {
        analysis += `Connected to Allora network for real-time data.`;
      }
      
      return {
        id: createTaskId(),
        contextId: `analyze-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: 'completed' as TaskState,
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: analysis }],
          },
        },
        artifacts: [{
          name: 'prediction-analysis',
          parts: [{ 
            kind: 'data' as const, 
            data: {
              analysis,
              timestamp,
              topicsAnalyzed: topicIds?.length || 0,
              dataSource: 'Allora Network',
            } 
          }],
        }],
      } as unknown as Task;
    } catch (error) {
      return {
        id: createTaskId(),
        contextId: `analyze-error-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: 'failed' as TaskState,
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Error analyzing predictions: ${(error as Error).message}` 
            }],
          },
        },
      } as unknown as Task;
    }
  },
}; 