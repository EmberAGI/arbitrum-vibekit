import type { Metadata } from 'next';

import { CopilotKit } from '@copilotkit/react-core';
import { ProvidersNoSSR } from '../components/ProvidersNoSSR';
import { DEFAULT_AGENT_ID } from '../config/agents';
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
          <CopilotKit runtimeUrl="/api/copilotkit" agent={DEFAULT_AGENT_ID} threadId={undefined}>
            <div className="flex h-screen overflow-hidden">{children}</div>
          </CopilotKit>
        </ProvidersNoSSR>
      </body>
    </html>
  );
}
