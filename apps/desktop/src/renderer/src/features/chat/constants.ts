import type { ThinkingLevel } from "@yui/contracts";
import type { IconName } from "@renderer/ui/Icon";

export const thinkingLabelKeys = {
  off: "chat.thinking.off",
  minimal: "chat.thinking.minimal",
  low: "chat.thinking.low",
  medium: "chat.thinking.medium",
  high: "chat.thinking.high",
  xhigh: "chat.thinking.xhigh",
} satisfies Record<ThinkingLevel, string>;

export const fallbackThinkingLevels: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

export const toolOptions: Array<{
  id: string;
  nameKey: `chat.tools.${"read" | "edit" | "bash" | "search"}.name`;
  descriptionKey: `chat.tools.${"read" | "edit" | "bash" | "search"}.description`;
  icon: IconName;
}> = [
  {
    id: "read",
    nameKey: "chat.tools.read.name",
    descriptionKey: "chat.tools.read.description",
    icon: "folder",
  },
  {
    id: "edit",
    nameKey: "chat.tools.edit.name",
    descriptionKey: "chat.tools.edit.description",
    icon: "edit",
  },
  {
    id: "bash",
    nameKey: "chat.tools.bash.name",
    descriptionKey: "chat.tools.bash.description",
    icon: "terminal",
  },
  {
    id: "search",
    nameKey: "chat.tools.search.name",
    descriptionKey: "chat.tools.search.description",
    icon: "search",
  },
];
