// Test module with existing documentation
export interface ModuleConfig {
  name: string;
  version: string;
}

export class TestModule {
  constructor(private config: ModuleConfig) {}
  
  getName(): string {
    return this.config.name;
  }
}
