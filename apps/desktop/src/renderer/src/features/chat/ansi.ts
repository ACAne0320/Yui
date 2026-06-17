// Extensions written for the TUI may style widget/status text with ANSI
// escapes. The desktop renderer strips them and keeps a hint that the line was
// terminal-styled so it can render in a monospace block (no color restoration
// in this phase).

// ESC + CSI sequences (colors, cursor movement). Built via the constructor so
// the source contains no control-character literal.
const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");

export function hasAnsi(text: string): boolean {
  ANSI_PATTERN.lastIndex = 0;
  return ANSI_PATTERN.test(text);
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}
