// Test file for new docs structure
export interface TestInterface {
  id: string;
  name: string;
  description?: string;  // NEW: Added optional description
}

export function testFunction(): string {
  return 'testing new docs structure';
}

// NEW: Added validation function
export function validateTest(data: TestInterface): boolean {
  return !!data.id && !!data.name;
}
