"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { memo } from "react";
import { UseChatHelpers } from "@ai-sdk/react";
import { chatAgents } from "../agents-config";

interface SuggestedActionsProps {
  chatId: string;
  append: UseChatHelpers["append"];
  selectedAgentId?: string;
}

interface SuggestedAction {
  title: string;
  label: string;
  action: string;
}

function PureSuggestedActions({
  chatId,
  append,
  selectedAgentId,
}: SuggestedActionsProps) {
  const agentConfig =
    chatAgents.find((agent) => agent.id === selectedAgentId) ||
    chatAgents.find((agent) => agent.id === "all");
  const suggestedActions = agentConfig?.suggestedActions || [];

  return (
    <div
      data-testid="suggested-actions"
      className="grid sm:grid-cols-2 gap-2 w-full"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? "hidden sm:block" : "block"}
        >
          <Button
            variant="ghost"
            onClick={async () => {
              window.history.replaceState({}, "", `/chat/${chatId}`);

              append({
                role: "user",
                content: suggestedAction.action,
              });
            }}
            className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start border-muted-foreground"
          >
            <span className="font-medium">{suggestedAction.title}</span>
            <span className="text-muted-foreground">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions, () => true);
