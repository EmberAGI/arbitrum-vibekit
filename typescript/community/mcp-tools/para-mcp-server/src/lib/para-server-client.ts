import { Para as ParaServer } from "@getpara/server-sdk";

if (!process.env.PARA_API_KEY) {
  throw new Error("PARA_API_KEY environment variable is not set");
}

let paraServerInstance: ParaServer | null = null;

export function getParaServerClient(): ParaServer {
  if (!paraServerInstance) {
    const apiKey = process.env.PARA_API_KEY;
    if (!apiKey) {
      throw new Error("PARA_API_KEY environment variable is not set");
    }
    paraServerInstance = new ParaServer(apiKey);
  }
  return paraServerInstance;
}
