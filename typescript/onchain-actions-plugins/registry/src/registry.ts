import type { EmberPlugin, PluginType } from './core/index.js';

/**
 * Registry for public Ember plugins.
 */
export class PublicEmberPluginRegistry {
  private plugins: EmberPlugin<PluginType>[] = [];
  private deferredPlugins: Promise<EmberPlugin<PluginType>>[] = [];

  /**
   * Register a new Ember plugin.
   * @param plugin The plugin to register.
   */
  public registerPlugin(plugin: EmberPlugin<PluginType>) {
    this.plugins.push(plugin);
  }

  /**
   * Register a new deferred Ember plugin.
   * @param pluginPromise The promise resolving to the plugin to register.
   */
  public registerDeferredPlugin(pluginPromise: Promise<EmberPlugin<PluginType>>) {
    this.deferredPlugins.push(pluginPromise);
  }

  /**
   * Iterator for the registered Ember plugins.
   */
  public async *getPlugins(): AsyncIterable<EmberPlugin<PluginType>> {
    yield* this.plugins;

    for (const pluginPromise of this.deferredPlugins) {
      const plugin = await pluginPromise;

      // Register the plugin now that it is resolved
      this.registerPlugin(plugin);

      yield plugin;
    }

    this.deferredPlugins = [];
  }

  public get emberPlugins(): EmberPlugin<PluginType>[] {
    return this.plugins;
  }
}
