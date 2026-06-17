import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileExtensionCatalogService } from "./extension-catalog-service.ts";

const WORKING_EXTENSION = `
export default function (pi) {
  pi.registerTool({
    name: "demo_tool",
    description: "A demo tool",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [] }),
  });
  pi.registerCommand("demo", { description: "A demo command" });
}
`;

describe("FileExtensionCatalogService", () => {
  let dir: string;
  let service: FileExtensionCatalogService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yui-ext-catalog-"));
    const config: RuntimeConfig = {
      homeDir: dir,
      agentDir: dir,
      sessionDir: join(dir, "sessions"),
      cwd: dir,
    };
    service = new FileExtensionCatalogService(config);
    mkdirSync(join(dir, "extensions"), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns an empty catalog when nothing is installed", async () => {
    const catalog = await service.list();
    expect(catalog.entries).toEqual([]);
    expect(catalog.directory).toBe(join(dir, "extensions"));
  });

  it("probes file extensions and reports tools, commands, and errors", async () => {
    writeFileSync(join(dir, "extensions", "demo.ts"), WORKING_EXTENSION);
    writeFileSync(join(dir, "extensions", "broken.ts"), "export default 42;");
    writeFileSync(join(dir, "extensions", "notes.txt"), "not an extension");

    const catalog = await service.list();
    expect(catalog.entries.map((entry) => entry.name).sort()).toEqual(["broken.ts", "demo.ts"]);

    const demo = catalog.entries.find((entry) => entry.name === "demo.ts");
    expect(demo).toMatchObject({ kind: "file", enabled: true, error: undefined });
    expect(demo?.tools).toEqual([{ name: "demo_tool", description: "A demo tool" }]);
    expect(demo?.commands).toEqual([{ name: "demo", description: "A demo command" }]);

    const broken = catalog.entries.find((entry) => entry.name === "broken.ts");
    expect(broken?.error).toContain("factory");
  });

  it("treats directories with an index entry as one package", async () => {
    const pkg = join(dir, "extensions", "my-pack");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), WORKING_EXTENSION);
    // Directories without entry points are ignored, mirroring pi.
    mkdirSync(join(dir, "extensions", "random-folder"));

    const catalog = await service.list();
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]).toMatchObject({ name: "my-pack", kind: "directory" });
    expect(catalog.entries[0].tools.map((tool) => tool.name)).toEqual(["demo_tool"]);
  });

  it("disables and re-enables by moving entries, without probing disabled code", async () => {
    writeFileSync(join(dir, "extensions", "demo.ts"), WORKING_EXTENSION);

    await service.setEnabled({ name: "demo.ts", enabled: false });
    expect(existsSync(join(dir, "extensions-disabled", "demo.ts"))).toBe(true);
    expect(existsSync(join(dir, "extensions", "demo.ts"))).toBe(false);

    let catalog = await service.list();
    expect(catalog.entries[0]).toMatchObject({ name: "demo.ts", enabled: false, tools: [] });

    await service.setEnabled({ name: "demo.ts", enabled: true });
    catalog = await service.list();
    expect(catalog.entries[0]).toMatchObject({ name: "demo.ts", enabled: true });
    expect(catalog.entries[0].tools).toHaveLength(1);
  });

  it("setEnabled is idempotent and rejects unknown or duplicated names", async () => {
    writeFileSync(join(dir, "extensions", "demo.ts"), WORKING_EXTENSION);
    await expect(service.setEnabled({ name: "demo.ts", enabled: true })).resolves.toBeUndefined();
    await expect(service.setEnabled({ name: "ghost.ts", enabled: false })).rejects.toThrow(
      /Unknown extension/,
    );

    mkdirSync(join(dir, "extensions-disabled"), { recursive: true });
    writeFileSync(join(dir, "extensions-disabled", "demo.ts"), WORKING_EXTENSION);
    await expect(service.setEnabled({ name: "demo.ts", enabled: false })).rejects.toThrow(
      /resolve the duplicate/,
    );
  });

  it("lists settings.json extension paths with probe results and packages read-only", async () => {
    const outside = join(dir, "outside.ts");
    writeFileSync(outside, WORKING_EXTENSION);
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        extensions: [outside, join(dir, "missing.ts")],
        packages: ["npm:some-pack", { source: "git:org/repo", extensions: ["a.ts"] }],
      }),
    );

    const catalog = await service.list();
    const configured = catalog.entries.filter((entry) => entry.source === "settings");
    expect(configured).toHaveLength(2);

    const loaded = configured.find((entry) => entry.name === outside);
    expect(loaded).toMatchObject({ path: outside, kind: "file", enabled: true });
    expect(loaded?.tools.map((tool) => tool.name)).toEqual(["demo_tool"]);
    const missing = configured.find((entry) => entry.name.endsWith("missing.ts"));
    expect(missing?.error).toBeTruthy();

    expect(catalog.packages).toEqual([
      { source: "npm:some-pack", filtered: false },
      { source: "git:org/repo", filtered: true },
    ]);
  });

  it("adds and removes settings.json extension paths", async () => {
    await service.addPath({ path: "/somewhere/ext.ts" });
    await service.addPath({ path: "/somewhere/ext.ts" }); // idempotent
    let catalog = await service.list();
    expect(
      catalog.entries.filter(
        (entry) => entry.source === "settings" && entry.name === "/somewhere/ext.ts",
      ),
    ).toHaveLength(1);

    await service.removePath({ path: "/somewhere/ext.ts" });
    catalog = await service.list();
    expect(catalog.entries.some((entry) => entry.source === "settings")).toBe(false);
    await expect(service.removePath({ path: "/somewhere/ext.ts" })).rejects.toThrow(
      /not in settings/,
    );
  });

  it("deletes entries from either directory", async () => {
    writeFileSync(join(dir, "extensions", "demo.ts"), WORKING_EXTENSION);
    const pkg = join(dir, "extensions", "my-pack");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), WORKING_EXTENSION);
    await service.setEnabled({ name: "demo.ts", enabled: false });

    await service.delete({ name: "demo.ts" });
    await service.delete({ name: "my-pack" });
    expect(existsSync(join(dir, "extensions-disabled", "demo.ts"))).toBe(false);
    expect(existsSync(pkg)).toBe(false);
    await expect(service.delete({ name: "ghost.ts" })).rejects.toThrow(/Unknown extension/);
  });
});
