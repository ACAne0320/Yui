import { useEffect, useMemo, useRef, useState } from "react";
import { Block, Streamdown, type BlockProps, type Components } from "streamdown";
import { cjk } from "@streamdown/cjk";
import "streamdown/styles.css";
import { CopyButton } from "@renderer/ui/CopyButton";

// --- Streaming rendering -------------------------------------------------------
// Streamdown owns parsing: `remend` repairs unterminated syntax while it streams
// (`**bold` renders bold from its first token instead of flipping structure when
// the closing delimiter arrives), and blocks render as memoized <section>s so
// only the trailing block re-parses per token.
//
// The entrance animation is OURS. Streamdown's bundled animate plugin shares one
// "settled characters" counter across every block (blocks read each other's
// counts, so quotes/lists/bold flips popped in with duration 0) and skips all
// `code` subtrees (inline code raced ahead of the prose). The plugin below
// keeps a per-block delay map and freezes each character's style at first
// sight, so visible characters never replay and new characters always fade in
// — robust to React's concurrent rendering, where discarded renders must not
// leave marks on committed output. Per-character, not per-word, because CJK
// has no whitespace to split on.

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

const STREAM_ANIMATION = {
  animation: "fadeIn",
  duration: 150,
  easing: "ease",
  stagger: 8,
} as const;

/** Subtrees left as plain text: fenced code (CodeBlock paints it wholesale) and
    non-prose nodes where per-character spans make no sense. Their text is NOT
    counted toward offsets, so code growing mid-stream can't shift the offsets
    of the prose after it. Inline `code` is intentionally NOT skipped — it
    streams per character like the prose. */
const UNANIMATED_TAGS = new Set(["pre", "svg", "math", "annotation"]);

/**
 * Wrap every non-whitespace character in a fade-in span. Each character's
 * style is FROZEN at first sight (constant duration, delay remembered by
 * offset in `delays`): React reuses the DOM node whenever props are identical,
 * so already-visible characters never replay, and new characters always fade
 * with a per-batch cascade (`newIndex` restarts each pass). No "settled →
 * duration 0" bookkeeping — advancing a counter at render time both truncates
 * in-flight fades on the next pass and miscounts under React's concurrent
 * rendering (Streamdown syncs block state via startTransition; discarded
 * renders must not affect committed output).
 */
function wrapCharacters(
  parent: { children: HastChild[] },
  counter: { count: number; newIndex: number },
  delays: Map<number, number>,
): void {
  const children = parent.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type === "element") {
      const element = child as HastElement;
      if (!UNANIMATED_TAGS.has(element.tagName)) wrapCharacters(element, counter, delays);
      continue;
    }
    if (child.type !== "text") continue;
    const value = (child as HastText).value;
    if (value.trim() === "") {
      counter.count += value.length;
      continue;
    }
    const replacement: HastChild[] = [];
    for (const char of Array.from(value)) {
      const offset = counter.count;
      counter.count += char.length;
      // Whitespace stays a plain text node between animated characters.
      if (char.trim() === "") {
        replacement.push({ type: "text", value: char });
        continue;
      }
      let delay = delays.get(offset);
      if (delay === undefined) {
        delay = counter.newIndex++ * STREAM_ANIMATION.stagger;
        delays.set(offset, delay);
      }
      replacement.push({
        type: "element",
        tagName: "span",
        properties: {
          "data-sd-animate": true,
          style: `--sd-animation:sd-${STREAM_ANIMATION.animation};--sd-duration:${STREAM_ANIMATION.duration}ms;--sd-easing:${STREAM_ANIMATION.easing}${delay > 0 ? `;--sd-delay:${delay}ms` : ""}`,
        },
        children: [{ type: "text", value: char }],
      });
    }
    children.splice(index, 1, ...replacement);
    index += replacement.length - 1;
  }
}

/**
 * One animate plugin instance per markdown block (mounted by AnimatedBlock),
 * so offsets can never cross-contaminate between blocks.
 */
let blockAnimateId = 0;

function createBlockAnimate() {
  const delays = new Map<number, number>();
  const rehypePlugin = () => (tree: { children: HastChild[] }) => {
    wrapCharacters(tree, { count: 0, newIndex: 0 }, delays);
  };
  // The markdown processor cache keys on plugin function names — every block's
  // plugin must be uniquely named, or all blocks share one cached processor
  // (and its delay map) and the cross-block bug returns.
  Object.defineProperty(rehypePlugin, "name", { value: `blockAnimate$${blockAnimateId++}` });
  return {
    name: "animate",
    type: "animate",
    rehypePlugin,
    setPrevContentLength() {},
    getLastRenderCharCount: () => 0,
  } as NonNullable<BlockProps["animatePlugin"]>;
}

