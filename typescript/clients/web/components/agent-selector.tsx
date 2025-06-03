"use client";

import { startTransition, useMemo, useOptimistic, useState } from "react";
import { saveChatAgentAsCookie } from "@/app/(chat)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { CheckCircleFillIcon, ChevronDownIcon } from "./icons";
import { chatAgents } from "@/agents-config";

export function AgentSelector({
  selectedAgentId,
  className,
}: {
  selectedAgentId: string;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const [optimisticAgentId, setOptimisticAgentId] =
    useOptimistic(selectedAgentId);

  const selectedChatAgent = useMemo(
    () => chatAgents.find((chatAgent) => chatAgent.id === optimisticAgentId),
    [optimisticAgentId]
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          "w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          className
        )}
      >
        <Button
          data-testid="model-selector"
          variant="outline"
          className="md:px-2 md:h-[34px]"
        >
          {selectedChatAgent?.name}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        {chatAgents.map((chatAgent) => {
          const { id } = chatAgent;

          return (
            <DropdownMenuItem
              data-testid={`model-selector-item-${id}`}
              key={id}
              onSelect={() => {
                setOpen(false);

                startTransition(() => {
                  setOptimisticAgentId(id);
                  saveChatAgentAsCookie(id);
                });
              }}
              data-active={id === optimisticAgentId}
              asChild
            >
              <button
                type="button"
                className="gap-4 group/item flex flex-row justify-between items-center w-full"
              >
                <div className="flex flex-col gap-1 items-start">
                  <div>{chatAgent.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {chatAgent.description}
                  </div>
                </div>

                <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                  <CheckCircleFillIcon />
                </div>
              </button>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
