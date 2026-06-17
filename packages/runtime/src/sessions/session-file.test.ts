import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSessionFile } from "./session-file.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "yui-session-file-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("assertSessionFile", () => {
  it("accepts a file whose first line is a session header", () => {
    const file = join(dir, "ok.jsonl");
    writeFileSync(file, `${JSON.stringify({ type: "session", id: "abc" })}\n{"type":"message"}\n`);
    expect(() => assertSessionFile(file)).not.toThrow();
  });

  it("rejects a missing file", () => {
    expect(() => assertSessionFile(join(dir, "nope.jsonl"))).toThrowError(/does not exist/);
  });

  it("rejects a non-JSON text file without modifying it", () => {
    const file = join(dir, "notes.txt");
    const original = "important notes\nline two\n";
    writeFileSync(file, original);
    expect(() => assertSessionFile(file)).toThrowError(/Not a Yui session file/);
    // The guard must never write to the file it rejects.
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("rejects valid JSON that is not a session header", () => {
    const file = join(dir, "data.json");
    writeFileSync(file, `${JSON.stringify({ type: "message", id: "x" })}\n`);
    expect(() => assertSessionFile(file)).toThrowError(/Not a Yui session file/);
  });

  it("rejects an empty file", () => {
    const file = join(dir, "empty.jsonl");
    writeFileSync(file, "");
    expect(() => assertSessionFile(file)).toThrowError(/Not a Yui session file/);
  });
});
