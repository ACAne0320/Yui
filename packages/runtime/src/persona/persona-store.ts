import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  AppRuntimeError,
  type DeleteMemoryInput,
  type ListMemoryInput,
  type MemoryEntry,
  type MemoryScope,
  type PersonaConfig,
  personaConfigSchema,
  type PersonaService,
  type RuntimeConfig,
  type SaveMemoryInput,
  type SaveSoulInput,
  type SetPersonaConfigInput,
  type SoulDoc,
} from "@yui/contracts";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { bigrams, coverage, jaccard } from "./text-match.ts";

/** Min name-bigram Jaccard for a model `remember` to update an existing entry. */
const DEDUP_THRESHOLD = 0.7;
/** Min query-bigram coverage for a `recall` entry to count as a match. */
const RECALL_THRESHOLD = 0.34;
/** Default cap on entries returned by a single recall. */
const RECALL_LIMIT = 8;

const DEFAULT_CONFIG: PersonaConfig = { memoryEnabled: true };
const MAX_FILENAME_SEGMENT = 255;
const stores = new Map<string, PersonaStore>();

export interface ProjectMemoryInfo {
  slug: string;
  cwd: string;
  storedCwd?: string;
  cwdMatches: boolean;
  indexPath: string;
  memoryDir: string;
}

export interface SaveMemoryEntryInput {
  scope: MemoryScope;
  cwd?: string;
  slug?: string;
  name: string;
  description: string;
  tags?: string[];
  createdAt?: string;
  content: string;
}

export class PersonaStore implements PersonaService {
  private writeQueue: Promise<void> = Promise.resolve();

  static forConfig(config: RuntimeConfig): PersonaStore {
    const key = resolve(config.homeDir);
    const existing = stores.get(key);
    if (existing) return existing;
    const store = new PersonaStore(config);
    stores.set(key, store);
    return store;
  }

  constructor(private readonly config: RuntimeConfig) {}

  get personaDir(): string {
    return join(this.config.homeDir, "persona");
  }

  get soulPath(): string {
    return join(this.personaDir, "SOUL.md");
  }

  get configPath(): string {
    return join(this.personaDir, "config.json");
  }

  get globalMemoryIndexPath(): string {
    return join(this.personaDir, "MEMORY.md");
  }

  get globalMemoryDir(): string {
    return join(this.personaDir, "memory");
  }

  get projectsDir(): string {
    return join(this.personaDir, "projects");
  }

  async getConfig(): Promise<PersonaConfig> {
    await this.waitForWrites();
    await this.ensureBaseFiles();
    try {
      const parsed = personaConfigSchema.safeParse(
        JSON.parse(await readFile(this.configPath, "utf-8")),
      );
      return parsed.success ? parsed.data : { ...DEFAULT_CONFIG };
    } catch (error) {
      if (isNotFound(error) || error instanceof SyntaxError) return { ...DEFAULT_CONFIG };
      throw toInternalError("Failed to read persona config", error);
    }
  }

  async setConfig(input: SetPersonaConfigInput): Promise<PersonaConfig> {
    return this.enqueueWrite(async () => {
      const config = personaConfigSchema.parse(input);
      await this.ensureBaseFiles();
      await atomicWrite(this.configPath, `${JSON.stringify(config, null, 2)}\n`);
      return config;
    });
  }

  async getSoul(): Promise<SoulDoc> {
    await this.waitForWrites();
    return this.readSoulDirect();
  }

  async saveSoul(input: SaveSoulInput): Promise<SoulDoc> {
    return this.enqueueWrite(async () => {
      await this.ensureBaseFiles();
      await atomicWrite(this.soulPath, input.content);
      return this.readSoulDirect();
    });
  }

  async ensureProjectMemory(cwd: string): Promise<ProjectMemoryInfo> {
    return this.enqueueWrite(() => this.ensureProjectMemoryDirect(cwd));
  }

  projectMemoryInfo(cwd: string): ProjectMemoryInfo {
    return this.projectMemoryInfoDirect(cwd);
  }

  // --- PersonaService memory methods (input-object form for IPC) ----------

  listMemory(input: ListMemoryInput): Promise<MemoryEntry[]> {
    return this.listMemoryEntries(input.scope, input.cwd);
  }

