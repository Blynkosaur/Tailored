"use client";

import { useRef, useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { TypingDots } from "./TypingDots";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  hasPendingChanges: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onSendEdit: (instruction: string) => void;
  isEditLoading: boolean;
};

const POPUP_EXIT_MS = 150;

export function EditChatPopup({
  open,
  onOpenChange,
  messages,
  hasPendingChanges,
  onAcceptAll,
  onRejectAll,
  onSendEdit,
  isEditLoading,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isExiting, setIsExiting] = useState(false);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (prevOpenRef.current && !open) {
      setIsExiting(true);
    }
    prevOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!isExiting) return;
    const t = setTimeout(() => setIsExiting(false), POPUP_EXIT_MS);
    return () => clearTimeout(t);
  }, [isExiting]);

  const visible = open || isExiting;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background shadow-lg hover:bg-muted transition-all duration-200 ease-out origin-center ${
          open ? "pointer-events-none opacity-0 scale-0" : "opacity-100 scale-100"
        }`}
        title="Edit with AI"
        aria-label="Edit with AI"
        aria-hidden={open}
      >
        <MessageCircle className="h-5 w-5" />
      </button>
      {visible && (
        <div
          className={`fixed bottom-20 right-6 z-50 flex w-[360px] max-h-[min(400px,70vh)] flex-col rounded-lg border border-border bg-background shadow-xl origin-bottom-right ${
            isExiting ? "animate-chat-popup-exit" : "animate-chat-popup-enter"
          }`}
          aria-hidden={isExiting}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-medium">
              {isEditLoading ? "Editing" : "Edit with AI"}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}
              >
                <span
                  className={`inline-block rounded-lg px-2 py-1 max-w-[90%] ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {m.content}
                </span>
              </div>
            ))}
            {isEditLoading && (
              <div className="text-sm text-left">
                <TypingDots />
              </div>
            )}
            <div ref={messagesEndRef} />
            {hasPendingChanges && (
              <div className="flex gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={onAcceptAll}
                  className="flex-1 py-1.5 rounded border border-green-600 bg-green-600 text-white text-sm hover:opacity-90"
                >
                  Accept all
                </button>
                <button
                  type="button"
                  onClick={onRejectAll}
                  className="flex-1 py-1.5 rounded border border-border bg-muted text-sm hover:bg-muted/80"
                >
                  Reject all
                </button>
              </div>
            )}
          </div>
          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.querySelector<HTMLInputElement>('input[name="chat-input"]');
              if (input?.value) {
                onSendEdit(input.value);
                input.value = "";
              }
            }}
          >
            <input
              ref={inputRef}
              name="chat-input"
              type="text"
              placeholder="e.g. make the intro more formal"
              autoComplete="off"
              className="flex-1 rounded border border-border px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              disabled={isEditLoading}
            />
            <button
              type="submit"
              disabled={isEditLoading}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {isEditLoading ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
