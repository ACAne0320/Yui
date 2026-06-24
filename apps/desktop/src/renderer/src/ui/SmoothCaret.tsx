import { useEffect, useRef, type RefObject } from "react";

// Typography/box properties the mirror must copy so its text wraps exactly
// like the textarea's.
const MIRROR_STYLE_KEYS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "boxSizing",
  "whiteSpace",
  "overflowWrap",
  "wordBreak",
  "tabSize",
] as const;

/**
 * Animated caret overlay for a textarea: a hidden mirror element reproduces
 * the text up to the selection point, a marker span measures the caret
 * coordinates, and a painted caret glides there with a short transform
 * transition (the native caret cannot animate, so it is hidden while the
 * overlay is active).
 *
 * The overlay self-disables — falling back to the native caret — whenever it
 * could lie or interfere: during IME composition (CJK input must keep native
 * caret behavior), on non-collapsed selections, on blur, and when the caret
 * line is scrolled out of the textarea's viewport.
 */
export function SmoothCaret({
  textareaRef,
  value,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /**
   * The textarea's controlled value. Watched so a programmatic change — clearing
   * the draft after a send or a slash command — recomputes the caret, since such
   * a change fires no `input` or `selectionchange` event for the listeners below.
   */
  value?: string;
}) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const scheduleRef = useRef<() => void>(() => {});

  useEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const marker = markerRef.current;
    const caret = caretRef.current;
    if (!textarea || !mirror || !marker || !caret) return;

    let frame: number | undefined;

    /** The reason is exposed on the element for in-app diagnostics. */
    const hide = (reason: string) => {
      caret.dataset.visible = "false";
      caret.dataset.reason = reason;
      textarea.style.caretColor = "";
    };

    const update = () => {
      frame = undefined;
      // IME composition stays enabled on purpose: Chromium keeps `value` and
      // `selectionStart` in sync with the preedit text, so the mirror measures
      // correctly — and for CJK users composition covers most of their typing,
      // which would otherwise never show the animated caret.
      if (document.activeElement !== textarea) {
        hide("blur");
        return;
      }
      if (textarea.selectionStart !== textarea.selectionEnd) {
        hide("selection");
        return;
      }
      const style = getComputedStyle(textarea);
      for (const key of MIRROR_STYLE_KEYS) mirror.style[key] = style[key];
      mirror.style.width = `${textarea.clientWidth}px`;
      mirror.replaceChildren(
        document.createTextNode(textarea.value.slice(0, textarea.selectionStart ?? 0)),
        marker,
      );
      const lineHeight =
        style.lineHeight === "normal"
          ? Math.round(parseFloat(style.fontSize) * 1.4)
          : parseFloat(style.lineHeight);
      const x = textarea.offsetLeft + marker.offsetLeft - textarea.scrollLeft;
      const y = textarea.offsetTop + marker.offsetTop - textarea.scrollTop;
      // Caret line scrolled outside the textarea's viewport: fall back to
      // hidden rather than painting over neighboring UI.
      if (
        y < textarea.offsetTop - 2 ||
        y + lineHeight > textarea.offsetTop + textarea.clientHeight + 2
      ) {
        hide("clamp");
        return;
      }
      caret.dataset.reason = "";
      // Glyph-height caret centered in the line box reads like the native one;
      // a full line-height bar looks chunky when line-height > font-size.
      const caretHeight = Math.min(lineHeight, Math.round(parseFloat(style.fontSize) * 1.3));
      const yCentered = y + (lineHeight - caretHeight) / 2;
      caret.style.height = `${caretHeight}px`;
      // Appearing from hidden must not glide in from the previous (stale)
      // position — snap there first, then re-enable the movement transition.
      if (caret.dataset.visible !== "true") {
        caret.style.transition = "none";
        caret.style.transform = `translate(${x}px, ${yCentered}px)`;
        // Force the style flush so the snap is committed before transitions return.
        void caret.offsetWidth;
        caret.style.transition = "";
      } else {
        caret.style.transform = `translate(${x}px, ${yCentered}px)`;
      }
      caret.dataset.visible = "true";
      textarea.style.caretColor = "transparent";
    };
    const safeUpdate = () => {
      try {
        update();
      } catch (error) {
        // Surface the failure on the element instead of dying silently in rAF.
        caret.dataset.reason = `error: ${error instanceof Error ? error.message : String(error)}`;
        caret.dataset.visible = "false";
        textarea.style.caretColor = "";
      }
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(safeUpdate);
    };
    scheduleRef.current = schedule;

    // selectionchange covers clicks/arrow keys, input covers typing and IME
    // preedit updates; the ResizeObserver catches width changes (window
    // resize, sidebar collapse) that re-wrap text without any input event.
    document.addEventListener("selectionchange", schedule);
    textarea.addEventListener("input", schedule);
    textarea.addEventListener("focus", schedule);
    textarea.addEventListener("blur", schedule);
    textarea.addEventListener("scroll", schedule, { passive: true });
    // Guarded for non-browser test environments (jsdom lacks ResizeObserver).
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    resizeObserver?.observe(textarea);
    schedule();
    return () => {
      resizeObserver?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", schedule);
      textarea.removeEventListener("input", schedule);
      textarea.removeEventListener("focus", schedule);
      textarea.removeEventListener("blur", schedule);
      textarea.removeEventListener("scroll", schedule);
      textarea.style.caretColor = "";
      scheduleRef.current = () => {};
    };
  }, [textareaRef]);

  // A controlled-value change fires no input/selectionchange event (React sets
  // the value property directly), so recompute here when it changes — otherwise
  // the painted caret lingers at its old spot after the draft is cleared.
  useEffect(() => {
    scheduleRef.current();
  }, [value]);

  return (
    <div className="smooth-caret-layer" aria-hidden="true">
      <div className="smooth-caret-mirror" ref={mirrorRef}>
        <span ref={markerRef} />
      </div>
      <div className="smooth-caret" ref={caretRef} data-visible="false" />
    </div>
  );
}
