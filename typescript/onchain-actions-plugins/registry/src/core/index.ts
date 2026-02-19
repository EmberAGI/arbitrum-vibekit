import type { ActionDefinition } from './actions/index.js';
import type { LifecycleCapability } from './lifecycle.js';
import type { AvailableActions, AvailableQueries, PluginType } from './pluginType.js';

export interface EmberPlugin<Type extends PluginType> {
  /**
   * The unique identifier for the plugin.
   */
  id: string;
  /**
   * The type of the plugin, which determines the actions and queries it supports.
   */
  type: Type;
  /**
   * The possible actions that the plugin can perform.
   */
  actions: ActionDefinition<AvailableActions[Type]>[];
  /**
   * The metadata getters that the plugin can provide.
   */
  queries: AvailableQueries[Type];
  /**
   * The name of the plugin.
   */
  name: string;
  /**
   * An optional description of the plugin.
   */
  description?: string;
  /**
   * The twitter URL for the plugin or its creator.
   */
  x?: string;
  /**
   * The website URL for the plugin or its creator.
   */
  website?: string;
  /**
   * Optional lifecycle capability for topology-sensitive providers.
   */
  lifecycleCapability?: LifecycleCapability;
}

export * from './actions/index.js';
export * from './lifecycle.js';
export * from './queries/index.js';
export * from './pluginType.js';
export * from './schemas/index.js';
