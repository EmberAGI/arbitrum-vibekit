import { z } from 'zod';

export const baseActionSchema = z.object({
    actionType: z.enum(['SUPPLY', 'REPAY']),
    asset: z.string(),
    amountUsd: z.string(),
    amountToken: z.string(),
    expectedHealthFactor: z.string(),
    priority: z.number(),
});

export const hybridActionSchema = z.object({
    actionType: z.literal('HYBRID'),
    // Optional at HYBRID level per system prompt
    asset: z.string().optional(),
    amountUsd: z.string().optional(),
    amountToken: z.string().optional(),
    expectedHealthFactor: z.string(),
    priority: z.number(),
    // Limit to max 2 steps per system prompt
    steps: z.array(baseActionSchema).max(2),
});

export const preventionActionSchema = z.union([baseActionSchema, hybridActionSchema]);

export const preventionResponseSchema = z.object({
    currentAnalysis: z.object({
        currentHF: z.string(),
        targetHF: z.string(),
        requiredIncrease: z.string(),
    }),
    recommendedActions: z.array(preventionActionSchema),
    optimalAction: preventionActionSchema,
});

export type PreventionAction = z.infer<typeof preventionActionSchema>;
export type PreventionResponse = z.infer<typeof preventionResponseSchema>;


