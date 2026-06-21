import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SOUL } from "./default-soul.ts";
import { PersonaStore, projectPathSlug } from "./persona-store.ts";

describe("PersonaStore", () => {
  let dir: string;
  let config: RuntimeConfig;
  let store: PersonaStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yui-persona-store-"));
    config = {
      homeDir: dir,
      agentDir: join(dir, "agent"),
      sessionDir: join(dir, "agent", "sessions"),
      cwd: dir,
    };
    store = new PersonaStore(config);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is a profile-level singleton by homeDir", () => {
    const first = PersonaStore.forConfig(config);
    const second = PersonaStore.forConfig({ ...config, cwd: join(dir, "other") });
    expect(first).toBe(second);
  });

  it("creates the persona layout with default config and a seeded SOUL", async () => {
    await expect(store.getConfig()).resolves.toEqual({ memoryEnabled: true });
    expect(existsSync(join(dir, "persona", "config.json"))).toBe(true);
    expect(existsSync(join(dir, "persona", "SOUL.md"))).toBe(true);
    expect(existsSync(join(dir, "persona", "MEMORY.md"))).toBe(true);
    expect(existsSync(join(dir, "persona", "memory"))).toBe(true);
    await expect(store.getSoul()).resolves.toMatchObject({ content: DEFAULT_SOUL });
  });

  it("does not overwrite an existing SOUL when seeding base files", async () => {
    await store.saveSoul({ content: "my own soul" });
    await store.getConfig(); // triggers ensureBaseFiles again
    await expect(store.getSoul()).resolves.toMatchObject({ content: "my own soul" });
  });

  it("reads and writes SOUL and config", async () => {
    await expect(store.saveSoul({ content: "You are Yui." })).resolves.toMatchObject({
      content: "You are Yui.",
    });
    await expect(store.getSoul()).resolves.toMatchObject({ content: "You are Yui." });

    await expect(store.setConfig({ memoryEnabled: false })).resolves.toEqual({
      memoryEnabled: false,
    });
    await expect(store.getConfig()).resolves.toEqual({ memoryEnabled: false });
  });

  it("serializes concurrent memory writes without tearing the index", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.saveMemoryEntry({
          scope: "global",
          name: `Fact ${index}`,
          description: `Description ${index}`,
          tags: ["test"],
          createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
          content: `Body ${index}`,
        }),
      ),
    );

    const entries = await store.listMemoryEntries("global");
    expect(entries).toHaveLength(20);
    const index = readFileSync(join(dir, "persona", "MEMORY.md"), "utf-8");
    expect(index.split("\n").filter((line) => line.startsWith("- [Fact "))).toHaveLength(20);
    expect(index).not.toContain(".tmp");
  });

  it("writes memory entries with Claude-style frontmatter and an index line", async () => {
    const project = join(dir, "project");
    mkdirSync(project);
    const entry = await store.saveMemoryEntry({
      scope: "cwd",
      cwd: project,
      name: "Build command",
      description: "Use pnpm check",
      tags: ["dev"],
      createdAt: "2026-01-01T00:00:00.000Z",
      content: "Run `pnpm check` before shipping.",
    });

    const file = readFileSync(entry.path, "utf-8");
    expect(file).toContain("name: Build command");
    expect(file).toContain("description: Use pnpm check");
    expect(file).toContain("scope: cwd");
    expect(file).toContain("Run `pnpm check` before shipping.");

    const index = readFileSync(dirname(dirname(entry.path)) + "/MEMORY.md", "utf-8");
    expect(index).toContain(`cwd: ${project}`);
    expect(index).toContain("- [Build command](memory/build-command.md) — Use pnpm check");
  });

  it("updates a near-duplicate memory instead of creating a new one", async () => {
    const first = await store.rememberMemory({
      scope: "global",
      text: "User prefers concise answers.",
    });
    expect(first.updated).toBe(false);

    const second = await store.rememberMemory({
      scope: "global",
      text: "User prefers concise answers!!",
    });
    expect(second.updated).toBe(true);
    expect(second.entry.slug).toBe(first.entry.slug);

    await expect(store.listMemoryEntries("global")).resolves.toHaveLength(1);
  });

  it("recalls entries by keyword and excludes unrelated ones", async () => {
    await store.rememberMemory({ scope: "global", text: "User prefers dark mode." });
    await store.rememberMemory({ scope: "global", text: "Favorite language is Rust." });

    const hits = await store.searchMemory({ query: "dark mode", scope: "global" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toContain("dark mode");
  });

  it("generates readable project slugs and hashes overlong path segments", () => {
    expect(projectPathSlug("/Users/x/code/app")).toBe("-Users-x-code-app");
    const long = projectPathSlug(`/${"a".repeat(300)}`);
    expect(long).toMatch(/^[a-f0-9]{16}$/);
  });

  it("records and reports the real cwd in project MEMORY frontmatter", async () => {
    const project = join(dir, "project");
    mkdirSync(project);
    const info = await store.ensureProjectMemory(project);
    expect(info.cwdMatches).toBe(true);
    expect(readFileSync(info.indexPath, "utf-8")).toContain(`cwd: ${project}`);

    writeFileSync(info.indexPath, "---\ncwd: /moved/from\n---\n");
    const detected = await store.ensureProjectMemory(project);
    expect(detected.cwdMatches).toBe(false);
    expect(detected.storedCwd).toBe("/moved/from");
  });
});
