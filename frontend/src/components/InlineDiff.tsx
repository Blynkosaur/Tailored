"use client";

import * as Diff from "diff";

function DiffLine({
  line,
  type,
}: {
  line: string;
  type: "added" | "removed" | "unchanged";
}) {
  const base = "block px-1.5 py-0.5 text-sm font-mono";
  if (type === "added")
    return (
      <div className={`${base} bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-100`}>
        {line || " "}
      </div>
    );
  if (type === "removed")
    return (
      <div className={`${base} bg-red-200 dark:bg-red-900/40 text-red-900 dark:text-red-100 line-through`}>
        {line || " "}
      </div>
    );
  return <div className={base}>{line || " "}</div>;
}

export function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const oldStr = oldText ?? "";
  const newStr = newText ?? "";

  // When the old value is empty, the whole new content is added — show all lines in green
  if (!oldStr.trim() && newStr) {
    const lines = newStr.split("\n");
    return (
      <div className="rounded border border-border bg-muted/30 overflow-hidden">
        {lines.map((line, j) => (
          <DiffLine key={j} line={line} type="added" />
        ))}
      </div>
    );
  }

  const parts = Diff.diffLines(oldStr, newStr);
  return (
    <div className="rounded border border-border bg-muted/30 overflow-hidden">
      {parts.map((part, i) => {
        const lines = (part.value ?? "").split("\n");
        const type = part.added ? "added" : part.removed ? "removed" : "unchanged";
        return (
          <span key={i}>
            {lines.map((line, j) => (
              <DiffLine key={`${i}-${j}`} line={line} type={type} />
            ))}
          </span>
        );
      })}
    </div>
  );
}
