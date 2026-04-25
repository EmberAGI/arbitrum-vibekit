import { z } from 'zod';

export const economicExposureInputSchema = z.object({
  asset: z.string().min(1),
  quantity: z.string().min(1),
});

export const walletContentInputSchema = z.object({
  asset: z.string().min(1),
  network: z.string().min(1),
  quantity: z.string().min(1),
  valueUsd: z.number(),
  economicExposures: z.array(economicExposureInputSchema).optional(),
});

export const ownedUnitInputSchema = z.object({
  unitId: z.string().min(1),
  rootAsset: z.string().min(1),
  network: z.string().min(1),
  quantity: z.string().min(1),
  benchmarkAsset: z.string().min(1),
  benchmarkValue: z.number(),
  reservationId: z.string().min(1).nullable(),
  positionScopeId: z.string().min(1).nullable().optional(),
});

export const reservationAllocationInputSchema = z.object({
  unitId: z.string().min(1),
  quantity: z.string().min(1),
});

export const reservationInputSchema = z.object({
  reservationId: z.string().min(1),
  agentId: z.string().min(1),
  purpose: z.string().min(1),
  controlPath: z.string().min(1),
  createdAt: z.string().min(1),
  status: z.enum(['active', 'consumed', 'released', 'superseded']),
  unitAllocations: z.array(reservationAllocationInputSchema),
});

export const activePositionScopeMemberStateInputSchema = z.object({
  withdrawableQuantity: z.string().min(1).nullable().optional(),
  supplyApr: z.string().min(1).nullable().optional(),
  borrowApr: z.string().min(1).nullable().optional(),
});

export const activePositionScopeMemberInputSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(['collateral', 'debt']),
  asset: z.string().min(1),
  quantity: z.string().min(1),
  valueUsd: z.number(),
  economicExposures: z.array(economicExposureInputSchema),
  state: activePositionScopeMemberStateInputSchema,
});

export const activePositionScopeInputSchema = z.object({
  scopeId: z.string().min(1),
  kind: z.string().min(1),
  ownerType: z.enum(['user_idle', 'agent']).default('user_idle'),
  ownerId: z.string().min(1).default('user_idle'),
  network: z.string().min(1),
  protocolSystem: z.string().min(1),
  containerRef: z.string().min(1),
  status: z.enum(['active', 'closed']),
  marketState: z
    .object({
      availableBorrowsUsd: z.string().min(1).nullable().optional(),
      borrowableHeadroomUsd: z.string().min(1),
      currentLtvBps: z.number().nullable().optional(),
      liquidationThresholdBps: z.number().nullable().optional(),
      healthFactor: z.string().min(1).nullable().optional(),
    })
    .optional(),
  members: z.array(activePositionScopeMemberInputSchema),
});

export const portfolioProjectionInputSchema = z.object({
  benchmarkAsset: z.string().min(1),
  walletContents: z.array(walletContentInputSchema),
  reservations: z.array(reservationInputSchema),
  ownedUnits: z.array(ownedUnitInputSchema),
  activePositionScopes: z.array(activePositionScopeInputSchema),
});
