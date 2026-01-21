'use client';

import type { CSSProperties, ReactNode } from 'react';
import { CopilotKitProvider, CopilotPopup } from '@copilotkit/react-core/v2';

import { AgentProvider } from '../contexts/AgentContext';

import { AppSidebar } from './AppSidebar';

type CopilotKitThemeStyles = CSSProperties & { '--copilot-kit-primary-color'?: string };

export function CopilotKitShell({ children }: { children: ReactNode }) {
  const themeColor = '#fd6731';

  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit" useSingleEndpoint>
      <AgentProvider>
        <div className="flex h-screen overflow-hidden">
          <AppSidebar />
          <main
            className="flex-1 overflow-y-auto bg-[#121212]"
            style={{ '--copilot-kit-primary-color': themeColor } as CopilotKitThemeStyles}
          >
            {children}
          </main>
          {/* Hidden popup for AG-UI interrupt handling */}
          <CopilotPopup defaultOpen={false} clickOutsideToClose={false} />
        </div>
      </AgentProvider>
    </CopilotKitProvider>
  );
}
