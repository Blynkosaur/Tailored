export type LetterSections = Record<string, string | string[]>;

export type ChangedItem = {
  key: string;
  index?: number;
  oldVal: string;
  newVal: string;
  label: string;
};

const SECTION_LABELS: Record<string, string> = {
  date: "Date",
  sender_name: "Sender name",
  sender_email: "Sender email",
  addressee: "Addressee",
  greeting: "Greeting",
  intro: "Intro",
  closing: "Closing",
  sincerely: "Sign-off",
  signature: "Signature",
};

export function getSectionLabel(key: string, index?: number): string {
  if (key === "body" && index !== undefined) return `Body paragraph ${index + 1}`;
  return SECTION_LABELS[key] ?? key;
}

function normalizeBody(
  data: { body?: unknown; body_1?: string | null; body_2?: string | null },
  sections: Record<string, unknown>
): string[] {
  if (Array.isArray(data.body) && data.body.length > 0) {
    return data.body.map((p) => (typeof p === "string" ? p : String(p)).trim());
  }
  if (Array.isArray(sections.body) && sections.body.length > 0) {
    return sections.body.map((p) => (typeof p === "string" ? p : String(p)).trim());
  }
  const b1 = (typeof data.body_1 === "string" ? data.body_1 : (sections.body_1 as string) ?? "").trim();
  const b2 = (typeof data.body_2 === "string" ? data.body_2 : (sections.body_2 as string) ?? "").trim();
  if (b1 || b2) return [b1, b2].filter(Boolean);
  return [""];
}

export type GenerateResponseData = {
  sections?: Record<string, unknown> | null;
  date?: string | null;
  sender_block?: string | null;
  addressee_tex?: string | null;
  greeting?: string | null;
  intro?: string | null;
  body?: string[] | null;
  body_1?: string | null;
  body_2?: string | null;
  closing?: string | null;
  sincerely?: string | null;
  signature?: string | null;
};

export function buildLetterSectionsFromGenerateResponse(data: GenerateResponseData): LetterSections {
  const isSectionsObj =
    data.sections != null &&
    typeof data.sections === "object" &&
    !Array.isArray(data.sections);
  const sections: Record<string, unknown> = (isSectionsObj ? data.sections : {}) as Record<string, unknown>;
  const bodyArr = normalizeBody(data, sections);
  const base: LetterSections = {
    date: (typeof data.date === "string" ? data.date : (sections.date as string) ?? "") as string,
    greeting: (typeof data.greeting === "string" ? data.greeting : (sections.greeting as string) ?? "") as string,
    intro: (typeof data.intro === "string" ? data.intro : (sections.intro as string) ?? "") as string,
    body: bodyArr,
    closing: (typeof data.closing === "string" ? data.closing : (sections.closing as string) ?? "") as string,
    sincerely: (typeof data.sincerely === "string" ? data.sincerely : (sections.sincerely as string) ?? "Sincerely yours,") as string,
    signature: (typeof data.signature === "string" ? data.signature : (sections.signature as string) ?? "") as string,
  };
  if (typeof data.sender_block === "string" && data.sender_block.trim()) {
    const lines = data.sender_block.trim().split(/\n/).map((s) => s.trim()).filter(Boolean);
    base.sender_name = (lines[0] ?? "") as string;
    base.sender_email = (lines.length > 1 ? lines.slice(1).join("\n") : (sections.sender_email as string) ?? "") as string;
  } else {
    base.sender_name = (sections.sender_name as string) ?? "";
    base.sender_email = (sections.sender_email as string) ?? "";
  }
  if (typeof data.addressee_tex === "string" && data.addressee_tex.trim()) {
    base.addressee = data.addressee_tex.trim() as string;
  } else {
    base.addressee = (sections.addressee as string) ?? "";
  }
  for (const [k, v] of Object.entries(sections)) {
    if (base[k] === undefined && (typeof v === "string" || Array.isArray(v))) base[k] = v as string | string[];
  }
  return base;
}

export function getChangedSections(
  current: LetterSections,
  proposed: LetterSections
): ChangedItem[] {
  const out: ChangedItem[] = [];
  const keys = ["date", "sender_name", "sender_email", "addressee", "greeting", "intro", "closing", "sincerely", "signature"] as const;
  for (const k of keys) {
    const a = typeof current[k] === "string" ? current[k] : "";
    const b = typeof proposed[k] === "string" ? proposed[k] : "";
    if (a !== b) out.push({ key: k, oldVal: a as string, newVal: b as string, label: getSectionLabel(k) });
  }
  const curBody = Array.isArray(current.body) ? current.body : [];
  const propBody = Array.isArray(proposed.body) ? proposed.body : [];
  const maxLen = Math.max(curBody.length, propBody.length);
  for (let i = 0; i < maxLen; i++) {
    const oldP = curBody[i] ?? "";
    const newP = propBody[i] ?? "";
    if (oldP !== newP) out.push({ key: "body", index: i, oldVal: oldP, newVal: newP, label: getSectionLabel("body", i) });
  }
  return out;
}
