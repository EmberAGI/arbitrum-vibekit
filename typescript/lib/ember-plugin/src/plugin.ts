import type { Action, ActionDefinition } from './actions/index.js';

export class EmberPluginFactory {
  private actions: ActionDefinition<Action>[] = [];

  /**
   * Creates a new Ember plugin factory.
   * @param name The name of the plugin.
   * @param description The description of what the plugin does.
   */
  constructor(
    public readonly name: string,
    public readonly description?: string,
    public readonly x?: string,
    public readonly website: string = '0.1.0'
  ) {}

  /**
   * Returns the list of actions that can be performed by this plugin.
   * @returns The list of actions.
   */
  public addAction<T extends Action>(definition: ActionDefinition<T>): void {
    this.actions.push(definition);
  }

  /**
   * @returns The list of actions that can be performed by this plugin.
   */
  public getActions(): ActionDefinition<Action>[] {
    return this.actions;
  }
}
