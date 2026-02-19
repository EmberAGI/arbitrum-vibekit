import type {
  EmberPlugin,
  GraphLifecycleCapability,
  PluginType,
} from './core/index.js';

/**
 * Registry for public Ember plugins.
 */
export class PublicEmberPluginRegistry {
  private plugins: EmberPlugin<PluginType>[] = [];
  private deferredPlugins: Promise<EmberPlugin<PluginType>>[] = [];
  private lifecycleCapabilities = new Map<string, GraphLifecycleCapability>();

  /**
   * Register a new Ember plugin.
   * @param plugin The plugin to register.
   */
  public registerPlugin(plugin: EmberPlugin<PluginType>) {
    this.plugins.push(plugin);

    if (plugin.lifecycleCapability) {
      this.registerLifecycleCapability(plugin.lifecycleCapability);
    }
  }

  /**
   * Register a new deferred Ember plugin.
   * @param pluginPromise The promise resolving to the plugin to register.
   */
  public registerDeferredPlugin(pluginPromise: Promise<EmberPlugin<PluginType>>) {
    this.deferredPlugins.push(pluginPromise);
  }

  /**
   * Register lifecycle capability metadata for a provider plugin.
   * @param capability Lifecycle capability contract for refresh orchestration.
   */
  public registerLifecycleCapability(capability: GraphLifecycleCapability) {
    this.lifecycleCapabilities.set(capability.providerId, capability);
  }

  /**
   * Returns all lifecycle capabilities registered in the registry.
   */
  public getLifecycleCapabilities(): GraphLifecycleCapability[] {
    return Array.from(this.lifecycleCapabilities.values());
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
