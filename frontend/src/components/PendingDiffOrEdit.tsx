"use client";

import type { ChangedItem } from "@/lib/letterSections";
import { EditableBlock } from "./EditableBlock";
import { InlineDiff } from "./InlineDiff";

export function PendingDiffOrEdit({
  changedList,
  sectionKey,
  bodyIndex,
  value,
  placeholder,
  block,
  onAccept,
  onReject,
  onEdit,
}: {
  changedList: ChangedItem[];
  sectionKey: string;
  bodyIndex?: number;
  value: string;
  placeholder: string;
  block: boolean;
  onAccept: (key: string, index?: number) => void;
  onReject: (key: string, index?: number) => void;
  onEdit: (key: string, text: string) => void;
}) {
  const ch = changedList.find(
    (c) => c.key === sectionKey && (sectionKey !== "body" ? c.index === undefined : c.index === bodyIndex)
  );
  const editKey = sectionKey === "body" && bodyIndex !== undefined ? `body.${bodyIndex}` : sectionKey;
  if (ch)
    return (
      <div className={block ? "mb-4" : "mb-2"}>
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Proposed: {ch.label}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onAccept(sectionKey, bodyIndex)}
              className="text-xs px-2 py-1 rounded border border-green-600 bg-green-600 text-white hover:opacity-90"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => onReject(sectionKey, bodyIndex)}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
            >
              Reject
            </button>
          </div>
        </div>
        <InlineDiff oldText={ch.oldVal} newText={ch.newVal} />
      </div>
    );
  return (
    <EditableBlock
      sectionKey={editKey}
      value={value}
      placeholder={placeholder}
      onEdit={onEdit}
      block={block}
    />
  );
}
