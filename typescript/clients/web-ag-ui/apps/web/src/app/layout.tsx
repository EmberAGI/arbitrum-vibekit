import type { Metadata } from 'next';
import { Roboto, Roboto_Mono } from 'next/font/google';

import type { CopilotKitCSSProperties } from '@copilotkit/react-ui';
import { ProvidersNoSSR } from '../components/ProvidersNoSSR';
import { AppSidebarNoSSR } from '../components/AppSidebarNoSSR';
import { GlobalPortfolioTopBarNoSSR } from '../components/GlobalPortfolioTopBarNoSSR';
import { AgentRuntimeProvider } from '../components/AgentRuntimeProvider';
import { PrivyGateBanner } from '../components/PrivyGateBanner';
import { AuthoritativeAgentSnapshotCacheProvider } from '../contexts/AuthoritativeAgentSnapshotCache';
import { InactiveAgentProvider } from '../contexts/AgentContext';
import './globals.css';
import '@copilotkit/react-ui/styles.css';

const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
  weight: ['400', '500', '700'],
});

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
  weight: ['400', '500', '700'],
});

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
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoMono.variable} bg-background text-foreground antialiased`}
      >
        <ProvidersNoSSR>
          <AuthoritativeAgentSnapshotCacheProvider>
            <InactiveAgentProvider>
              <PrivyGateBanner />
              <div className="flex h-screen flex-col overflow-hidden">
                <GlobalPortfolioTopBarNoSSR />
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <AppSidebarNoSSR />
                  <main
                    className="flex-1 min-w-0 overflow-y-auto"
                    style={{ '--copilot-kit-primary-color': themeColor } as CopilotKitCSSProperties}
                  >
                    <AgentRuntimeProvider>{children}</AgentRuntimeProvider>
                  </main>
                  {/* CopilotPopup disabled while troubleshooting connect loops */}
                  {/* <CopilotPopup defaultOpen={false} clickOutsideToClose={false} /> */}
                </div>
              </div>
            </InactiveAgentProvider>
          </AuthoritativeAgentSnapshotCacheProvider>
        </ProvidersNoSSR>
      </body>
    </html>
  );
}
