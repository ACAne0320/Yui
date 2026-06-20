import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryTools } from "./memory-tools.ts";
import { PersonaStore } from "./persona-store.ts";

describe("createMemoryTools", () => {
  let dir: string;
  let store: PersonaStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yui-memory-tools-"));
    const config: RuntimeConfig = {
      homeDir: dir,
      agentDir: join(dir, "agent"),
      sessionDir: join(dir, "agent", "sessions"),
      cwd: dir,
    };
    store = new PersonaStore(config);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("registers no tools when memory is disabled for the session", () => {
    const tools = createMemoryTools({
      store,
      cwd: dir,
      scope: { soul: true, globalMemory: false, cwdMemory: false },
    });
    expect(tools).toHaveLength(0);
  });

  it("remembers and recalls through the tools", async () => {
    const tools = createMemoryTools({
      store,
      cwd: dir,
      scope: { soul: true, globalMemory: true, cwdMemory: true },
    });
    const remember = tools.find((tool) => tool.name === "remember");
    const recall = tools.find((tool) => tool.name === "recall");
    expect(remember).toBeDefined();
    expect(recall).toBeDefined();

    const saved = await remember!.execute("call-1", { text: "User likes tea.", scope: "global" });
    expect(saved.details?.entry?.name).toContain("tea");

    const found = await recall!.execute("call-2", { query: "tea" });
    expect(found.details?.matches).toHaveLength(1);
  });

  it("registers recall only in read-only mode and searches only enabled scopes", async () => {
    await store.rememberMemory({ scope: "global", text: "User likes tea." });
    await store.rememberMemory({ scope: "cwd", cwd: dir, text: "Project uses pnpm." });

    const tools = createMemoryTools({
      store,
      cwd: dir,
      scope: { soul: false, globalMemory: false, cwdMemory: true },
      readOnly: true,
    });

    expect(tools.map((tool) => tool.name)).toEqual(["recall"]);

    const recall = tools[0];
    const global = await recall.execute("call-1", { query: "tea" });
    expect(global.details?.matches).toHaveLength(0);

    const cwd = await recall.execute("call-2", { query: "pnpm" });
    expect(cwd.details?.matches).toHaveLength(1);
    expect(cwd.details?.matches[0]?.scope).toBe("cwd");
  });
});
