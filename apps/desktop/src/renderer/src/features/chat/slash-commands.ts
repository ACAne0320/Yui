import type { TFunction } from "i18next";
import type { IconName } from "@renderer/ui/Icon";
import { conversation } from "./conversation";
import type { ExtensionSlashCommand } from "./types";

export interface SlashCommand {
  /** Stable identity for React keys and selection. */
  id: string;
  /** Token typed after "/", used for matching (e.g. "reload"). */
  token: string;
  /** Localized display label. */
  title: string;
  description: string;
  icon: IconName;
  /** Provenance: built-in app action vs an extension-provided command. */
  kind: "app" | "extension";
  run: () => void;
}

/**
 * Assemble the composer's slash menu: built-in app actions first, then the
 * active session's extension commands. Extension commands dispatch through
 * `conversation.runSlashCommand` (Pi routes "/name" to the extension's handler);
 * commands that only touch UI/tools/exec run fully, while Pi's session-control
 * actions (fork/newSession/…) are currently benign no-ops.
 *
 * `t` is threaded in (rather than importing the i18n singleton) so titles
 * re-localize when the caller re-renders on a language change.
 */
export function buildSlashCommands(
  extensionCommands: ExtensionSlashCommand[],
  t: TFunction,
): SlashCommand[] {
  const app: SlashCommand[] = [
    {
      id: "app:new",
      token: "new",
      title: t("chat.slash.new.title"),
      description: t("chat.slash.new.description"),
      icon: "plus",
      kind: "app",
      run: () => void conversation.startNewConversation(),
    },
    {
      id: "app:reload",
      token: "reload",
      title: t("chat.slash.reload.title"),
      description: t("chat.slash.reload.description"),
      icon: "refresh",
      kind: "app",
      run: () => void conversation.reloadSession(),
    },
  ];

  const extension: SlashCommand[] = extensionCommands.map((command) => ({
    id: `ext:${command.extensionPath}:${command.name}`,
    token: command.name,
    title: command.name,
    description: command.description ?? "",
    icon: "puzzle",
    kind: "extension",
    run: () => void conversation.runSlashCommand(`/${command.name}`),
  }));

  return [...app, ...extension];
}

/** Case-insensitive match on token or title; empty query returns all. */
export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  return commands.filter(
    (command) =>
      command.token.toLowerCase().includes(needle) || command.title.toLowerCase().includes(needle),
  );
}

/**
 * Parse the composer text as a slash-command query. Matches only when the whole
 * input is "/" followed by non-whitespace (single line, no spaces) — i.e. the
 * user is still typing a command name. Returns the text after "/", or null.
 */
export function slashQuery(input: string): string | null {
  const match = /^\/(\S*)$/.exec(input);
  return match ? match[1] : null;
}
