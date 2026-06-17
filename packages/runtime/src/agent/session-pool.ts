// Owns active AgentSession adapters keyed by session id. Each pooled session
// wires Pi's `subscribe` into an AgentEventMapper and fans the resulting Yui
// events out to per-session listeners. The pool also owns the session's
// ExtensionUiBridge (which emits through the same fan-out) and the Pi services
// the session was created from. Subscriptions are torn down on close /
// dispose so listeners do not leak.

import { resolve } from "node:path";
import type { AgentSession, AgentSessionServices } from "@earendil-works/pi-coding-agent";
import { type AppAgentEvent, AppRuntimeError } from "@yui/contracts";
import { AgentEventMapper } from "./event-mapper.ts";
import { ExtensionUiBridge } from "./extension-ui-bridge.ts";

type Listener = (event: AppAgentEvent) => void;

interface PooledSession {
  session: AgentSession;
  services: AgentSessionServices;
  bridge: ExtensionUiBridge;
  mapper: AgentEventMapper;
  listeners: Set<Listener>;
  piUnsubscribe: () => void;
}

export class SessionPool {
  private readonly sessions = new Map<string, PooledSession>();
  private readonly sessionPaths = new Map<string, string>();

  add(session: AgentSession, services: AgentSessionServices): ExtensionUiBridge {
    const sessionId = session.sessionId;
    const existing = this.sessions.get(sessionId);
    if (existing) return existing.bridge;

    const mapper = new AgentEventMapper({ sessionId });
    const listeners = new Set<Listener>();
    const fanOut: Listener = (appEvent) => {
      // Set iteration tolerates a listener unsubscribing itself mid-dispatch.
      for (const listener of listeners) listener(appEvent);
    };
    const bridge = new ExtensionUiBridge(sessionId, fanOut);
    const piUnsubscribe = session.subscribe((event) => {
      for (const appEvent of mapper.map(event)) fanOut(appEvent);
    });

    this.sessions.set(sessionId, { session, services, bridge, mapper, listeners, piUnsubscribe });
    const sessionPath = session.sessionManager.getSessionFile();
    if (sessionPath) this.sessionPaths.set(normalizeSessionPath(sessionPath), sessionId);
    return bridge;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getSession(sessionId: string): AgentSession {
    return this.require(sessionId).session;
  }

  getServices(sessionId: string): AgentSessionServices {
    return this.require(sessionId).services;
  }

  getBridge(sessionId: string): ExtensionUiBridge {
    return this.require(sessionId).bridge;
  }

  findBySessionPath(
    sessionPath: string,
  ): { session: AgentSession; services: AgentSessionServices } | undefined {
    const sessionId = this.sessionPaths.get(normalizeSessionPath(sessionPath));
    if (!sessionId) return undefined;
    const pooled = this.sessions.get(sessionId);
    return pooled ? { session: pooled.session, services: pooled.services } : undefined;
  }

  /** Fan an event out to this session's listeners (e.g. extension errors). */
  publish(sessionId: string, event: AppAgentEvent): void {
    const pooled = this.sessions.get(sessionId);
    if (!pooled) return;
    for (const listener of pooled.listeners) listener(event);
  }

  subscribe(sessionId: string, listener: Listener): () => void {
    const pooled = this.require(sessionId);
    pooled.listeners.add(listener);
    return () => pooled.listeners.delete(listener);
  }

  isBusy(sessionId: string): boolean {
    return this.require(sessionId).session.isStreaming;
  }

  async close(sessionId: string): Promise<void> {
    const pooled = this.sessions.get(sessionId);
    if (!pooled) return;
    // Dispose the bridge first so pending extension dialogs resolve and their
    // "closed" dismissals still reach subscribed listeners.
    pooled.bridge.dispose();
    pooled.piUnsubscribe();
    pooled.listeners.clear();
    pooled.session.dispose();
    this.sessions.delete(sessionId);
    const sessionPath = pooled.session.sessionManager.getSessionFile();
    if (sessionPath) this.sessionPaths.delete(normalizeSessionPath(sessionPath));
  }

  async dispose(): Promise<void> {
    // Deleting the current key during Map key-iteration is well-defined.
    for (const sessionId of this.sessions.keys()) {
      await this.close(sessionId);
    }
  }

  private require(sessionId: string): PooledSession {
    const pooled = this.sessions.get(sessionId);
    if (!pooled) {
      throw new AppRuntimeError("unknown_session", `Unknown session: ${sessionId}`);
    }
    return pooled;
  }
}

function normalizeSessionPath(sessionPath: string): string {
  return resolve(sessionPath);
}