  saveMemory(input: SaveMemoryInput): Promise<MemoryEntry> {
    return this.saveMemoryEntry(input);
  }

  deleteMemory(input: DeleteMemoryInput): Promise<void> {
    return this.deleteMemoryEntry(input.scope, input.slug, input.cwd);
  }

  /**
   * Model-facing write: derive a name/description from free text, dedup against
   * existing entries in the scope (update the closest near-duplicate instead of
   * piling up restatements), then persist. Returns whether it updated an entry.
   */
  async rememberMemory(input: {
    scope: MemoryScope;
    cwd?: string;
    text: string;
    tags?: string[];
  }): Promise<{ entry: MemoryEntry; updated: boolean }> {
    return this.enqueueWrite(async () => {
      const text = input.text.trim();
      const { name, description } = deriveEntryFields(text);
      const existing = await this.listMemoryEntriesDirect(input.scope, input.cwd);
      const match = findSimilarEntry(existing, name);
      const entry = await this.saveMemoryEntryDirect({
        scope: input.scope,
        cwd: input.cwd,
        slug: match?.slug,
        name,
        description,
        tags: input.tags,
        content: text,
        createdAt: match?.createdAt,
      });
      return { entry, updated: match !== undefined };
    });
  }

  /** Keyword + recency search over a scope (or both) for the `recall` tool. */
  async searchMemory(input: {
    query: string;
    scope?: MemoryScope;
    cwd?: string;
    limit?: number;
  }): Promise<MemoryEntry[]> {
    await this.waitForWrites();
    const scopes: MemoryScope[] = input.scope ? [input.scope] : ["global", "cwd"];
    const collected: MemoryEntry[] = [];
    for (const scope of scopes) {
      if (scope === "cwd" && !input.cwd) continue;
      collected.push(...(await this.listMemoryEntriesDirect(scope, input.cwd)));
    }
    return collected
      .map((entry) => ({
        entry,
        score: coverage(input.query, `${entry.name}\n${entry.description}\n${entry.content}`),
      }))
      .filter((scored) => scored.score >= RECALL_THRESHOLD)
      .toSorted((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt))
      .slice(0, input.limit ?? RECALL_LIMIT)
      .map((scored) => scored.entry);
  }

  async saveMemoryEntry(input: SaveMemoryEntryInput): Promise<MemoryEntry> {
    return this.enqueueWrite(() => this.saveMemoryEntryDirect(input));
  }

  async listMemoryEntries(scope: MemoryScope, cwd?: string): Promise<MemoryEntry[]> {
    await this.waitForWrites();
    return this.listMemoryEntriesDirect(scope, cwd);
  }

  private async saveMemoryEntryDirect(input: SaveMemoryEntryInput): Promise<MemoryEntry> {
    const location = await this.ensureMemoryLocation(input.scope, input.cwd);
    const slug = input.slug?.trim() || (await this.nextEntrySlug(location.memoryDir, input.name));
    const createdAt = input.createdAt ?? new Date().toISOString();
    const entryPath = join(location.memoryDir, `${slug}.md`);
    const entry: MemoryEntry = {
      slug,
      scope: input.scope,
      name: input.name,
      description: input.description,
      tags: input.tags ?? [],
      createdAt,
      content: input.content,
      path: entryPath,
      cwd: input.scope === "cwd" ? location.cwd : undefined,
    };
    await atomicWrite(entryPath, formatMemoryEntry(entry));
    await this.upsertIndexLine(
      location.indexPath,
      input.scope === "cwd" ? location.cwd : undefined,
      entry,
    );
    return entry;
  }

  private async listMemoryEntriesDirect(scope: MemoryScope, cwd?: string): Promise<MemoryEntry[]> {
    const location =
      scope === "global"
        ? this.globalMemoryLocation()
        : this.projectMemoryInfoDirect(requireCwd(cwd));
    let files: string[];
    try {
      files = await readdir(location.memoryDir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw toInternalError("Failed to list persona memory", error);
    }
    const entries = await Promise.all(
      files
        .filter((file) => file.endsWith(".md"))
        .map((file) => this.readMemoryEntry(join(location.memoryDir, file), scope, location.cwd)),
    );
    return entries
      .filter((entry): entry is MemoryEntry => entry !== undefined)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteMemoryEntry(scope: MemoryScope, slug: string, cwd?: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const location =
        scope === "global"
          ? this.globalMemoryLocation()
          : await this.ensureProjectMemoryDirect(requireCwd(cwd));
      await rm(join(location.memoryDir, `${slug}.md`), { force: true });
      await this.removeIndexLine(
        location.indexPath,
        scope === "cwd" ? location.cwd : undefined,
        slug,
      );
    });
  }

