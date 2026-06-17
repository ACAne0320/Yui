# Repository Guidelines

## Project Structure & Module Organization

Yui is a pnpm TypeScript monorepo for a local-first desktop app and CLI. Primary code lives under `apps/` and `packages/`:

- `apps/desktop`: Electron app. `main/` owns runtime wiring and IPC, `preload/` exposes the typed bridge, and `renderer/` contains the React UI.
- `apps/cli`: Commander-based CLI adapters and text/JSON output rendering.
- `packages/contracts`: Yui-owned DTOs, schemas, and shared contract types.
- `packages/runtime`: application core, persistence, Pi integration, and service logic.
- `assets/`, `design/`, `docs/`: media, design notes, and architecture references.
- `pi/`: read-only upstream Pi reference, not buildable project code.

## Build, Test, and Development Commands

Use Node.js `>=22.12.0` and pnpm `9.15.0`.

- `corepack enable && pnpm install`: install dependencies.
- `pnpm desktop:dev`: run the Electron app with electron-vite.
- `pnpm desktop:build`: build the desktop app.
- `pnpm --filter @yui/cli yui <args>`: run the CLI from source.
- `pnpm typecheck`: run TypeScript checks.
- `pnpm lint`: run oxlint on `packages` and `apps`.
- `pnpm format` / `pnpm format:check`: apply or verify oxfmt formatting.
- `pnpm test`: run Vitest.
- `pnpm check`: run the full CI gate.

## Coding Style & Naming Conventions

Use strict TypeScript, ESM modules, and explicit `.ts` extensions in local imports. Keep `packages/contracts` free of internal dependencies. Keep Pi-specific imports inside `packages/runtime`; renderer and CLI code should consume Yui contracts and runtime APIs only. Name React components in `PascalCase`, hooks with `use*`, and tests as `*.test.ts` or `*.test.tsx`.

## Testing Guidelines

Tests are colocated with source and collected by `vitest.config.ts`. Runtime and CLI tests run in Node; renderer component tests use jsdom and Testing Library. Prefer focused tests for contract mapping, reducers, persistence, and UI state transitions. Run `pnpm test path/to/file.test.ts` or `pnpm test -t "case name"` for targeted work.

## Pi Integration Gotchas

These are non-obvious and have caused real bugs:

- **`pi/` diverges from the installed dependency.** The buildable runtime depends on `@earendil-works/pi-coding-agent@0.78.0`, whose API differs from the newer `pi/` source checkout (reference-only, excluded from build and tests). Read `pi/` for design intent, but write runtime code against `node_modules/@earendil-works/pi-coding-agent/dist/*.d.ts` and verify any Pi API before relying on it.
- **Pi services cannot be shared across concurrent sessions.** In 0.78.0 an `AgentSession` writes its own action handlers into the services-owned extension runtime, so two live sessions on one services object hijack each other's extension routing. Yui supports multiple live sessions by calling `createAgentSessionServices` per session and reusing live sessions by `sessionPath`; only `authStorage` and `modelRegistry` are profile-level shareable.
- **Desktop must route Pi's `fetch` through Electron.** Pi providers/OAuth call the bare global `fetch` (undici), which ignores the system proxy and offers no injection point. `apps/desktop/src/main/network/proxy.ts` (`configureMainNetwork()`, before runtime init) rebinds `globalThis.fetch` to `net.fetch`; keep the env-proxy fallback. The CLI host's equivalent is an undici `EnvHttpProxyAgent`.

## Git Rules

- Do not create commits unless the user explicitly asks to commit or push.
- When committing, use a Conventional Commits prefix.

## Security & Agent-Specific Notes

Do not commit secrets, provider keys, generated profile data, or local `YUI_HOME` contents. Yui stores profile data in `~/.yui` by default; set `YUI_HOME` to override (developers typically use `~/.yui-dev`). For library, SDK, API, CLI, or cloud-service questions, fetch current docs with `npx ctx7@latest library ...` then `npx ctx7@latest docs ...`.
