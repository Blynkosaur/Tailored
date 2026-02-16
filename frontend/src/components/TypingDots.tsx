"use client";

export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 translate-y-[0.2em] ${className}`}
      aria-hidden
    >
      <span
        className="h-1 w-1 rounded-full bg-gray-400 animate-typing-dot animate-typing-dot-bounce"
        style={{ animationDelay: "0s" }}
      />
      <span
        className="h-1 w-1 rounded-full bg-gray-400 animate-typing-dot animate-typing-dot-bounce"
        style={{ animationDelay: "0.15s" }}
      />
      <span
        className="h-1 w-1 rounded-full bg-gray-400 animate-typing-dot animate-typing-dot-bounce"
        style={{ animationDelay: "0.3s" }}
      />
    </span>
  );
}
