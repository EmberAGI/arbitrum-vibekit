'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyClientProvider } from './PrivyClientProvider';
import { AgentListProvider } from '../contexts/AgentListContext';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <PrivyClientProvider>
        <AgentListProvider>{children}</AgentListProvider>
      </PrivyClientProvider>
    </QueryClientProvider>
  );
}
