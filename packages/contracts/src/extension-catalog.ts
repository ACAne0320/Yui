// Management contracts for the user's global Pi extensions — distinct from
// `extensions.ts`, which covers the live extension UI bridge of a session.
//
// Pi loads extensions from three global sources, and the catalog surfaces all
// of them: the `<agentDir>/extensions/` directory (managed here as files),
// explicit paths in settings.json `extensions` (managed here as list entries),
// and settings.json `packages` (npm/git sources installed via pi's package
// manager — listed read-only). Extensions are code, so there is no form
// editor: the catalog reports what discovery would load and points the user
// at the files for actual editing.

import { z } from "zod";

/** One manageable extension unit pi's discovery would load. */
export interface ExtensionCatalogEntry {
  /**
   * Identity used by management calls. For directory entries: the file or
   * directory basename. For settings entries: the configured path string,
   * exactly as it appears in settings.json.
   */
  name: string;
  /** Absolute path of the file or directory. */
  path: string;
  kind: "file" | "directory";
  /** Where the entry comes from, which decides the management operations. */
  source: "directory" | "settings";
  /** Directory entries can be parked in `extensions-disabled/`. */
  enabled: boolean;
  /** From a probe load. Empty for disabled entries (their code never runs). */
  tools: Array<{ name: string; description?: string }>;
  commands: Array<{ name: string; description?: string }>;
  /** Load-probe failure, when the extension could not be loaded. */
  error?: string;
}

/** A settings.json `packages` source (npm/git), managed via the pi CLI. */
export interface ExtensionPackageInfo {
  source: string;
  /** Object-form sources filter which resources of the package load. */
  filtered: boolean;
}

export interface ExtensionCatalog {
  /** The enabled extensions directory (`<agentDir>/extensions`). */
  directory: string;
  /** Where disabled entries are parked (`<agentDir>/extensions-disabled`). */
  disabledDirectory: string;
  entries: ExtensionCatalogEntry[];
  packages: ExtensionPackageInfo[];
}

/**
 * Directory-entry names feed filesystem operations, so they must be plain
 * basenames: no path separators, no `.`/`..`.
 */
const extensionNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !/[/\\]/.test(name) && name !== "." && name !== "..", {
    message: "Invalid extension name",
  });

export const setExtensionEnabledInputSchema = z.object({
  name: extensionNameSchema,
  enabled: z.boolean(),
});
export type SetExtensionEnabledInput = z.infer<typeof setExtensionEnabledInputSchema>;

export const deleteExtensionInputSchema = z.object({
  name: extensionNameSchema,
});
export type DeleteExtensionInput = z.infer<typeof deleteExtensionInputSchema>;

/** A settings.json `extensions` path entry (kept verbatim, as pi does). */
export const extensionPathInputSchema = z.object({
  path: z.string().trim().min(1).max(1024),
});
export type ExtensionPathInput = z.infer<typeof extensionPathInputSchema>;
