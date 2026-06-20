import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PersonaStore } from "./persona-store.ts";
import { buildPersonaSystemPrompt } from "./system-prompt.ts";

describe("buildPersonaSystemPrompt", () => {
  let dir: string;
  let store: PersonaStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yui-persona-prompt-"));
    const config: RuntimeConfig = {
      homeDir: dir,
      agentDir: join(dir, "agent"),
      sessionDir: join(dir, "agent", "sessions"),
      cwd: dir,
    };
    store = new PersonaStore(config);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns nothing when SOUL is empty and memory is disabled", async () => {
    await expect(
      buildPersonaSystemPrompt(store, { soul: true, globalMemory: false, cwdMemory: false }),
    ).resolves.toBeUndefined();
  });

  it("injects SOUL content when the scope allows it", async () => {
    await store.saveSoul({ content: "\nYou are Yui.\n" });

    await expect(
      buildPersonaSystemPrompt(store, { soul: true, globalMemory: false, cwdMemory: false }),
    ).resolves.toBe("## SOUL\n\nYou are Yui.");
  });

  it("skips SOUL when the scope disables it", async () => {
    await store.saveSoul({ content: "You are Yui." });

    await expect(
      buildPersonaSystemPrompt(store, { soul: false, globalMemory: false, cwdMemory: false }),
    ).resolves.toBeUndefined();
  });

  it("injects SOUL and the memory index for enabled scopes", async () => {
    await store.saveSoul({ content: "You are Yui." });
    await store.rememberMemory({ scope: "global", text: "User prefers concise answers." });

    const prompt = await buildPersonaSystemPrompt(store, {
      soul: true,
      globalMemory: true,
      cwdMemory: false,
    });
    expect(prompt).toContain("## SOUL");
    expect(prompt).toContain("## Memory");
    expect(prompt).toContain("concise answers");
  });

  it("notes empty memory when enabled with no entries", async () => {
    const prompt = await buildPersonaSystemPrompt(store, {
      soul: false,
      globalMemory: true,
      cwdMemory: false,
    });
    expect(prompt).toContain("## Memory");
    expect(prompt).not.toContain("## SOUL");
  });

  it("describes read-only memory without advertising remember", async () => {
    await store.rememberMemory({ scope: "cwd", cwd: dir, text: "Project uses pnpm." });

    const prompt = await buildPersonaSystemPrompt(
      store,
      { soul: false, globalMemory: false, cwdMemory: true },
      dir,
      { memoryReadOnly: true },
    );

    expect(prompt).toContain("read-only persistent memory");
    expect(prompt).toContain("Project uses pnpm");
    expect(prompt).toContain("`recall`");
    expect(prompt).not.toContain("`remember`");
    expect(prompt).not.toContain("## SOUL");
    expect(prompt).not.toContain("Global");
  });
});
