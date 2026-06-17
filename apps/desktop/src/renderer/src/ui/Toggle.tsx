export function Toggle({
  on,
  onChange,
  label,
  small = false,
}: {
  on: boolean;
  onChange?: () => void;
  label: string;
  small?: boolean;
}) {
  if (!onChange) {
    return <span className={`toggle${small ? " sm" : ""}`} data-on={on} aria-label={label} />;
  }
  return (
    <button
      type="button"
      className={`toggle${small ? " sm" : ""}`}
      data-on={on}
      onClick={onChange}
      aria-label={label}
      aria-pressed={on}
    />
  );
}
