import type { Metadata } from 'next';

import { ProvidersNoSSR } from '../components/ProvidersNoSSR';
import { CopilotKitWithDynamicAgent } from '../components/CopilotKitWithDynamicAgent';
import { AppSidebar } from '../components/AppSidebar';
import { AgentProvider } from '../contexts/AgentContext';
import './globals.css';
import '@copilotkit/react-ui/styles.css';

export const metadata: Metadata = {
  title: 'Ember AI - Hire Agents',
  description: 'Discover and hire AI agents for your crypto strategies',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.className='dark';document.documentElement.style.colorScheme='dark';`,
          }}
        />
      </head>
      <body className="antialiased bg-[#121212] text-white dark">
        <ProvidersNoSSR>
          {/*
            CopilotKitWithDynamicAgent dynamically routes to the correct agent backend
            based on the URL path. When visiting /hire-agents/agent-polymarket, it routes
            to the polymarket backend (port 8125), and for /hire-agents/agent-clmm,
            it routes to the clmm backend (port 8124).
          */}
          <CopilotKitWithDynamicAgent>
            <AgentProvider>
              <div className="flex h-screen overflow-hidden">
                <AppSidebar />
                <main className="flex-1 overflow-y-auto bg-[#121212]">
                  {children}
                </main>
              </div>
            </AgentProvider>
          </CopilotKitWithDynamicAgent>
        </ProvidersNoSSR>
      </body>
    </html>
  );
}
