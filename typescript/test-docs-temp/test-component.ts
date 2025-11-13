/**
 * Sample component for testing documentation generation
 */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

/**
 * Creates a new user profile
 * @param userData - The user data to create profile from
 * @returns Promise resolving to created user profile
 */
export async function createUserProfile(userData: Partial<UserProfile>): Promise<UserProfile> {
  // Implementation here
  return {
    id: generateId(),
    name: userData.name || 'Anonymous',
    email: userData.email || 'user@example.com'
  };
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * NEW FUNCTION: Deletes a user profile
 * @param userId - The ID of the user to delete
 * @returns Promise resolving to boolean indicating success
 */
export async function deleteUserProfile(userId: string): Promise<boolean> {
  // Implementation here
  return true;
}
