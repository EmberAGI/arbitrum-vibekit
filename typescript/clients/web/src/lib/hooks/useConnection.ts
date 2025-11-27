/**
 * Connection Management Hook
 *
 * Handles A2A agent connection and connection state
 */

import { useState, useCallback } from 'react';

interface UseConnectionReturn {
  agentCardUrl: string;
  setAgentCardUrl: (url: string) => void;
  isA2AConnected: boolean;
  isA2AConnecting: boolean;
  agentCard: any;
  agentEndpoint: string;
  validationErrors: string[];
  handleConnect: () => Promise<void>;
}

export function useConnection(): UseConnectionReturn {
  const [agentCardUrl, setAgentCardUrl] = useState(
    process.env.NEXT_PUBLIC_AGENT_CARD_URL || 'http://localhost:3001/.well-known/agent-card.json',
  );
  const [isA2AConnected, setIsA2AConnected] = useState(false);
  const [isA2AConnecting, setIsA2AConnecting] = useState(false);
  const [agentCard, setAgentCard] = useState<any>(null);
  const [validationErrors, _setValidationErrors] = useState<string[]>([]);
  const [agentEndpoint, setAgentEndpoint] = useState<string>('');

  const handleConnect = useCallback(async () => {
    if (!agentCardUrl.trim()) {
      alert('Please enter an agent card URL.');
      return;
    }

    let url = agentCardUrl.trim();
    if (!/^[a-zA-Z]+:\/\//.test(url)) {
      url = 'http://' + url;
    }

    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        throw new Error('Protocol must be http or https.');
      }
    } catch (_error) {
      alert('Invalid URL. Please enter a valid URL starting with http:// or https://.');
      return;
    }

    setIsA2AConnecting(true);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch agent card: ${response.status} ${response.statusText}`);
      }

      const agentCardData = await response.json();
      setAgentCard(agentCardData);

      const agentUrl = agentCardData.url;
      if (typeof agentUrl !== 'string' || agentUrl.length === 0) {
        throw new Error('Agent card missing required url field');
      }
      setAgentEndpoint(agentUrl);

      setIsA2AConnected(true);
      setIsA2AConnecting(false);
    } catch (error) {
      setIsA2AConnecting(false);
      alert(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [agentCardUrl]);

  return {
    agentCardUrl,
    setAgentCardUrl,
    isA2AConnected,
    isA2AConnecting,
    agentCard,
    agentEndpoint,
    validationErrors,
    handleConnect,
  };
}
