import type { Action, ActionDefinition } from './actions/index.js';

export interface EmberPlugin {
  /**
   * The possible actions that the plugin can perform.
   */
  actions: ActionDefinition<Action>[];
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
  website: string;
}
