'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import Para, { Environment } from '@getpara/web-sdk';
import { Button } from './ui/button';
import ParaReact, { Environment as ParaReactEnvironment, ParaModal } from '@getpara/react-sdk';

type ClaimPregenWalletProps = {
  result?: any;
};

export function ClaimPregenWallet({ result }: ClaimPregenWalletProps) {
  // The `result` here is the MCP envelope: { status, result: { content: [{ text: string }] } }
  // We need to extract the text and parse into the Task -> artifacts -> parts[0] -> data payload
  const text: string | undefined =
    result?.result?.content?.[0]?.text ?? result?.result?.content?.[0]?.resource?.text;

  let task: any = null;
  if (typeof text === 'string') {
    try {
      task = JSON.parse(text);
    } catch {
      task = null;
    }
  }

  // Try to extract the payload from the first artifact/part
  const firstPart = task?.artifacts?.[0]?.parts?.[0];
  let payload: any = firstPart?.data ?? null;
  if (!payload && typeof firstPart?.text === 'string') {
    try {
      payload = JSON.parse(firstPart.text);
    } catch {
      // leave payload as null
    }
  }

  // Backend now returns: { email, address, isClaimed, note }
  const identifierKey: string | undefined = payload?.email ? 'EMAIL' : (payload?.identifierKey ?? task?.identifierKey);
  const identifierValue: string | undefined = payload?.email ?? (payload?.identifierValue ?? task?.identifierValue);
  const initialUserShare: unknown = payload?.userShare ?? task?.userShare; // optional fallback

  const [isClaiming, setIsClaiming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasClaimed, setHasClaimed] = useState(Boolean(payload?.isClaimed));
  const { openConnectModal } = useConnectModal();
  const [email, setEmail] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [showParaModal, setShowParaModal] = useState(false);
  // Standalone Para React client for ParaModal (separate from web-sdk instance)
  const paraModalClient = useMemo(() => {
    const key = process.env.NEXT_PUBLIC_PARA_API_KEY || '';
    if (!key) return null;
    try {
      return new (ParaReact as any)(ParaReactEnvironment.BETA, key);
    } catch {
      return null;
    }
  }, []);

  type IdentifierType =
    | 'EMAIL'
    | 'PHONE'
    | 'CUSTOM_ID'
    | 'DISCORD'
    | 'TWITTER'
    | 'TELEGRAM';

  const SUPPORTED_IDENTIFIER_TYPES = new Set<IdentifierType>([
    'EMAIL',
    'PHONE',
    'CUSTOM_ID',
    'DISCORD',
    'TWITTER',
    'TELEGRAM',
  ]);

  const resolveIdentifierType = (key?: string): IdentifierType | undefined => {
    if (!key) return undefined;
    const normalized = key.toUpperCase() as IdentifierType;
    return SUPPORTED_IDENTIFIER_TYPES.has(normalized) ? normalized : undefined;
  };

  // Helper to refresh Para email from Web SDK
  const refreshEmail = useCallback(async () => {
    let cancelled = false;
    try {
      setLoadingEmail(true);
      const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY || '';
      if (!apiKey) {
        setEmail(null);
        return;
      }
      const para = new Para(Environment.BETA, apiKey);
      if (typeof para.isFullyLoggedIn === 'function') {
        const loggedIn = await para.isFullyLoggedIn();
        if (!loggedIn) {
          setEmail(null);
          return;
        }
      }
      // Try linked accounts for a primary identifier/email
      if (typeof (para as any).getLinkedAccounts === 'function') {
        try {
          const linked = await (para as any).getLinkedAccounts();
          const primary = (linked as any)?.primaryIdentifier || (linked as any)?.primary || (linked as any)?.primaryId;
          const primaryEmail =
            (typeof primary === 'object' && ((primary as any).email || (primary as any).value)) ||
            (linked as any)?.email ||
            null;
          if (primaryEmail) {
            setEmail(String(primaryEmail));
            return;
          }
        } catch {
          // fall through to fallback below
        }
      }
      // Fallback to para.email when available
      const em = (para as any).email as string | undefined;
      setEmail(em ?? null);
    } finally {
      if (!cancelled) setLoadingEmail(false);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Para email on mount
  useEffect(() => {
    void refreshEmail();
  }, [refreshEmail]);

  // Pre-check if this pregenerated wallet is already claimed and set hasClaimed
  useEffect(() => {
    async function checkClaimed() {
      try {
        if (!identifierValue) return;
        const qp = new URLSearchParams({
          email: String(identifierValue),
        });
        const resp = await fetch(`/api/pregen-wallet/by-identifier?${qp.toString()}`);
        const data = await resp.json().catch(() => ({} as any));
        const claimed = Boolean(data?.data?.isClaimed);
        setHasClaimed(claimed);
      } catch {
        // ignore pre-check errors
      }
    }
    checkClaimed();
  }, [identifierValue]);

  function handleLogin() {
    if (paraModalClient) {
      setShowParaModal(true);
      return;
    }
    // Fallback to RainbowKit connect modal if Para React client is not available
    if (openConnectModal) openConnectModal();
  }

  async function handleLogout() {
    try {
      setStatus('Logging out...');
      const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY || '';
      if (!apiKey) {
        setEmail(null);
        setStatus(null);
        return;
      }
      const para = new Para(Environment.BETA, apiKey);
      if (typeof (para as any).logout === 'function') {
        try {
          await (para as any).logout(true);
        } catch {
          await (para as any).logout();
        }
      }
      setEmail(null);
      setStatus(null);
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatus(null);
    }
  }

  async function handleClaim() {
    setError(null);
    setStatus(null);
    if (!identifierKey || !identifierValue) {
      setError('Missing identifier information.');
      return;
    }
    // Do not early-return here; we'll fetch userShare from server API below

    try {
      setIsClaiming(true);
      setStatus('Preparing claim...');

      // Note: We rely on Para SDK login status; no wagmi gating here

      setStatus('Preparing Para SDK...');
      const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY || '';
      if (!apiKey) {
        throw new Error('Para Web SDK API key is not available.');
      }

      const para = new Para(Environment.BETA, apiKey);
      await para.setEmail(identifierValue);
      if (typeof para.isFullyLoggedIn === 'function') {
        const fullyLoggedIn = await para.isFullyLoggedIn();
        if (!fullyLoggedIn) {
          setStatus('Please complete Para login in the wallet modal, then retry the claim.');
          setIsClaiming(false);
          return;
        }
      }

      const pregenIdentifierType = resolveIdentifierType(identifierKey);
      if (!pregenIdentifierType) {
        throw new Error(`Unsupported identifier type: ${identifierKey ?? 'unknown'}`);
      }

      if (pregenIdentifierType === 'EMAIL') {
        setStatus('Verifying Para login email...');
        const paraEmail = para.email?.trim().toLowerCase();
        const identifierEmail = identifierValue.trim().toLowerCase();
        if (!paraEmail) {
          throw new Error('Unable to determine the email for the connected Para account. Please re-login.');
        }
        if (!identifierEmail || paraEmail !== identifierEmail) {
          throw new Error('Connected Para email does not match the pregenerated wallet identifier.');
        }
      }

      setStatus('Fetching user share...');
      // Fetch userShare from proxy API backed by MCP server store
      let parsedShare: any = undefined;
      try {
        const qp = new URLSearchParams({
          email: String(identifierValue),
        });
        const resp = await fetch(`/api/pregen-wallet/by-identifier?${qp.toString()}`);
        const data = await resp.json().catch(() => ({} as any));
        if (!resp.ok || data?.ok === false) {
          throw new Error(data?.message || data?.error || 'Failed to fetch user share');
        }
        const userShareJson: any = data?.data?.userShareJson;
        if (userShareJson != null) {
          parsedShare = userShareJson;
          if (typeof parsedShare === 'string') {
            try {
              parsedShare = JSON.parse(parsedShare);
            } catch {
              // keep as string if not JSON
            }
          }
        }
      } catch (e) {
        // Fall through to fallback below
      }

      // Fallback to initialUserShare if API did not return it
      if (parsedShare == null) {
        parsedShare = initialUserShare;
        if (typeof parsedShare === 'string') {
          try {
            parsedShare = JSON.parse(parsedShare);
          } catch {
            // keep as string
          }
        }
      }

      if (parsedShare == null || parsedShare === 'Unavailable - wallet already existed before caching') {
        throw new Error('User share unavailable. Please recreate the pregenerated wallet to obtain a user share.');
      }

      setStatus('Setting user share...');
      if (typeof para.setUserShare !== 'function') throw new Error('para.setUserShare not available');
      await para.setUserShare(parsedShare);

      setStatus('Claiming pregenerated wallet...');
      if (typeof para.claimPregenWallets !== 'function') throw new Error('para.claimPregenWallets not available');
      const secret: string | undefined = await para.claimPregenWallets({
        pregenIdentifier: identifierValue,
        pregenIdentifierType,
      });

      setHasClaimed(true);
      // Inform backend that this pregenerated wallet has been claimed
      try {
        await fetch('/api/pregen-wallet/mark-claimed', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: identifierValue,
            isClaimed: true,
            recoverySecret: secret,
          }),
        });
      } catch {
        // non-fatal
      }
      setStatus(
        secret
          ? `Claim successful. Recovery secret: ${secret}`
          : 'Claim successful.',
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <>
      <div className="rounded-md border border-slate-200 !bg-orange-600 p-4 text-sm">
        <div className="font-medium mb-2">Pregenerated wallet claim</div>
        {identifierKey || identifierValue ? (
          <div className="space-y-2">
            <div>
              <span className="text-white">Identifier: </span>
              <span className="font-mono">
                {identifierKey ?? 'unknown'} ({identifierValue ?? 'unknown'})
              </span>
            </div>
            {payload?.address && (
              <div>
                <span className="text-white">Address: </span>
                <span className="font-mono text-xs">{payload.address}</span>
              </div>
            )}
            {payload?.isClaimed !== undefined && (
              <div>
                <span className="text-white">Status: </span>
                <span className={`font-semibold ${payload.isClaimed ? 'text-green-200' : 'text-yellow-200'}`}>
                  {payload.isClaimed ? 'Claimed' : 'Not Claimed'}
                </span>
              </div>
            )}
            {payload?.note && (
              <div className="text-xs text-white/80 italic">
                {payload.note}
              </div>
            )}
            <div className="flex items-center gap-2">
              {email ? (
                <>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
                    {email}
                  </span>
                  <Button
                    size="sm"
                    onClick={handleLogout}
                    disabled={isClaiming || loadingEmail}
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-white">Login with Para to continue</span>
                  <Button
                    size="sm"
                    onClick={handleLogin}
                    disabled={isClaiming || loadingEmail}
                  >
                    {loadingEmail ? 'Checking...' : 'Login with Para'}
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {email ? (
                <>
                  <Button size="sm" disabled={isClaiming || hasClaimed} onClick={handleClaim}>
                    {hasClaimed ? 'Claimed' : isClaiming ? 'Claiming...' : 'Claim with Para'}
                  </Button>
                  {status && <span className="text-white text-xs">{status}</span>}
                </>
              ) : (
                status && <span className="text-white text-xs">{status}</span>
              )}
            </div>
            {error && <div className="text-red-600 text-xs">{error}</div>}
          </div>
        ) : (
          <pre className="max-h-64 overflow-auto rounded p-2 text-xs">
            {typeof text === 'string' ? text : JSON.stringify(result ?? {}, null, 2)}
          </pre>
        )}
      </div>
      {paraModalClient && (
        <ParaModal
          para={paraModalClient}
          isOpen={showParaModal}
          onClose={() => {
            setShowParaModal(false);
            void refreshEmail();
          }}
        />
      )}
    </>
  );
}

