"use client";

import { useMemo, useOptimistic, useState, startTransition } from "react";
//import { saveChatAgentAsCookie } from '@/app/(chat)/actions';
import type { Button } from "@/components/ui/button";
import { chatAgents } from "@/lib/ai/tools/agents/agents";
import { ChipToggle } from "./chips";
import { saveChatAgentAsCookie } from "@/app/(chat)/actions";

export function AgentSelector({
  selectedAgentId,
  className,
  onAgentChange,
}: {
  selectedAgentId: string;
  onAgentChange?: (agentId: string) => void;
} & React.ComponentProps<typeof Button>) {
  const [optimisticAgentId, setOptimisticAgentId] =
    useOptimistic(selectedAgentId);

  const selectedChatAgent = useMemo(
    () => chatAgents.find((chatAgent) => chatAgent.id === optimisticAgentId),
    [optimisticAgentId]
  );

  const options = useMemo(
    () =>
      chatAgents.map((chatAgent) => ({
        value: chatAgent.id,
        label: chatAgent.name,
      })),
    []
  );

  return (
    <ChipToggle
      options={options}
      defaultValue={optimisticAgentId || "all"}
      onValueChange={(value) => {
        console.log(value);

        startTransition(() => {
          setOptimisticAgentId(value);
          saveChatAgentAsCookie(value);
          if (onAgentChange) {
            onAgentChange(value);
          }
        });
      }}
    />
  );
}
