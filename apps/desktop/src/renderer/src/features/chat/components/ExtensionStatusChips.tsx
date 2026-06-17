import { stripAnsi } from "../ansi";

/** Status texts from extension `setStatus`, shown as small pills in the tray. */
export function ExtensionStatusChips({
  statuses,
}: {
  statuses: Array<{ key: string; text: string }>;
}) {
  if (statuses.length === 0) return null;
  return (
    <div className="extension-chips">
      {statuses.map((status) => (
        <span className="extension-chip" key={status.key} title={status.key}>
          {stripAnsi(status.text)}
        </span>
      ))}
    </div>
  );
}
