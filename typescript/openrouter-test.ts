// Test file for OpenRouter documentation generation
export interface UserData {
  id: string;
  name: string;
  email: string;
  createdAt?: Date;  // NEW: Added timestamp field
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
    email: userData.email,
    createdAt: new Date()  // NEW: Set creation timestamp
  };
}

// NEW FUNCTION: Delete user by ID
export async function deleteUser(userId: string): Promise<boolean> {
  if (!userId) {
    throw new Error('User ID is required');
  }
  
  // Simulate deletion logic
  console.log(`Deleting user: ${userId}`);
  return true;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}
