import { useEffect, useState } from 'react';

export function useCurrentAgent() {
  const [agentId, setAgentId] = useState<string>('unknown');

  useEffect(() => {
    // Function to get cookie value
    const getCookie = (name: string): string | null => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        return parts.pop()?.split(';').shift() || null;
      }
      return null;
    };

    // Get agent ID from cookie
    const agentFromCookie = getCookie('agent');
    if (agentFromCookie) {
      setAgentId(agentFromCookie);
    }

    // Listen for cookie changes (when agent is switched)
    const handleStorageChange = () => {
      const newAgent = getCookie('agent');
      if (newAgent && newAgent !== agentId) {
        setAgentId(newAgent);
      }
    };

    // Listen for storage events (cross-tab synchronization)
    window.addEventListener('storage', handleStorageChange);

    // Cleanup
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [agentId]);

  return agentId;
}