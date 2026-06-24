// @vitest-environment jsdom
// jsdom because this module's import chain (conversation → lib/api) reads
// `window.yui` at load time, which is absent in the default node environment.
import { describe, expect, it } from "vitest";
import { buildSlashCommands, filterSlashCommands, slashQuery } from "./slash-commands";
import type { ExtensionSlashCommand } from "./types";

// Identity translator: returns the key so assertions stay language-agnostic.
const t = ((key: string) => key) as unknown as Parameters<typeof buildSlashCommands>[1];

const extensionCommands: ExtensionSlashCommand[] = [
  { name: "deploy", description: "Ship it", extensionPath: "/ext/a.ts" },
];

describe("slashQuery", () => {
  it("parses a leading slash with a partial token", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/re")).toBe("re");
    expect(slashQuery("/reload")).toBe("reload");
  });

  it("returns null when the input is not a bare command token", () => {
    expect(slashQuery("")).toBeNull();
    expect(slashQuery("hello")).toBeNull();
    expect(slashQuery("/foo bar")).toBeNull();
    expect(slashQuery("/foo\nbar")).toBeNull();
    expect(slashQuery(" /foo")).toBeNull();
  });
});

describe("buildSlashCommands", () => {
  it("lists built-in app commands before extension commands", () => {
    const commands = buildSlashCommands(extensionCommands, t);
    expect(commands.map((command) => command.token)).toEqual(["new", "reload", "deploy"]);
    expect(commands.map((command) => command.kind)).toEqual(["app", "app", "extension"]);
  });

  it("keys an extension command by its source path and name", () => {
    const commands = buildSlashCommands(extensionCommands, t);
    const deploy = commands.find((command) => command.token === "deploy");
    expect(deploy?.kind).toBe("extension");
    expect(deploy?.id).toBe("ext:/ext/a.ts:deploy");
  });
});

describe("filterSlashCommands", () => {
  const commands = buildSlashCommands(extensionCommands, t);

  it("returns everything for an empty query", () => {
    expect(filterSlashCommands(commands, "")).toHaveLength(commands.length);
  });

  it("matches on the command token, case-insensitively", () => {
    expect(filterSlashCommands(commands, "rel").map((command) => command.token)).toEqual([
      "reload",
    ]);
    expect(filterSlashCommands(commands, "DEP").map((command) => command.token)).toEqual([
      "deploy",
    ]);
  });

  it("drops commands that match neither token nor title", () => {
    expect(filterSlashCommands(commands, "zzz")).toHaveLength(0);
  });
});
