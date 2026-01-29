import type { Metadata } from 'next';

import type { CopilotKitCSSProperties } from '@copilotkit/react-ui';
import { ProvidersNoSSR } from '../components/ProvidersNoSSR';
import { AppSidebarNoSSR } from '../components/AppSidebarNoSSR';
import { AgentRuntimeProvider } from '../components/AgentRuntimeProvider';
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
  const themeColor = '#fd6731';

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
          <AgentRuntimeProvider>
            <div className="flex h-screen overflow-hidden">
              <AppSidebarNoSSR />
              <main
                className="flex-1 overflow-y-auto bg-[#121212]"
                style={{ '--copilot-kit-primary-color': themeColor } as CopilotKitCSSProperties}
              >
                {children}
              </main>
              {/* CopilotPopup disabled while troubleshooting connect loops */}
              {/* <CopilotPopup defaultOpen={false} clickOutsideToClose={false} /> */}
            </div>
          </AgentRuntimeProvider>
        </ProvidersNoSSR>
      </body>
    </html>
  );
}
