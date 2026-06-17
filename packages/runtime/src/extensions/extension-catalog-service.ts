// Catalog over the user's global Pi extensions. Pi loads global extensions
// from three sources, and the catalog mirrors all of them so the settings UI
// shows exactly what a new session would load:
//
//   1. `<agentDir>/extensions/` — discovery rules from pi's loader.ts:
//      top-level *.ts/*.js files, or directories with a `pi.extensions`
//      package.json manifest or an index.ts/index.js entry. Managed here as
//      files; disabling moves an entry to the sibling `extensions-disabled/`
//      directory (a Yui convention — pi itself has no disable flag, and its
//      discovery never scans that directory), keeping the entry intact and
//      hand-restorable.
//   2. settings.json `extensions` paths — pi's own mechanism for extensions
//      living outside the directory. Managed here verbatim via pi's
//      SettingsManager (add/remove list entries; the files are not touched).
//   3. settings.json `packages` (npm/git sources) — installed and updated by
//      pi's package manager (`pi install …`); listed read-only here.
//
// Enabled entries are probe-loaded via pi's own loader to report their tools,
// commands, and load errors. A probe executes the extension factory — the
// same code that already runs on every session open, so this adds no new
// trust. Changes apply to sessions opened afterwards.

import * as fs from "node:fs";
import * as path from "node:path";
import { discoverAndLoadExtensions, SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  AppRuntimeError,
  type DeleteExtensionInput,
  type ExtensionCatalog,
  type ExtensionCatalogEntry,
  type ExtensionCatalogService,
  type ExtensionPathInput,
  type RuntimeConfig,
  type SetExtensionEnabledInput,
} from "@yui/contracts";

interface ScannedEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
}

export class FileExtensionCatalogService implements ExtensionCatalogService {
  private readonly agentDir: string;
  private readonly enabledDir: string;
  private readonly disabledDir: string;

  constructor(config: RuntimeConfig) {
    this.agentDir = config.agentDir;
    this.enabledDir = path.join(config.agentDir, "extensions");
    this.disabledDir = path.join(config.agentDir, "extensions-disabled");
  }

  /**
   * A global-only settings view: created with the agentDir as cwd so no
   * project-level settings merge in (this panel manages the global profile;
   * project `.pi/` config varies per conversation cwd).
   */
  private settings(): SettingsManager {
    return SettingsManager.create(this.agentDir, this.agentDir);
  }

  async list(): Promise<ExtensionCatalog> {
    const settings = this.settings();
    const directoryEntries = scanExtensionsDir(this.enabledDir);
    const disabledEntries = scanExtensionsDir(this.disabledDir);
    const settingsPaths = settings.getExtensionPaths();

    // One probe load covering the enabled directory plus configured paths —
    // the same combination pi resolves for a session (minus project-local).
    const probe =
      directoryEntries.length > 0 || settingsPaths.length > 0
        ? await discoverAndLoadExtensions(settingsPaths, this.agentDir, this.agentDir)
        : { extensions: [], errors: [] };
    const probeFor = (entryPath: string, kind: "file" | "directory") => {
      const owns = (probedPath: string) =>
        probedPath === entryPath ||
        (kind === "directory" && probedPath.startsWith(entryPath + path.sep));
      const loaded = probe.extensions.filter((extension) => owns(extension.resolvedPath));
      const errors = probe.errors
        .map((error) => ({ ...error, resolved: resolveSettingsPath(error.path, this.agentDir) }))
        .filter((error) => owns(error.resolved));
      return {
        tools: loaded.flatMap((extension) =>
          [...extension.tools.values()].map((tool) => ({
            name: tool.definition.name,
            description: tool.definition.description,
          })),
        ),
        commands: loaded.flatMap((extension) =>
          [...extension.commands.values()].map((command) => ({
            name: command.name,
            description: command.description,
          })),
        ),
        error: errors.length > 0 ? errors.map((error) => error.error).join("; ") : undefined,
      };
    };

    const entries: ExtensionCatalogEntry[] = [
      ...directoryEntries.map(
        (entry): ExtensionCatalogEntry => ({
          name: entry.name,
          path: entry.path,
          kind: entry.kind,
          source: "directory",
          enabled: true,
          ...probeFor(entry.path, entry.kind),
        }),
      ),
      ...disabledEntries.map(
        (entry): ExtensionCatalogEntry => ({
          name: entry.name,
          path: entry.path,
          kind: entry.kind,
          source: "directory",
          enabled: false,
          tools: [],
          commands: [],
        }),
      ),
      ...settingsPaths.map((configured): ExtensionCatalogEntry => {
        const resolved = resolveSettingsPath(configured, this.agentDir);
        const kind = isDirAt(resolved) ? "directory" : "file";
        const exists = fs.existsSync(resolved);
        const probed = exists
          ? probeFor(resolved, kind)
          : { tools: [], commands: [], error: "Path does not exist." };
        return {
          name: configured,
          path: resolved,
          kind,
          source: "settings",
          enabled: true,
          ...probed,
        };
      }),
    ];

    return {
      directory: this.enabledDir,
      disabledDirectory: this.disabledDir,
      entries,
      packages: settings.getPackages().map((source) => ({
        source: typeof source === "string" ? source : source.source,
        filtered: typeof source !== "string",
      })),
    };
  }

