import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
};

type SegmentedProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Render with tablist/tab semantics instead of plain toggle buttons. */
  asTabs?: boolean;
  ariaLabel?: string;
  className?: string;
};

type Thumb = { left: number; width: number };

/**
 * Pill toggle with a highlight that slides to the active option. The thumb is
 * measured from the live DOM (offsetLeft/offsetWidth) so it tracks variable
 * label widths and re-aligns when labels change — e.g. on a locale switch.
 * Motion is disabled globally under prefers-reduced-motion (see styles.css).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  asTabs = false,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);

  const measure = () => {
    const active = rootRef.current?.querySelector<HTMLElement>('[data-on="true"]');
    if (!active) return;
    const next = { left: active.offsetLeft, width: active.offsetWidth };
    setThumb((prev) =>
      prev && prev.left === next.left && prev.width === next.width ? prev : next,
    );
  };

  // Re-measure after every render so the thumb follows the active button even
  // when its label (and width) changes. Runs before paint to avoid a jump.
  useLayoutEffect(measure);

  // Keep the thumb aligned when the container resizes (font load, window resize).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className={className ? `segmented ${className}` : "segmented"}
      role={asTabs ? "tablist" : undefined}
      aria-label={ariaLabel}
    >
      <span
        className="segmented-thumb"
        aria-hidden="true"
        style={
          thumb
            ? { transform: `translateX(${thumb.left}px)`, width: thumb.width }
            : { opacity: 0 }
        }
      />
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={asTabs ? "tab" : undefined}
            aria-selected={asTabs ? on : undefined}
            data-on={on}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
