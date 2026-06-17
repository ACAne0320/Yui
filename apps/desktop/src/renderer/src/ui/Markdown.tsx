import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "@renderer/ui/CopyButton";

// --- Streaming word fade-in ---------------------------------------------------
// While a message streams, every word is wrapped in a `.stream-word` span via a
// rehype pass. React keys spans by position, so re-renders reuse the spans of
// text already shown (no re-animation) and only newly appended words mount —
// their CSS entrance produces the transparent→solid materialize effect.
// `Intl.Segmenter` keeps the granularity right for CJK text, which has no
// spaces to split on.

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

function wrapTextNodes(parent: { children: HastChild[] }): void {
  const children = parent.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type === "element") {
      const element = child as HastElement;
      if (!UNWRAPPED_TAGS.has(element.tagName)) wrapTextNodes(element);
      continue;
    }
    if (child.type !== "text") continue;
    const replacement: HastChild[] = Array.from(
      wordSegmenter.segment((child as HastText).value),
      ({ segment }): HastChild =>
        segment.trim() === ""
          ? { type: "text", value: segment }
          : {
              type: "element",
              tagName: "span",
              properties: { className: ["stream-word"] },
              children: [{ type: "text", value: segment }],
            },
    );
    children.splice(index, 1, ...replacement);
    index += replacement.length - 1;
  }
}

function rehypeStreamWords() {
  return (tree: { children: HastChild[] }) => {
    wrapTextNodes(tree);
  };
}

const ANIMATED_REHYPE_PLUGINS = [rehypeStreamWords];

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
  /** Streaming mode: newly appended words fade in (see rehypeStreamWords). */
  animated?: boolean;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={animated ? ANIMATED_REHYPE_PLUGINS : undefined}
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
