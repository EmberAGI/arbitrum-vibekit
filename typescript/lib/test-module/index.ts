// Test module with existing documentation
export interface ModuleConfig {
  name: string;
  version: string;
  enabled?: boolean;  // NEW: Added optional enabled flag
}

export class TestModule {
  constructor(private config: ModuleConfig) {}
  
  getName(): string {
    return this.config.name;
  }
  
  // NEW: Added method to check if module is enabled
  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }
}
