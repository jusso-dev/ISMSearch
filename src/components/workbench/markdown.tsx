import type { ReactNode } from "react";

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-[var(--paper-2)] px-1 py-0.5 text-sm">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/** Minimal, safe markdown renderer (headings, lists, bold, inline code) for streamed model output. */
export function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (!listItems.length || !listType) return;
    const items = listItems.map((item, index) => <li key={`${elements.length}-${index}`}>{renderInlineMarkdown(item)}</li>);
    elements.push(
      listType === "ol" ? (
        <ol key={`list-${elements.length}`} className="my-3 list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`list-${elements.length}`} className="my-3 list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    );
    listItems = [];
    listType = null;
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={index} className="mb-2 mt-5 text-lg font-bold text-[var(--ink)]">
          {renderInlineMarkdown(trimmed.replace(/^##\s+/, ""))}
        </h3>,
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 key={index} className="mb-3 text-xl font-bold text-[var(--ink)]">
          {renderInlineMarkdown(trimmed.replace(/^#\s+/, ""))}
        </h2>,
      );
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(trimmed.replace(/^\d+\.\s+/, ""));
      return;
    }
    flushList();
    elements.push(
      <p key={index} className="my-3 leading-relaxed text-[var(--ink)]">
        {renderInlineMarkdown(trimmed)}
      </p>,
    );
  });

  flushList();

  return <div>{elements}</div>;
}
