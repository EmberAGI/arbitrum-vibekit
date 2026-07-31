import type { Action, TokenSet } from './actions/index.js';

/**
 * Determines how lifecycle refreshes should be applied.
 */
export type LifecycleRefreshScope = 'full-provider' | 'segment-delta';

/**
 * A single refreshable graph segment topology produced by a plugin.
 */
export interface LifecycleSegmentTopology {
  /**
   * Deterministic segment identifier (for example CAIP-composed keys).
   */
  segmentId: string;
  /**
   * Action type associated with this segment.
   */
  actionType: Action;
  /**
   * Action name associated with this segment.
   */
  actionName: string;
  /**
   * Input token sets for this action segment.
   */
  inputTokenSets: TokenSet[];
  /**
   * Output token sets for this action segment.
   */
  outputTokenSets: TokenSet[];
}

/**
 * Optional plugin capability that describes lifecycle-sensitive topology.
 */
export interface LifecycleCapability {
  /**
   * Provider/plugin id whose topology this capability refreshes.
   */
  providerId: string;
  /**
   * Refresh mode for this provider lifecycle.
   */
  refreshScope: LifecycleRefreshScope;
  /**
   * Actions that may change over lifecycle transitions.
   */
  volatileActionTypes: Action[];
  /**
   * Signature used to detect no-op refresh cycles.
   */
  computeTopologySignature(): Promise<string>;
  /**
   * Materialized segment topology used for segment-delta refreshes.
   */
  getSegmentTopologies(): Promise<LifecycleSegmentTopology[]>;
}
