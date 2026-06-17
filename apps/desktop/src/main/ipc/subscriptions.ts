import type { AppAgentEvent, AppRuntime } from "@yui/contracts";
import type { WebContents } from "electron";
import { desktopIpcChannels } from "../../shared/ipc-channels";

interface RendererSubscriptions {
  contents: WebContents;
  sessions: Map<string, () => void>;
  onDestroyed: () => void;
}

export class AgentSubscriptionRegistry {
  private readonly renderers = new Map<number, RendererSubscriptions>();

  constructor(private readonly runtime: AppRuntime) {}

  subscribe(contents: WebContents, sessionId: string): void {
    const entry = this.getOrCreate(contents);
    if (entry.sessions.has(sessionId)) {
      return;
    }

    try {
      const unsubscribe = this.runtime.agents.subscribe(sessionId, (event) => {
        this.sendEvent(contents, event);
      });
      entry.sessions.set(sessionId, unsubscribe);
    } catch (error) {
      if (entry.sessions.size === 0) {
        this.removeRenderer(contents.id);
      }
      throw error;
    }
  }

  unsubscribe(contents: WebContents, sessionId: string): void {
    const entry = this.renderers.get(contents.id);
    if (!entry) {
      return;
    }

    entry.sessions.get(sessionId)?.();
    entry.sessions.delete(sessionId);
    if (entry.sessions.size === 0) {
      this.removeRenderer(contents.id);
    }
  }

  removeSession(sessionId: string): void {
    for (const entry of this.renderers.values()) {
      entry.sessions.get(sessionId)?.();
      entry.sessions.delete(sessionId);
      if (entry.sessions.size === 0) {
        this.removeRenderer(entry.contents.id);
      }
    }
  }

  dispose(): void {
    for (const rendererId of this.renderers.keys()) {
      this.removeRenderer(rendererId);
    }
  }

  private getOrCreate(contents: WebContents): RendererSubscriptions {
    const existing = this.renderers.get(contents.id);
    if (existing) {
      return existing;
    }

    const onDestroyed = () => this.removeRenderer(contents.id);
    const created = {
      contents,
      sessions: new Map<string, () => void>(),
      onDestroyed,
    };
    contents.once("destroyed", onDestroyed);
    this.renderers.set(contents.id, created);
    return created;
  }

  private removeRenderer(rendererId: number): void {
    const entry = this.renderers.get(rendererId);
    if (!entry) {
      return;
    }

    entry.contents.removeListener("destroyed", entry.onDestroyed);
    for (const unsubscribe of entry.sessions.values()) {
      unsubscribe();
    }
    entry.sessions.clear();
    this.renderers.delete(rendererId);
  }

  private sendEvent(contents: WebContents, event: AppAgentEvent): void {
    if (contents.isDestroyed()) {
      this.removeRenderer(contents.id);
      return;
    }

    try {
      contents.send(desktopIpcChannels.agents.event, event);
    } catch {
      // A failed renderer delivery must not interrupt the runtime event loop.
    }
  }
}
