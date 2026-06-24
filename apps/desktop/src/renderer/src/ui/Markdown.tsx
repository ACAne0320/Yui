import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "@renderer/ui/CopyButton";

// --- Streaming word fade-in ---------------------------------------------------
// While a message streams, every word is wrapped in a `.stream-word` span via a
// rehype pass. Newly appended words fade transparent → solid right where they
// arrive, so the reveal stays glued to the live edge (no trailing lag, nothing
// rendered ahead of earlier text). `Intl.Segmenter` keeps the granularity right
// for CJK text, which has no spaces to split on.
//
// Two problems are handled with per-word bookkeeping (`seenAt`/`delays`), keyed
// by reading-order index and carried across renders:
//
//  1. Bursts. Pi delivers tokens in clumps, so many words mount in one frame.
//     Without help they fade in lockstep and read as one discrete step — the
//     "一顿一顿" stutter. Each freshly mounted word gets a small increasing
//     `--word-delay` so the clump cascades left-to-right instead of popping.
//
//  2. Remount flicker. react-markdown re-parses on every token, and when partial
//     syntax completes (bold, a list, a heading, a code fence) the affected text
//     is reparented — React remounts those spans, which would replay the fade
//     and blink already-read text out and back. So a word that has been visible
//     past SETTLE_MS is marked `stream-settled` and drops the entrance: a
//     remount then brings it back solid. The flip happens after the fade has
//     finished, so it is invisible.

interface HastText {
  type: "text";
  value: string;
}
interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastChild[];
}
type HastChild = HastText | HastElement | { type: string };

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
/** Tags whose subtree text is left un-wrapped (descent stops here).
    - `code`/`pre`: code keeps exact text — extra spans would not hurt shiki (it
      replaces the fallback) but would bloat the tree for no visible benefit.
    - `table`: GFM re-parses the whole table block on every streamed token, so
      its cell text reflows and the `.stream-word` spans remount and replay the
      entrance animation — a constant flicker. Leaving table text as stable
      plain nodes keeps it still while it streams in. */
const UNWRAPPED_TAGS = new Set(["code", "pre", "table"]);

// Per-word entrance stagger. Words new in a render cascade at this step, capped
// so a large burst still finishes promptly instead of trailing far behind the
// live edge (which is what made the earlier frontier design feel laggy).
const STAGGER_STEP_MS = 32;
const STAGGER_MAX_MS = 220;
// A word is "settled" once it has been visible at least this long — comfortably
// past its fade (0.32s) plus max stagger (0.22s). Settled words drop the
// entrance animation, so a markdown re-parse that remounts the span (bold, a
// list, a heading completing mid-stream reparents its text) brings them back
// solid instead of replaying the fade and blinking already-read text. The flip
// happens after the fade has finished, so it is invisible (the word is at
// opacity 1 either way).
const SETTLE_MS = 650;

/** Entrance delay for a word at `index` that is freshly mounted this render,
    measured from the first new word (`base`) so a burst cascades left-to-right. */
function staggerFor(index: number, base: number): number {
  return Math.min((index - base) * STAGGER_STEP_MS, STAGGER_MAX_MS);
}

/** Per-word rendering decision, derived from when the word first appeared. */
interface WordState {
  settled: boolean;
  delayMs: number;
}

function wrapTextNodes(
  parent: { children: HastChild[] },
  counter: { n: number },
  classify: (index: number) => WordState,
): void {
  const children = parent.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type === "element") {
      const element = child as HastElement;
      if (!UNWRAPPED_TAGS.has(element.tagName)) wrapTextNodes(element, counter, classify);
      continue;
    }
    if (child.type !== "text") continue;
    const replacement: HastChild[] = Array.from(
      wordSegmenter.segment((child as HastText).value),
      ({ segment }): HastChild => {
        if (segment.trim() === "") return { type: "text", value: segment };
        const { settled, delayMs } = classify(counter.n++);
        return {
          type: "element",
          tagName: "span",
          properties: {
            className: settled ? ["stream-word", "stream-settled"] : ["stream-word"],
            style: `--word-delay:${delayMs}ms`,
          },
          children: [{ type: "text", value: segment }],
        };
      },
    );
    children.splice(index, 1, ...replacement);
    index += replacement.length - 1;
  }
}

