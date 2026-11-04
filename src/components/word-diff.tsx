type Op = { kind: "same" | "add" | "remove"; text: string };

const MAX_CELLS = 250_000;

/** Word-level LCS diff. Falls back to whole-block replace for very long inputs. */
export function diffWords(before: string, after: string): Op[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > MAX_CELLS) {
    return [
      { kind: "remove", text: before },
      { kind: "add", text: after },
    ];
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }

  const ops: Op[] = [];
  const push = (kind: Op["kind"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) last.text += text;
    else ops.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      push("remove", a[i]);
      i += 1;
    } else {
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < a.length) push("remove", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return ops;
}

/**
 * Inline before/after rendering. Removed words are struck through and added
 * words underlined, so the change is not conveyed by colour alone.
 */
export function WordDiff({ before, after }: { before: string; after: string }) {
  const ops = diffWords(before, after);
  return (
    <p className="m-0 max-w-[80ch] leading-relaxed text-[var(--ink)]">
      {ops.map((op, index) => {
        if (op.kind === "same") return <span key={index}>{op.text}</span>;
        if (op.kind === "remove") {
          return (
            <del
              key={index}
              className="rounded-sm bg-[oklch(0.925_0.045_31)] px-0.5 text-[oklch(0.37_0.09_31)] decoration-[oklch(0.5_0.12_31)]"
            >
              <span className="sr-only">[removed: </span>
              {op.text}
              <span className="sr-only">]</span>
            </del>
          );
        }
        return (
          <ins
            key={index}
            className="rounded-sm bg-[oklch(0.925_0.05_158)] px-0.5 text-[oklch(0.32_0.09_158)] underline decoration-2 underline-offset-2"
          >
            <span className="sr-only">[added: </span>
            {op.text}
            <span className="sr-only">]</span>
          </ins>
        );
      })}
    </p>
  );
}
