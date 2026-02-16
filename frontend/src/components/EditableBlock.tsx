"use client";

import { useRef, useEffect } from "react";

export function EditableBlock({
  sectionKey,
  value,
  placeholder,
  onEdit,
  block = false,
}: {
  sectionKey: string;
  value: string;
  placeholder: string;
  onEdit: (key: string, text: string) => void;
  block?: boolean;
}) {
  const Tag = block ? "div" : "span";
  const ref = useRef<HTMLDivElement | HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || (document.activeElement && el.contains(document.activeElement))) return;
    if (el.textContent !== value) {
      el.textContent = value;
    }
  }, [value]);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      contentEditable
      suppressContentEditableWarning
      className="outline-none focus:ring-1 focus:ring-ring rounded px-0.5 min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
      data-placeholder={placeholder}
      onInput={(e) => {
        const text = (e.target as HTMLElement).innerText ?? "";
        onEdit(sectionKey, text);
      }}
      onBlur={(e) => {
        const text = (e.target as HTMLElement).innerText ?? "";
        onEdit(sectionKey, text);
      }}
    />
  );
}
