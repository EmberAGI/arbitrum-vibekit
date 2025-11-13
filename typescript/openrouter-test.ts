// Test file for OpenRouter documentation generation
export interface UserData {
  id: string;
  name: string;
  email: string;
}

/**
 * Creates a new user profile with validation
 * @param userData - The user data to create profile from
 * @returns Promise resolving to created user profile
 */
export async function createUser(userData: Partial<UserData>): Promise<UserData> {
  if (!userData.email) {
    throw new Error('Email is required');
  }
  
  return {
    id: generateId(),
    name: userData.name || 'Anonymous',
    email: userData.email
  };
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}