/**
 * Streamdown only appends an animate rehype plugin from its own `animated`
 * prop (a single shared instance — the source of the cross-block bugs); the
 * `animatePlugin` Block prop is used for bookkeeping alone. So ours is spliced
 * into the block's rehype pipeline here, one instance per block, while the
 * Streamdown `animated` prop stays off.
 */
function AnimatedBlock(props: BlockProps) {
  const [plugin] = useState(() => createBlockAnimate());
  const rehypePlugins = useMemo(
    () => [...(props.rehypePlugins ?? []), plugin.rehypePlugin],
    [props.rehypePlugins, plugin],
  );
  return <Block {...props} rehypePlugins={rehypePlugins} animatePlugin={plugin} />;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  // The highlight for the exact source it was computed from; while code is
  // streaming in, the plain <pre> shows the full current text instead of a
  // stale, truncated highlight.
  const [highlighted, setHighlighted] = useState<{ code: string; html: string } | null>(null);
  const lastRun = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      lastRun.current = Date.now();
      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(code, { lang: language || "text", theme: "github-light" });
        if (!cancelled) setHighlighted({ code, html });
      } catch {
        // Unknown languages (or a blocked engine) leave the plain fallback in
        // place rather than surfacing an unhandled rejection.
      }
    };
    // Highlighting on every streamed token repaints the whole block (flicker +
    // wasted CPU), so throttle to one pass per 250ms; once the stream pauses,
    // the trailing timer settles the highlight on the final source.
    const idle = Date.now() - lastRun.current;
    window.clearTimeout(timer.current);
    if (idle >= 250) void run();
    else timer.current = window.setTimeout(() => void run(), 250 - idle);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [code, language]);

  return (
    <div className="md-code">
      <div className="md-code-head">
        <span>{language || "text"}</span>
        <CopyButton text={code} className="md-copy" />
      </div>
      {highlighted?.code === code ? (
        <div className="md-code-body" dangerouslySetInnerHTML={{ __html: highlighted.html }} />
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

const COMPONENTS: Components = {
  // Streamdown's defaults swap native tags for Tailwind-styled spans; we don't
  // load its utility CSS, so restore the native elements our styles target
  // (browser defaults cover strong/em semantics, styles.css does the rest).
  strong: ({ children }) => <strong>{children}</strong>,
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <h2>{children}</h2>,
  h3: ({ children }) => <h3>{children}</h3>,
  h4: ({ children }) => <h4>{children}</h4>,
  h5: ({ children }) => <h5>{children}</h5>,
  h6: ({ children }) => <h6>{children}</h6>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  hr: () => <hr />,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  sup: ({ children }) => <sup>{children}</sup>,
  sub: ({ children }) => <sub>{children}</sub>,
  img: ({ src, alt }) => <img src={src} alt={alt} />,
  code({ className, children: codeChildren, ...rest }) {
    const code = String(codeChildren).replace(/\n$/, "");
    const language = /language-(\w+)/.exec(className ?? "")?.[1];
    // Streamdown's default `pre` renderer forwards fenced blocks to `code`
    // marked with `data-block`; everything else is inline code.
    return "data-block" in rest ? (
      <CodeBlock code={code} language={language ?? "text"} />
    ) : (
      <code className={className}>{codeChildren}</code>
    );
  },
  // target=_blank routes clicks through the window-open handler, which
  // forwards http(s) to the system browser and denies the rest.
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
};

// Hoisted to module scope: Streamdown is memoized, and inline literals would
// defeat that on every settled (static) render during a live stream elsewhere.
const PLUGINS = { cjk };
const LINK_SAFETY_OFF = { enabled: false };

export function Markdown({
  children,
  animated = false,
}: {
  children: string;
  /** Streaming mode: repairs incomplete syntax, fades new characters in. */
  animated?: boolean;
}) {
  return (
    <div className="markdown">
      <Streamdown
        mode={animated ? "streaming" : "static"}
        isAnimating={animated}
        // `animated` stays off: its bundled animate plugin is a single shared
        // instance with the cross-block bugs — AnimatedBlock injects ours
        // per block instead.
        animated={false}
        plugins={PLUGINS}
        components={COMPONENTS}
        linkSafety={LINK_SAFETY_OFF}
        BlockComponent={animated ? AnimatedBlock : undefined}
      >
        {children}
      </Streamdown>
    </div>
  );
}
