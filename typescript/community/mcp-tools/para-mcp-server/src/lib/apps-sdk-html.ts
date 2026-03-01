import { baseURL } from "@/config/baseUrl";

export const getAppsSdkCompatibleHtml = async (
  baseUrl: string | undefined,
  path: string,
) => {
  const origin = baseUrl?.startsWith("http")
    ? baseUrl
    : baseUrl
      ? `https://${baseUrl}`
      : `http://localhost:${process.env.PORT ?? "3012"}`;
  const url = new URL(path, origin);
  const result = await fetch(url.toString());
  return await result.text();
};

export { baseURL };