/** Rehype pass parameterised by a per-word classifier (built from the seen-at
    bookkeeping) so it knows which words are freshly mounted, mid-fade, or
    settled. */
function makeRehypeStreamWords(classify: (index: number) => WordState) {
  return () => (tree: { children: HastChild[] }) => {
    wrapTextNodes(tree, { n: 0 }, classify);
  };
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Unknown languages (or a blocked engine) leave the plain fallback in
    // place rather than surfacing an unhandled rejection.
    void import("shiki")
      .then(async ({ codeToHtml }) => {
        const next = await codeToHtml(code, { lang: language || "text", theme: "github-light" });
        if (!cancelled) setHtml(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className="md-code">
      <div className="md-code-head">
        <span>{language || "text"}</span>
        <CopyButton text={code} className="md-copy" />
      </div>
      {html ? (
        <div className="md-code-body" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="md-code-body">
          <pre>
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

export function Markdown({
  children,
  animated = false,
}: {
  children: string;
  /** Streaming mode: newly appended words fade in, staggered (see top comment). */
  animated?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // First-seen timestamp and stagger delay per word index, indexed in reading
  // order and carried across renders. Words stream in by appending, so an index
  // identifies the same word until the (edge-local) restructure that shifts it.
  const seenAt = useRef<number[]>([]);
  const delays = useRef<number[]>([]);
  const now = Date.now();
  // Words present at the last commit; anything at or past this index is freshly
  // mounted in this render and gets a cascading entrance delay. Earlier words
  // are either mid-fade (reuse their stored delay so the running animation isn't
  // re-seeked) or settled (drop the entrance entirely — see SETTLE_MS).
  const base = seenAt.current.length;
  const classify = (index: number): WordState => {
    if (index >= base) return { settled: false, delayMs: staggerFor(index, base) };
    return {
      settled: now - seenAt.current[index] >= SETTLE_MS,
      delayMs: delays.current[index] ?? 0,
    };
  };
  useLayoutEffect(() => {
    if (!animated) {
      seenAt.current = [];
      delays.current = [];
      return;
    }
    const total = ref.current?.querySelectorAll(".stream-word").length ?? 0;
    for (let index = base; index < total; index += 1) {
      seenAt.current[index] = now;
      delays.current[index] = staggerFor(index, base);
    }
    // A restructure can drop words (e.g. `**` stops being literal text); forget
    // the stale tail so indices don't carry a previous word's timestamp.
    if (total < seenAt.current.length) {
      seenAt.current.length = total;
      delays.current.length = total;
    }
  });
  return (
    <div className="markdown" ref={ref}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={animated ? [makeRehypeStreamWords(classify)] : undefined}
        components={{
          // Unwrap <pre>: fenced blocks render as our CodeBlock (a <div>),
          // which must not live inside <pre>.
          pre({ children: preChildren }) {
            return <>{preChildren}</>;
          },
          code({ className, children: codeChildren }) {
            const code = String(codeChildren).replace(/\n$/, "");
            const language = /language-(\w+)/.exec(className ?? "")?.[1];
            // Fenced blocks carry a language class or span multiple lines;
            // everything else is inline code.
            return language || code.includes("\n") ? (
              <CodeBlock code={code} language={language ?? "text"} />
            ) : (
              <code>{codeChildren}</code>
            );
          },
          // target=_blank routes clicks through the window-open handler, which
          // forwards http(s) to the system browser and denies the rest
          // (in-app navigation is blocked by security policy either way).
          a({ href, children: linkChildren }) {
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {linkChildren}
              </a>
            );
          },
          // Wide tables scroll horizontally instead of overflowing the thread.
          table({ children: tableChildren }) {
            return (
              <div className="md-table-wrap">
                <table>{tableChildren}</table>
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
