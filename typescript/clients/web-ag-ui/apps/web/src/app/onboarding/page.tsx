import { PreAppOnboardingPrototype } from '@/components/pre-app/PreAppOnboardingPrototype';
import { normalizePrototypeWallet } from '@/prototypes/preAppMockBackend';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>;
}) {
  const params = await searchParams;

  return <PreAppOnboardingPrototype walletAddress={normalizePrototypeWallet(params.wallet)} />;
}
