import type { Metadata } from 'next';

import { ProvidersNoSSR } from '../components/ProvidersNoSSR';
import { CopilotKitShell } from '../components/CopilotKitShell';
import './globals.css';
import '@copilotkit/react-core/v2/styles.css';

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
          <CopilotKitShell>{children}</CopilotKitShell>
        </ProvidersNoSSR>
      </body>
    </html>
  );
}
