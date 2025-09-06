import type { CapabilityDefinition, EmberPlugin } from "./types.js";

export class PluginRegistry {
  private plugins = new Map<string, EmberPlugin>();
  private capabilities = new Map<string, CapabilityDefinition>();

  register(plugin: EmberPlugin) {
    if (this.plugins.has(plugin.meta.name)) {
      throw new Error(`Plugin already registered: ${plugin.meta.name}`);
    }
    this.plugins.set(plugin.meta.name, plugin);
    for (const cap of plugin.capabilities) {
      if (this.capabilities.has(cap.key)) {
        throw new Error(`Capability key conflict: ${cap.key}`);
      }
      this.capabilities.set(cap.key, cap);
    }
  }

  unregister(name: string) {
    const plugin = this.plugins.get(name);
    if (!plugin) return;
    for (const cap of plugin.capabilities) this.capabilities.delete(cap.key);
    this.plugins.delete(name);
  }

  listPlugins() { return Array.from(this.plugins.values()); }
  listCapabilities() { return Array.from(this.capabilities.keys()); }
  hasCapability(key: string) { return this.capabilities.has(key); }

  getCapability(key: string) {
    const cap = this.capabilities.get(key);
    if (!cap) throw new Error(`Capability not found: ${key}`);
    return cap;
  }
}