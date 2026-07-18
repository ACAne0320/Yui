#!/usr/bin/env -S node --import tsx
import { Command } from "commander";
import { authList, authRemove, authSet } from "./commands/auth.ts";
import { runChat } from "./commands/chat.ts";
import { configSetModel, configSetThinking, configShow } from "./commands/config.ts";
import { modelsList } from "./commands/models.ts";
import { profileShow } from "./commands/profile.ts";
import { sessionList, sessionShow } from "./commands/session.ts";

const program = new Command();
program.name("yui").description("Yui local-first agent CLI");

const auth = program.command("auth").description("Manage provider credentials");
auth
  .command("set <provider> [apiKey]")
  .description("Store an API key (pass directly or enter at a masked prompt)")
  .action(async (provider: string, apiKey: string | undefined) => {
    process.exitCode = await authSet(provider, apiKey);
  });
auth
  .command("remove <provider>")
  .description("Remove stored credentials for a provider")
  .action(async (provider: string) => {
    process.exitCode = await authRemove(provider);
  });
auth
  .command("list")
  .description("Show provider authentication status")
  .option("--json", "stable JSON output")
  .action(async (opts: { json?: boolean }) => {
    process.exitCode = await authList(opts);
  });

const config = program
  .command("config")
  .description("View and set persistent defaults (global settings.json)");
config
  .command("show", { isDefault: true })
  .description("Show current defaults")
  .option("--json", "stable JSON output")
  .action(async (opts: { json?: boolean }) => {
    process.exitCode = await configShow(opts);
  });
config
  .command("set-model <model>")
  .description("Set the default provider/model, e.g. anthropic/claude-opus-4-8")
  .action(async (ref: string) => {
    process.exitCode = await configSetModel(ref);
  });
config
  .command("set-thinking <level>")
  .description("Set the default thinking level (off|minimal|low|medium|high|xhigh|max)")
  .action(async (level: string) => {
    process.exitCode = await configSetThinking(level);
  });

const models = program.command("models").description("Inspect available models");
models
  .command("list")
  .description("List models available from configured providers")
  .option("--json", "stable JSON output")
  .action(async (opts: { json?: boolean }) => {
    process.exitCode = await modelsList(opts);
  });

program
  .command("profile")
  .description("Show which profile (home/session dirs) the runtime uses")
  .option("--json", "stable JSON output")
  .action(async (opts: { json?: boolean }) => {
    process.exitCode = await profileShow(opts);
  });

const session = program.command("session").description("Inspect persisted sessions");
session
  .command("list")
  .description("List persisted sessions")
  .option("--cwd <path>", "working directory to filter by", process.cwd())
  .option("--all", "list sessions across all projects")
  .option("--json", "stable JSON output")
  .action(async (opts: { cwd?: string; all?: boolean; json?: boolean }) => {
    process.exitCode = await sessionList(opts);
  });
session
  .command("show <session>")
  .description("Render a session's conversation history (by id, id prefix, or path)")
  .option(
    "--context",
    "show the model-restore context (compaction folded) instead of the full transcript",
  )
  .option("--json", "stable JSON output")
  .action(async (ref: string, opts: { json?: boolean; context?: boolean }) => {
    process.exitCode = await sessionShow(ref, opts);
  });

program
  .command("chat")
  .description("Start an interactive agent session")
  .option("--cwd <path>", "working directory", process.cwd())
  .option("--resume <session>", "resume a session by id, id prefix, or path")
  .option("--provider <provider>", "provider id")
  .option("--model <model>", "model id")
  .option("--thinking <level>", "thinking level")
  .option("--json", "emit agent events as JSON lines")
  .action(async (opts) => {
    process.exitCode = await runChat(opts);
  });

await program.parseAsync(process.argv);
