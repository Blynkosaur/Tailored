"use client";

import { Plus, Trash2 } from "lucide-react";
import type { LetterSections, ChangedItem } from "@/lib/letterSections";
import { PendingDiffOrEdit } from "./PendingDiffOrEdit";

type Props = {
  letterSections: LetterSections;
  changedList: ChangedItem[];
  logoPreviewUrl: string | null;
  onEdit: (key: string, text: string) => void;
  onAcceptSection: (key: string, index?: number) => void;
  onRejectSection: (key: string, index?: number) => void;
  onAddBodyParagraph: (afterIndex: number) => void;
  onRemoveBodyParagraph: (index: number) => void;
};

const defaultDate = () =>
  new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export function LetterSectionsEditor({
  letterSections,
  changedList,
  logoPreviewUrl,
  onEdit,
  onAcceptSection,
  onRejectSection,
  onAddBodyParagraph,
  onRemoveBodyParagraph,
}: Props) {
  const body = Array.isArray(letterSections.body) ? letterSections.body : [];
  // Include slots for proposed new paragraphs (body indices that appear only in changedList)
  const maxBodyIndexFromChanges = changedList
    .filter((c) => c.key === "body" && c.index !== undefined)
    .reduce((max, c) => Math.max(max, c.index!), -1);
  const bodyLengthToShow = Math.max(body.length, maxBodyIndexFromChanges + 1);

  return (
    <article className="mx-auto bg-white text-black border border-border rounded-lg max-w-[21cm] min-h-0 p-10 pb-24 font-[family-name:theme(fontFamily.sans)] text-base md:text-[11pt] leading-relaxed">
      <div className="mb-4">
        <img
          src={logoPreviewUrl ?? "/school.png"}
          alt="Logo"
          className="max-w-[40%] h-auto"
        />
      </div>
      <div className="flex flex-col items-end gap-0.5 mb-4">
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="date"
          value={(typeof letterSections.date === "string" ? letterSections.date : null) ?? defaultDate()}
          placeholder="Month Day, Year"
          block={false}
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="sender_name"
          value={(typeof letterSections.sender_name === "string" ? letterSections.sender_name : "") ?? ""}
          placeholder="Your name"
          block={false}
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
        {letterSections.sender_email != null && (
          <PendingDiffOrEdit
            changedList={changedList}
            sectionKey="sender_email"
            value={(typeof letterSections.sender_email === "string" ? letterSections.sender_email : "") ?? ""}
            placeholder="your@email.com"
            block={false}
            onAccept={onAcceptSection}
            onReject={onRejectSection}
            onEdit={onEdit}
          />
        )}
      </div>
      <div className="mb-4 whitespace-pre-line">
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="addressee"
          value={(typeof letterSections.addressee === "string" ? letterSections.addressee : "") ?? ""}
          placeholder="Hiring Manager\nTitle\nCompany\nAddress"
          block
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
      </div>
      <div className="mb-4">
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="greeting"
          value={(typeof letterSections.greeting === "string" ? letterSections.greeting : "") ?? ""}
          placeholder="Dear Hiring Manager,"
          block={false}
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
      </div>
      <div className="space-y-4 mb-4">
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="intro"
          value={(letterSections.intro as string) ?? ""}
          placeholder="Opening paragraph…"
          block
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
        {Array.from({ length: bodyLengthToShow }, (_, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <PendingDiffOrEdit
                changedList={changedList}
                sectionKey="body"
                bodyIndex={i}
                value={body[i] ?? ""}
                placeholder={i === 0 ? "Second paragraph…" : `Paragraph ${i + 2}…`}
                block
                onAccept={onAcceptSection}
                onReject={onRejectSection}
                onEdit={onEdit}
              />
            </div>
            <div className="flex shrink-0 gap-1 mt-1">
              <button
                type="button"
                onClick={() => onAddBodyParagraph(i)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Add paragraph after"
                aria-label="Add paragraph after"
              >
                <Plus className="h-4 w-4" />
              </button>
              {bodyLengthToShow > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveBodyParagraph(i)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Remove paragraph"
                  aria-label="Remove paragraph"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="closing"
          value={(letterSections.closing as string) ?? ""}
          placeholder="Optional closing sentence…"
          block
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
      </div>
      <div className="mb-2">
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="sincerely"
          value={(letterSections.sincerely as string) ?? "Sincerely yours,"}
          placeholder="Sincerely yours,"
          block={false}
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
      </div>
      <div className="mt-6 mb-16">
        <PendingDiffOrEdit
          changedList={changedList}
          sectionKey="signature"
          value={(letterSections.signature as string) ?? ""}
          placeholder="Your name"
          block={false}
          onAccept={onAcceptSection}
          onReject={onRejectSection}
          onEdit={onEdit}
        />
      </div>
    </article>
  );
}
