'use client';

import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';
import { useSidebar } from './ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useArtifact } from '@/hooks/use-artifact';

// Simple sidepanel icon component
function SidepanelIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="9" x2="9" y1="3" y2="21" />
    </svg>
  );
}

export function ChatHeader() {
  const router = useRouter();
  const { open } = useSidebar();
  const { artifact, setArtifact } = useArtifact();

  const { width: windowWidth } = useWindowSize();

  // Check if there's a sidepanel that was previously shown but is now hidden
  const hasSidepanelToReopen = artifact.documentId !== 'init' && !artifact.isVisible;

  const handleReopenSidepanel = () => {
    setArtifact((current) => ({
      ...current,
      isVisible: true,
    }));
  };

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2 justify-between">
      <section className="flex items-center gap-2">
        <SidebarToggle />

        {hasSidepanelToReopen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="px-2 h-8"
                onClick={handleReopenSidepanel}
              >
                <SidepanelIcon />
                <span className="sr-only">Show Sidepanel</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show Sidepanel</TooltipContent>
          </Tooltip>
        )}

        {(!open || windowWidth < 768) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="order-2 md:order-1 md:px-2 px-2 md:h-fit ml-auto md:ml-0"
                onClick={() => {
                  router.push('/');
                  router.refresh();
                }}
              >
                <PlusIcon />
                <span className="md:sr-only">New Chat</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Chat</TooltipContent>
          </Tooltip>
        )}
      </section>
      <div>
        <ConnectButton />
      </div>
    </header>
  );
}
