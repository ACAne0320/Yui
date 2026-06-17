import type {
  AppDefaults,
  AppModel,
  AppSessionInfo,
  AppSessionSummary,
  ProviderStatus,
} from "@yui/contracts";

function defaultValues(defaults: AppDefaults): { model: string; thinking: string } {
  return {
    model:
      defaults.providerId && defaults.modelId
        ? `${defaults.providerId}/${defaults.modelId}`
        : "(unset)",
    thinking: defaults.thinkingLevel ?? "(unset)",
  };
}

export function printDefaults(defaults: AppDefaults): void {
  const { model, thinking } = defaultValues(defaults);
  // Shown values are effective (project settings merged over global); the
  // set-* commands write the global settings.json.
  process.stdout.write("Defaults (effective)\n");
  process.stdout.write(`  model     ${model}\n`);
  process.stdout.write(`  thinking  ${thinking}\n`);
  process.stdout.write("\nSet (writes global settings.json):\n");
  process.stdout.write("  yui config set-model <provider/model>     (see `yui models list`)\n");
  process.stdout.write("  yui config set-thinking <off|minimal|low|medium|high|xhigh>\n");
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printProviders(providers: ProviderStatus[]): void {
  if (providers.length === 0) {
    process.stdout.write("No providers found.\n");
    return;
  }
  for (const p of providers) {
    const mark = p.configured ? "✓" : "·";
    const source = p.authSource ? ` (${p.authSource})` : "";
    process.stdout.write(`${mark} ${p.displayName}${source} — ${p.availableModelCount} model(s)\n`);
  }
}

export interface ProfileView {
  homeDir: string;
  agentDir: string;
  sessionDir: string;
  authFile: string;
  cwd: string;
  /** Whether YUI_HOME was set in the environment (vs. the dev default). */
  fromEnv: boolean;
}

export function printProfile(
  view: ProfileView,
  providers: ProviderStatus[],
  defaults: AppDefaults,
): void {
  const origin = view.fromEnv ? "from YUI_HOME" : "dev default (YUI_HOME unset)";
  process.stdout.write("Yui profile\n");
  process.stdout.write(`  home:     ${view.homeDir}  (${origin})\n`);
  process.stdout.write(`  agent:    ${view.agentDir}\n`);
  process.stdout.write(`  sessions: ${view.sessionDir}\n`);
  process.stdout.write(`  auth:     ${view.authFile}\n`);
  process.stdout.write(`  cwd:      ${view.cwd}\n`);
  const { model, thinking } = defaultValues(defaults);
  process.stdout.write("  default:\n");
  process.stdout.write(`    model     ${model}\n`);
  process.stdout.write(`    thinking  ${thinking}\n`);
  process.stdout.write("Providers\n");
  if (providers.length === 0) {
    process.stdout.write("  (none)\n");
    return;
  }
  for (const p of providers) {
    const mark = p.configured ? "✓" : "·";
    const source = p.authSource ? ` (${p.authSource})` : "";
    process.stdout.write(
      `  ${mark} ${p.displayName}${source} — ${p.availableModelCount} model(s)\n`,
    );
  }
}

export function printSessions(sessions: AppSessionSummary[]): void {
  if (sessions.length === 0) {
    process.stdout.write("No sessions yet. Start one with `yui chat`.\n");
    return;
  }
  for (const s of sessions) {
    const when = new Date(s.updatedAt).toISOString().replace("T", " ").slice(0, 16);
    const id = s.sessionId.slice(0, 8);
    process.stdout.write(`${id}  ${when}  ${String(s.messageCount).padStart(3)} msg  ${s.title}\n`);
    process.stdout.write(`          ${s.cwd}\n`);
  }
}

export function printSessionInfo(info: AppSessionInfo): void {
  const model = info.model ? `${info.model.providerId}/${info.model.modelId}` : "(none)";
  process.stdout.write(`${info.title}\n`);
  process.stdout.write(`  id:       ${info.sessionId}\n`);
  process.stdout.write(`  model:    ${model}  thinking: ${info.thinkingLevel}\n`);
  process.stdout.write(`  cwd:      ${info.cwd}\n`);
  process.stdout.write(`  messages: ${info.messageCount}\n`);
}

export function printModels(models: AppModel[]): void {
  if (models.length === 0) {
    process.stdout.write(
      "No available models. Configure a provider with `yui auth set <provider>`.\n",
    );
    return;
  }
  for (const m of models) {
    const thinking = m.reasoning ? ` [thinking: ${m.availableThinkingLevels.join(",")}]` : "";
    process.stdout.write(`${m.providerId}/${m.modelId} — ${m.name}${thinking}\n`);
  }
}