  private async readSoulDirect(): Promise<SoulDoc> {
    try {
      const [content, info] = await Promise.all([
        readFile(this.soulPath, "utf-8"),
        stat(this.soulPath),
      ]);
      return { content, path: this.soulPath, updatedAt: info.mtime.toISOString() };
    } catch (error) {
      if (isNotFound(error)) return { content: "", path: this.soulPath };
      throw toInternalError("Failed to read SOUL.md", error);
    }
  }

  private async ensureBaseFiles(): Promise<void> {
    await mkdir(this.personaDir, { recursive: true });
    await mkdir(this.globalMemoryDir, { recursive: true });
    await mkdir(this.projectsDir, { recursive: true });
    await writeFileIfMissing(this.configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    await writeFileIfMissing(this.soulPath, "");
    await writeFileIfMissing(this.globalMemoryIndexPath, "");
  }

  private globalMemoryLocation(): ProjectMemoryInfo {
    return {
      slug: "global",
      cwd: "",
      cwdMatches: true,
      indexPath: this.globalMemoryIndexPath,
      memoryDir: this.globalMemoryDir,
    };
  }

  private async ensureMemoryLocation(
    scope: MemoryScope,
    cwd: string | undefined,
  ): Promise<ProjectMemoryInfo> {
    if (scope === "global") {
      await this.ensureBaseFiles();
      return this.globalMemoryLocation();
    }
    return this.ensureProjectMemoryDirect(requireCwd(cwd));
  }

  private projectMemoryInfoDirect(cwd: string): ProjectMemoryInfo {
    const absoluteCwd = resolve(cwd);
    const slug = projectPathSlug(absoluteCwd);
    const root = join(this.projectsDir, slug);
    return {
      slug,
      cwd: absoluteCwd,
      cwdMatches: true,
      indexPath: join(root, "MEMORY.md"),
      memoryDir: join(root, "memory"),
    };
  }

  private async ensureProjectMemoryDirect(cwd: string): Promise<ProjectMemoryInfo> {
    await this.ensureBaseFiles();
    const info = this.projectMemoryInfoDirect(cwd);
    await mkdir(info.memoryDir, { recursive: true });
    const existing = await readOptional(info.indexPath);
    if (existing === undefined) {
      await atomicWrite(info.indexPath, formatIndex([], info.cwd));
      return info;
    }
    const storedCwd = readIndexCwd(existing);
    return { ...info, storedCwd, cwdMatches: storedCwd === undefined || storedCwd === info.cwd };
  }

  private async nextEntrySlug(memoryDir: string, name: string): Promise<string> {
    const base = slugifyEntryName(name);
    for (let index = 0; index < 1_000; index += 1) {
      const slug = index === 0 ? base : `${base}-${index + 1}`;
      try {
        await access(join(memoryDir, `${slug}.md`), fsConstants.F_OK);
      } catch (error) {
        if (isNotFound(error)) return slug;
        throw toInternalError("Failed to inspect persona memory entry", error);
      }
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private async upsertIndexLine(
    indexPath: string,
    cwd: string | undefined,
    entry: MemoryEntry,
  ): Promise<void> {
    const lines = await readIndexLines(indexPath);
    const link = `memory/${entry.slug}.md`;
    const next = [
      ...lines.filter((line) => !line.includes(`](${link})`)),
      `- [${escapeIndexText(entry.name)}](${link}) — ${escapeIndexText(entry.description)}`,
    ];
    await atomicWrite(indexPath, formatIndex(next, cwd));
  }

  private async removeIndexLine(
    indexPath: string,
    cwd: string | undefined,
    slug: string,
  ): Promise<void> {
    const link = `memory/${slug}.md`;
    const lines = (await readIndexLines(indexPath)).filter((line) => !line.includes(`](${link})`));
    await atomicWrite(indexPath, formatIndex(lines, cwd));
  }

  private async readMemoryEntry(
    filePath: string,
    scope: MemoryScope,
    cwd: string,
  ): Promise<MemoryEntry | undefined> {
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = splitFrontmatter(raw);
      const frontmatter = asRecord(parsed.frontmatter);
      return {
        slug: basename(filePath, ".md"),
        scope,
        name: stringField(frontmatter.name),
        description: stringField(frontmatter.description),
        tags: arrayField(frontmatter.tags),
        createdAt: stringField(frontmatter.createdAt),
        content: parsed.body,
        path: filePath,
        cwd: scope === "cwd" ? cwd : undefined,
      };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw toInternalError("Failed to read persona memory entry", error);
    }
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async waitForWrites(): Promise<void> {
    await this.writeQueue;
  }
}

export function projectPathSlug(cwd: string): string {
  const absolute = resolve(cwd);
  // POSIX-compatible readable form; also handles Windows separators/drive colon
  // for future portability.
  const readable = absolute.replaceAll(/[\\/]/g, "-").replaceAll(":", "-");
  if (readable.length <= MAX_FILENAME_SEGMENT) return readable;
  return createHash("sha256").update(absolute).digest("hex").slice(0, 16);
}

function formatMemoryEntry(entry: MemoryEntry): string {
  const frontmatter = {
    name: entry.name,
    description: entry.description,
    tags: entry.tags,
    createdAt: entry.createdAt,
    scope: entry.scope,
  };
  return `---\n${stringifyYaml(frontmatter)}---\n${entry.content ? `\n${entry.content}\n` : "\n"}`;
}

function formatIndex(lines: string[], cwd?: string): string {
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  if (!cwd) return body;
  return `---\n${stringifyYaml({ cwd })}---\n${body ? `\n${body}` : "\n"}`;
}

async function readIndexLines(indexPath: string): Promise<string[]> {
  const content = await readOptional(indexPath);
  if (!content) return [];
  const { body } = splitFrontmatter(content);
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readIndexCwd(content: string): string | undefined {
  const { frontmatter } = splitFrontmatter(content);
  return stringField(asRecord(frontmatter).cwd) || undefined;
}

function splitFrontmatter(content: string): { frontmatter: unknown; body: string } {
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const normalized = content.replaceAll("\r\n", "\n");
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: content };
  const yaml = normalized.slice(3, end).trim();
  const bodyStart = normalized.indexOf("\n", end + 4);
  const body = bodyStart === -1 ? "" : normalized.slice(bodyStart + 1);
  return { frontmatter: yaml ? parseYaml(yaml) : {}, body };
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(tmp, content, "utf-8");
  await rename(tmp, filePath);
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await writeFile(filePath, content, { encoding: "utf-8", flag: "wx" });
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function requireCwd(cwd: string | undefined): string {
  if (!cwd) throw new AppRuntimeError("invalid_input", "cwd is required for cwd persona memory.");
  return cwd;
}

/** Turn free `remember` text into a one-line name + short description. */
function deriveEntryFields(text: string): { name: string; description: string } {
  const collapsed = text.replaceAll(/\s+/g, " ").trim();
  const firstLine = (text.split(/\r?\n/).find((line) => line.trim()) ?? collapsed).trim();
  return { name: truncate(firstLine, 80), description: truncate(collapsed, 140) };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Closest existing entry whose name is a near-duplicate of `name`, if any. */
function findSimilarEntry(entries: MemoryEntry[], name: string): MemoryEntry | undefined {
  const target = bigrams(name);
  let best: { entry: MemoryEntry; score: number } | undefined;
  for (const entry of entries) {
    const score = jaccard(target, bigrams(entry.name));
    if (score >= DEDUP_THRESHOLD && (best === undefined || score > best.score)) {
      best = { entry, score };
    }
  }
  return best?.entry;
}

function slugifyEntryName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || randomUUID().slice(0, 8);
}

function escapeIndexText(text: string): string {
  return text.replaceAll("\n", " ").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error) && error.code === "EEXIST";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function toInternalError(message: string, error: unknown): AppRuntimeError {
  return new AppRuntimeError(
    "internal",
    `${message}: ${error instanceof Error ? error.message : String(error)}`,
    error,
  );
}
