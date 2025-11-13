import type { NextConfig } from "next";

// Compute baseURL directly in next.config.ts to ensure env vars are read at build time
const baseURL =
  process.env.NODE_ENV === "development"
    ? process.env.VERCEL_URL
    : "https://" +
      (process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL);

const nextConfig: NextConfig = {
  assetPrefix: baseURL,
 /* config options here */
  reactCompiler: false, // Temporarily disabled due to Para SDK alpha compatibility issues
  // Turbopack (Next 16) requires this to be a boolean, not an object/map
  reactProductionProfiling: false,
  // Skip TypeScript type checking during builds and dev
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        // Apply CORS headers to all routes
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