  async setEnabled(input: SetExtensionEnabledInput): Promise<void> {
    const from = path.join(input.enabled ? this.disabledDir : this.enabledDir, input.name);
    const to = path.join(input.enabled ? this.enabledDir : this.disabledDir, input.name);
    if (!fs.existsSync(from)) {
      if (fs.existsSync(to)) return; // already in the requested state
      throw new AppRuntimeError("invalid_input", `Unknown extension: ${input.name}.`);
    }
    if (fs.existsSync(to)) {
      throw new AppRuntimeError(
        "invalid_input",
        `Both an enabled and a disabled "${input.name}" exist; resolve the duplicate on disk first.`,
      );
    }
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
    } catch (error) {
      throw new AppRuntimeError(
        "internal",
        `Failed to move extension: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async delete(input: DeleteExtensionInput): Promise<void> {
    // Disabled entries are deletable too, so look in both directories.
    const target = [this.enabledDir, this.disabledDir]
      .map((dir) => path.join(dir, input.name))
      .find((candidate) => fs.existsSync(candidate));
    if (!target) {
      throw new AppRuntimeError("invalid_input", `Unknown extension: ${input.name}.`);
    }
    try {
      fs.rmSync(target, { recursive: true });
    } catch (error) {
      throw new AppRuntimeError(
        "internal",
        `Failed to delete extension: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async addPath(input: ExtensionPathInput): Promise<void> {
    const settings = this.settings();
    const paths = settings.getExtensionPaths();
    if (paths.includes(input.path)) return;
    settings.setExtensionPaths([...paths, input.path]);
    await flushOrThrow(settings);
  }

  async removePath(input: ExtensionPathInput): Promise<void> {
    const settings = this.settings();
    const paths = settings.getExtensionPaths();
    if (!paths.includes(input.path)) {
      throw new AppRuntimeError("invalid_input", `Path not in settings: ${input.path}.`);
    }
    settings.setExtensionPaths(paths.filter((entry) => entry !== input.path));
    await flushOrThrow(settings);
  }
}

/**
 * Pi's SettingsManager writes asynchronously and swallows errors; flush and
 * surface them (same pattern as PiSettingsService.flushOrThrow).
 */
async function flushOrThrow(settings: SettingsManager): Promise<void> {
  await settings.flush();
  const errors = settings.drainErrors();
  if (errors.length > 0) {
    throw new AppRuntimeError(
      "internal",
      `Failed to write settings: ${errors.map((entry) => entry.error.message).join("; ")}`,
      errors,
    );
  }
}

/** Settings paths may be relative or `~`-prefixed; resolve like pi does. */
function resolveSettingsPath(configured: string, cwd: string): string {
  if (configured.startsWith("~/") || configured === "~") {
    return path.join(process.env.HOME ?? "", configured.slice(1));
  }
  return path.resolve(cwd, configured);
}

/** Mirror of pi loader.ts discovery: which units in `dir` would load. */
function scanExtensionsDir(dir: string): ScannedEntry[] {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const entries: ScannedEntry[] = [];
  for (const dirent of dirents) {
    const entryPath = path.join(dir, dirent.name);
    const isDirectory = dirent.isDirectory() || (dirent.isSymbolicLink() && isDirAt(entryPath));
    if (!isDirectory && (dirent.isFile() || dirent.isSymbolicLink())) {
      if (dirent.name.endsWith(".ts") || dirent.name.endsWith(".js")) {
        entries.push({ name: dirent.name, path: entryPath, kind: "file" });
      }
      continue;
    }
    if (isDirectory && resolvePackageEntries(entryPath).length > 0) {
      entries.push({ name: dirent.name, path: entryPath, kind: "directory" });
    }
  }
  return entries;
}

function isDirAt(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** Pi's package entry rules: `pi.extensions` manifest paths, else index.ts/js. */
function resolvePackageEntries(dir: string): string[] {
  try {
    const packageJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
        pi?: { extensions?: string[] };
      };
      const declared = (pkg.pi?.extensions ?? [])
        .map((entry) => path.resolve(dir, entry))
        .filter((entry) => fs.existsSync(entry));
      if (declared.length > 0) return declared;
    }
    for (const index of ["index.ts", "index.js"]) {
      const candidate = path.join(dir, index);
      if (fs.existsSync(candidate)) return [candidate];
    }
  } catch {
    // Unreadable package: pi would skip it as well.
  }
  return [];
}
