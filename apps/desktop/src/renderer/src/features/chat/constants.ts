import type { ThinkingLevel } from "@yui/contracts";

export const thinkingLabelKeys = {
  off: "chat.thinking.off",
  minimal: "chat.thinking.minimal",
  low: "chat.thinking.low",
  medium: "chat.thinking.medium",
  high: "chat.thinking.high",
  xhigh: "chat.thinking.xhigh",
  max: "chat.thinking.max",
} satisfies Record<ThinkingLevel, string>;

export const fallbackThinkingLevels: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
