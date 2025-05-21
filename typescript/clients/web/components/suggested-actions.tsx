"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { memo } from "react";
import { UseChatHelpers } from "@ai-sdk/react";

interface SuggestedActionsProps {
  chatId: string;
  append: UseChatHelpers["append"];
  selectedAgentId?: string;
}

function PureSuggestedActions({
  chatId,
  append,
  selectedAgentId,
}: SuggestedActionsProps) {
  let suggestedActions: any[] = [];

  //get  agent from localstorage cookies

  switch (selectedAgentId) {
    case "ember-aave":
      suggestedActions = [
        {
          title: "Deposit WETH",
          label: "to my balance",
          action: "Deposit WETH to my balance",
        },
        {
          title: "Check",
          label: "balance",
          action: "Check balance",
        },
      ];
      break;
    case "ember-camelot":
      suggestedActions = [
        {
          title: "Swap USDC for ETH",
          label: "on Arbitrum Network.",
          action: "Swap USDC for ETH tokens from Arbitrum to Arbitrum Network.",
        },
        {
          title: "Buy ARB",
          label: "on Arbitrum Network.",
          action: "Buy ARB token.",
        },
      ];
      break;
    case "ember-lp":
      suggestedActions = [
        {
          title: "Provide Liquidity",
          label: "on Arbitrum Network.",
          action: "Provide Liquidity on Arbitrum Network.",
        },
        {
          title: "Check",
          label: "Liquidity positions",
          action: "Check Positions",
        },
      ];
      break;
    case "ember-pendle":
      suggestedActions = [
        {
          title: "Deposit WETH",
          label: "to my balance",
          action: "Deposit WETH to my balance",
        },
        {
          title: "Check",
          label: "balance",
          action: "Check balance",
        },
      ];
      break;
    default:
      suggestedActions = [
        {
          title: "What Agents",
          label: "are available?",
          action: "What Agents are available?",
        },
        {
          title: "What can Ember AI",
          label: "help me with?",
          action: "What can Ember AI help me with?",
        },
      ];
      break;
  }

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
