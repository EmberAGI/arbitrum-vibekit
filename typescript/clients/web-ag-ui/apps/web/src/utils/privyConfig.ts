export function getPrivyAppId(): string | null {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  return appId && appId.length > 0 ? appId : null;
}

export function isPrivyConfigured(): boolean {
  return getPrivyAppId() !== null;
}
