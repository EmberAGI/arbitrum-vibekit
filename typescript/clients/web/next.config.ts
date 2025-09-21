import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const workspaceDir = fileURLToPath(new URL('.', import.meta.url));

if (process.env.NODE_ENV !== 'production') {
  const devStaticDir = resolve(workspaceDir, '.next/static/development');

  try {
    if (!existsSync(devStaticDir)) {
      mkdirSync(devStaticDir, { recursive: true });
    }
  } catch (error) {
    console.warn('Failed to pre-create Next.js development manifest directory.', error);
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
    ],
  },
};

export default nextConfig;
