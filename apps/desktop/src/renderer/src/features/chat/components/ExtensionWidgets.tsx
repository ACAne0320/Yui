import type { ExtensionUiSnapshot } from "@yui/contracts";
import { hasAnsi, stripAnsi } from "../ansi";

/**
 * Extension `setWidget(string[])` content, rendered as a light annotation strip.
 * The caller groups widgets by placement — `aboveEditor` above the composer,
 * `belowEditor` below it — and passes each group as its own strip. Lines that
 * carried ANSI styling render monospace (escapes stripped); plain lines use
 * regular typography.
 */
export function ExtensionWidgets({ widgets }: { widgets: ExtensionUiSnapshot["widgets"] }) {
  if (widgets.length === 0) return null;
  return (
    <>
      {widgets.map((widget) => (
        <div className="extension-widget" key={widget.key} title={widget.key}>
          {widget.lines.map((line, index) =>
            hasAnsi(line) ? (
              // eslint-disable-next-line react/no-array-index-key
              <pre key={index}>{stripAnsi(line)}</pre>
            ) : (
              // eslint-disable-next-line react/no-array-index-key
              <p key={index}>{line}</p>
            ),
          )}
        </div>
      ))}
    </>
  );
}
