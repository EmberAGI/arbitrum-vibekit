const rawPublicBaseURL =
  process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || "";

const PUBLIC_BASE_URL =
  rawPublicBaseURL && !rawPublicBaseURL.startsWith("http")
    ? `https://${rawPublicBaseURL}`
    : rawPublicBaseURL;

const rawServerBaseURL =
  process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;

export const baseURL =
  process.env.NODE_ENV === "development"
    ? ""
    : PUBLIC_BASE_URL || (rawServerBaseURL ? `https://${rawServerBaseURL}` : "");
