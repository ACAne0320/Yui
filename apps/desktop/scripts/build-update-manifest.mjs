#!/usr/bin/env node
// Builds the static `latest.json` update manifest the in-app updater reads
// instead of the rate-limited GitHub releases API (see
// apps/desktop/src/main/update/updater.ts). Run during release, after the ZIPs
// and SHA256SUMS.txt exist (see .github/workflows/release.yml).
//
// Usage: node build-update-manifest.mjs <distDir> <changelogPath> <outFile>
// Env:   GITHUB_REPOSITORY="owner/repo"  GITHUB_REF_NAME="vX.Y.Z"
//
// The manifest mirrors the `UpdateManifest` shape consumed by select-update.ts;
// keep the two in sync.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [distDir, changelogPath, outFile] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;

if (!distDir || !changelogPath || !outFile) {
  throw new Error("Usage: build-update-manifest.mjs <distDir> <changelogPath> <outFile>");
}
if (!repo || !tag) {
  throw new Error("GITHUB_REPOSITORY and GITHUB_REF_NAME must be set.");
}

const version = tag.replace(/^v/, "");

// SHA-256 hex keyed by filename, parsed from `shasum -a 256` output.
const checksums = new Map();
const sumsText = await readFile(join(distDir, "SHA256SUMS.txt"), "utf8");
for (const line of sumsText.split("\n")) {
  const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
  if (match) {
    checksums.set(match[2].trim(), match[1].toLowerCase());
  }
}

// One ZIP per built arch; electron-builder names them `Yui-<version>-mac-<arch>.zip`.
const assets = {};
for (const name of await readdir(distDir)) {
  if (!name.endsWith(".zip")) {
    continue;
  }
  const arch = /-mac-([^.]+)\.zip$/.exec(name)?.[1] ?? "unknown";
  assets[arch] = {
    zipName: name,
    zipUrl: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
    sha256: checksums.get(name) ?? null,
  };
}
if (Object.keys(assets).length === 0) {
  throw new Error(`No .zip artifacts found in ${distDir}.`);
}

// Every released CHANGELOG section as newest-first {version, notes}, so a
// far-behind user gets the aggregated changelog. Skips the [Unreleased] section.
const versions = [];
const changelog = await readFile(changelogPath, "utf8");
const headings = [...changelog.matchAll(/^## \[([^\]]+)\][^\n]*$/gm)];
for (let i = 0; i < headings.length; i += 1) {
  const label = headings[i][1];
  if (!/^\d+\.\d+\.\d+/.test(label)) {
    continue; // "Unreleased" and other non-version sections
  }
  const start = headings[i].index + headings[i][0].length;
  const end = i + 1 < headings.length ? headings[i + 1].index : changelog.length;
  versions.push({ version: label, notes: changelog.slice(start, end).trim() });
}

const manifest = {
  version,
  tag,
  publishedAt: new Date().toISOString(),
  url: `https://github.com/${repo}/releases/tag/${tag}`,
  assets,
  versions,
};

await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outFile} for ${tag} (${Object.keys(assets).join(", ")}).`);
