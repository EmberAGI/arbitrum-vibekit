import type { Metadata } from 'next';

import type { CopilotKitCSSProperties } from '@copilotkit/react-ui';
import { ProvidersNoSSR } from '../components/ProvidersNoSSR';
import { AppSidebarNoSSR } from '../components/AppSidebarNoSSR';
import { AgentRuntimeProvider } from '../components/AgentRuntimeProvider';
import { PrivyGateBanner } from '../components/PrivyGateBanner';
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
      <body className="antialiased bg-[#09090B] text-[#D1D1D1] dark">
        <ProvidersNoSSR>
          <AgentRuntimeProvider>
            <PrivyGateBanner />
            <div className="flex h-screen overflow-hidden">
              <AppSidebarNoSSR />
              <main
                className="flex-1 min-w-0 overflow-y-auto bg-[#09090B]"
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
