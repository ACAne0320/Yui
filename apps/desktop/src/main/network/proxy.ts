import { net, session } from "electron";

let installed = false;

/**
 * Routes every main-process `fetch` through Chromium's network stack.
 *
 * The runtime (pi) calls the bare global `fetch` directly and exposes no seam
 * to inject a custom fetch or proxy agent, so routing its traffic — the OAuth
 * token exchange and every model API call — has to happen at the process level.
 *
 * Node's built-in `fetch` (undici) ignores the OS proxy configuration, so on a
 * machine with a system/HTTP/SOCKS/PAC proxy the requests leave from the real
 * IP even though the OAuth *browser* window went through the proxy — which
 * surfaces as a successful login page but a failed token exchange (e.g. a 403
 * `unsupported_country_region_territory` from OpenAI).
 *
 * `net.fetch` runs each request through Chromium, which honors the exact same
 * proxy config the browser window uses (system proxy, PAC/WPAD, SOCKS, proxy
 * auth) on every platform, and goes direct when none is configured — so this is
 * a no-op for users without a proxy.
 *
 * Must be called after the app is ready (net.fetch and session both require it)
 * and before the runtime issues any request.
 */
export async function configureMainNetwork(): Promise<void> {
  if (installed) {
    return;
  }
  installed = true;

  // The default session runs in "system" mode, so net.fetch already follows the
  // OS proxy / PAC exactly like the OAuth browser window — that is the primary
  // path and must win. Only fall back to proxy env vars when the system
  // resolves to a direct connection: a user who exported HTTP(S)_PROXY in a
  // shell but didn't enable a system proxy (GUI launches don't inherit shell
  // env, so they'd otherwise go direct). Never override an existing system
  // proxy with env, which could point at a different or stale endpoint.
  const envProxy =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;
  if (envProxy) {
    const systemProxy = await session.defaultSession.resolveProxy("https://api.openai.com");
    if (systemProxy.trim() === "DIRECT") {
      await session.defaultSession.setProxy({
        proxyRules: envProxy,
        proxyBypassRules: process.env.NO_PROXY ?? process.env.no_proxy,
      });
    }
  }

  const electronFetch = net.fetch;
  globalThis.fetch = ((
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1],
  ) => electronFetch(input instanceof URL ? input.href : input, init)) as typeof globalThis.fetch;
}
