const ENTER = ["\n", "\r"];
const CTRL_D = String.fromCharCode(4);
const CTRL_C = String.fromCharCode(3);
const BACKSPACE = [String.fromCharCode(127), "\b"];

/**
 * Read a secret from the terminal without echoing it. Falls back to reading a
 * line normally when stdin is not a TTY (e.g. piped input in tests). API keys
 * are never accepted as command arguments, only here or via env var.
 */
export function readSecret(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    output.write(promptText);

    const isTty = Boolean(input.isTTY);
    const previousRaw = isTty ? input.isRaw : false;
    if (isTty) input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    let secret = "";

    const cleanup = () => {
      input.removeListener("data", onData);
      if (isTty) input.setRawMode(previousRaw);
      input.pause();
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ENTER.includes(ch) || ch === CTRL_D) {
          cleanup();
          output.write("\n");
          resolve(secret);
          return;
        }
        if (ch === CTRL_C) {
          cleanup();
          output.write("\n");
          reject(new Error("aborted"));
          return;
        }
        if (BACKSPACE.includes(ch)) {
          secret = secret.slice(0, -1);
          continue;
        }
        secret += ch;
      }
    };

    input.on("data", onData);
  });
}
