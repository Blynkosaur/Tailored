"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Download, Github, RefreshCw, Star, X } from "lucide-react";

type InputMode = "url" | "text" | "pdf";

function EditableBlock({
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

const RECOMPILE_DEBOUNCE_MS = 1500;

export type LetterSections = Record<string, string>;

function buildLetterSectionsFromGenerateResponse(data: {
  sections?: Record<string, string> | null;
  date?: string | null;
  sender_block?: string | null;
  addressee_tex?: string | null;
  greeting?: string | null;
  intro?: string | null;
  body_1?: string | null;
  body_2?: string | null;
  closing?: string | null;
  sincerely?: string | null;
  signature?: string | null;
}): LetterSections {
  const isSectionsObj =
    data.sections != null &&
    typeof data.sections === "object" &&
    !Array.isArray(data.sections);
  const sections: Record<string, string> = (isSectionsObj ? data.sections : {}) as Record<string, string>;
  const base: LetterSections = {
    date: typeof data.date === "string" ? data.date : (sections.date ?? ""),
    greeting: typeof data.greeting === "string" ? data.greeting : (sections.greeting ?? ""),
    intro: typeof data.intro === "string" ? data.intro : (sections.intro ?? ""),
    body_1: typeof data.body_1 === "string" ? data.body_1 : (sections.body_1 ?? ""),
    body_2: typeof data.body_2 === "string" ? data.body_2 : (sections.body_2 ?? ""),
    closing: typeof data.closing === "string" ? data.closing : (sections.closing ?? ""),
    sincerely: typeof data.sincerely === "string" ? data.sincerely : (sections.sincerely ?? "Sincerely yours,"),
    signature: typeof data.signature === "string" ? data.signature : (sections.signature ?? ""),
  };
  if (typeof data.sender_block === "string" && data.sender_block.trim()) {
    const lines = data.sender_block.trim().split(/\n/).map((s) => s.trim()).filter(Boolean);
    base.sender_name = lines[0] ?? "";
    if (lines.length > 1) base.sender_email = lines.slice(1).join("\n");
    else if (sections.sender_email !== undefined) base.sender_email = sections.sender_email;
  } else {
    base.sender_name = sections.sender_name ?? "";
    base.sender_email = sections.sender_email ?? "";
  }
  if (typeof data.addressee_tex === "string" && data.addressee_tex.trim()) {
    base.addressee = data.addressee_tex.trim();
  } else {
    base.addressee = sections.addressee ?? "";
  }
  for (const [k, v] of Object.entries(sections)) {
    if (typeof v === "string" && base[k] === undefined) base[k] = v;
  }
  return base;
}

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobPdfFile, setJobPdfFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [letterSections, setLetterSections] = useState<LetterSections | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCompiledRef = useRef<string | null>(null);
  const previousPdfUrlRef = useRef<string | null>(null);
  const [lastCompiledSnapshot, setLastCompiledSnapshot] = useState<string | null>(null);
  const [lastCompiledLogoSignature, setLastCompiledLogoSignature] = useState<{
    name: string;
    size: number;
    lastModified: number;
  } | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const getLogoSignature = useCallback((file: File | null) => {
    if (!file) return null;
    return { name: file.name, size: file.size, lastModified: file.lastModified };
  }, []);

  const logoSignatureMatches = useCallback(
    (current: File | null, last: typeof lastCompiledLogoSignature) => {
      const cur = getLogoSignature(current);
      if (cur === null && last === null) return true;
      if (cur === null || last === null) return false;
      return cur.name === last.name && cur.size === last.size && cur.lastModified === last.lastModified;
    },
    [getLogoSignature]
  );

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setResumeFile(file);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setLogoFile(file);
    }
  };

  const handleJobPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setJobPdfFile(file);
    }
  };

  const handleGenerate = async () => {
    if (!resumeFile) {
      alert("Please upload your resume");
      return;
    }
    if (inputMode === "url" && !jobUrl) {
      alert("Please enter a job URL");
      return;
    }
    if (inputMode === "text" && !jobDescription) {
      alert("Please enter a job description");
      return;
    }
    if (inputMode === "pdf" && !jobPdfFile) {
      alert("Please upload a job description PDF");
      return;
    }

    setIsGenerating(true);
    setError(null);
    if (previousPdfUrlRef.current) {
      URL.revokeObjectURL(previousPdfUrlRef.current);
      previousPdfUrlRef.current = null;
    }
    setPdfUrl(null);
    setShowPdf(false);
    setLetterSections(null);
    lastCompiledRef.current = null;
    setLastCompiledSnapshot(null);
    setLastCompiledLogoSignature(null);

    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      
      if (logoFile) {
        formData.append("logo", logoFile);
      }
      
      if (inputMode === "url") {
        formData.append("job_url", jobUrl);
      } else if (inputMode === "text") {
        formData.append("job_description", jobDescription);
      } else if (inputMode === "pdf" && jobPdfFile) {
        formData.append("job_pdf", jobPdfFile);
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to generate cover letter");
      }

      const data = await response.json();
      const pdfBlob = base64ToBlob(data.pdf, "application/pdf");
      const url = URL.createObjectURL(pdfBlob);
      previousPdfUrlRef.current = url;
      setPdfUrl(url);
      const sections: LetterSections = buildLetterSectionsFromGenerateResponse(data);
      const hasContent =
        (sections.intro?.trim() ?? "") !== "" ||
        (sections.body_1?.trim() ?? "") !== "" ||
        (sections.addressee?.trim() ?? "") !== "";
      if (!hasContent) {
        console.warn(
          "[Tailored] No section content. Expected response keys: pdf, sections, date, intro, body_1, etc. Run backend locally: cd backend && uvicorn api:app --reload (and ensure API_URL is http://localhost:8000 or unset)"
        );
      }
      if (!hasContent) {
        setError(
          "Cover letter was generated but the editable text did not load. Try again, or ensure your backend is running locally with the latest code (returns sections + date, intro, body_1, etc.). You can still download the PDF."
        );
      } else {
        setError(null);
      }
      setLetterSections(sections);
      const snapshot = JSON.stringify(sections);
      lastCompiledRef.current = snapshot;
      setLastCompiledSnapshot(snapshot);
      setLastCompiledLogoSignature(getLogoSignature(logoFile));
      setShowPdf(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = "cover_letter.pdf";
      a.click();
    }
  };

  const recompile = useCallback(
    async (sections: LetterSections) => {
      setIsCompiling(true);
      try {
        const formData = new FormData();
        formData.append("sections", JSON.stringify(sections));
        if (logoFile) formData.append("logo", logoFile);
        const res = await fetch("/api/compile", { method: "POST", body: formData });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.detail || "Compilation failed");
        }
        const data = await res.json();
        const blob = base64ToBlob(data.pdf, "application/pdf");
        const url = URL.createObjectURL(blob);
        if (previousPdfUrlRef.current) URL.revokeObjectURL(previousPdfUrlRef.current);
        previousPdfUrlRef.current = url;
        setPdfUrl(url);
        const snapshot = JSON.stringify(sections);
        lastCompiledRef.current = snapshot;
        setLastCompiledSnapshot(snapshot);
        setLastCompiledLogoSignature(getLogoSignature(logoFile));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Compilation failed");
      } finally {
        setIsCompiling(false);
      }
    },
    [logoFile, getLogoSignature]
  );

  useEffect(() => {
    if (!letterSections || !showPdf) return;
    const current = JSON.stringify(letterSections);
    if (current === lastCompiledRef.current) return;
    const t = setTimeout(() => {
      recompile(letterSections);
    }, RECOMPILE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [letterSections, showPdf, recompile]);

  const isFormValid =
    resumeFile &&
    (inputMode === "url" ? jobUrl : inputMode === "text" ? jobDescription : jobPdfFile);

  const hasPdf = !!pdfUrl;
  const currentSectionsSnapshot =
    letterSections != null ? JSON.stringify(letterSections) : null;
  const isPdfSynced =
    currentSectionsSnapshot != null &&
    lastCompiledSnapshot != null &&
    currentSectionsSnapshot === lastCompiledSnapshot &&
    logoSignatureMatches(logoFile, lastCompiledLogoSignature);

  const [leftPanePercent, setLeftPanePercent] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (showPdf) setLeftPanePercent(50);
  }, [showPdf]);

  const updateSection = useCallback((key: string, text: string) => {
    setLetterSections((prev) => (prev ? { ...prev, [key]: text } : prev));
  }, []);

  useEffect(() => {
    if (!showPdf) return;
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.round((x / rect.width) * 100);
      setLeftPanePercent(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-resize-handle]")) {
        isDraggingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [showPdf]);

  return (
    <div
      ref={splitRef}
      className="flex min-h-screen w-full transition-[background] duration-300 flex-col lg:flex-row lg:h-screen lg:overflow-hidden"
      style={
        hasPdf && showPdf
          ? ({ "--left-pct": `${leftPanePercent}%`, "--right-pct": `${100 - leftPanePercent}%` } as React.CSSProperties)
          : undefined
      }
    >
      <div
        className={`min-h-screen overflow-auto w-full ${
          hasPdf && showPdf
            ? "lg:shrink-0 lg:min-w-[280px] lg:max-w-[calc(80%-8px)] lg:w-[calc(var(--left-pct)-4px)]"
            : "lg:w-full"
        }`}
      >
        <div className="max-w-xl mx-auto p-8 flex flex-col">
          <h1 className="text-4xl font-bold mb-6 font-[family-name:var(--font-shizuru)]">
            Tailored
          </h1>

          <div className="mb-6">
            <label className="block mb-2 font-medium">Job Posting</label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setInputMode("url")}
                className={`px-3 py-1 border rounded-full transition-all cursor-pointer shadow-sm ${
                  inputMode === "url" ? "bg-black text-white" : "hover:bg-gray-100 hover:font-bold"
                }`}
              >
                URL
              </button>
              <button
                onClick={() => setInputMode("text")}
                className={`px-3 py-1 border rounded-full transition-all cursor-pointer shadow-sm ${
                  inputMode === "text" ? "bg-black text-white" : "hover:bg-gray-100 hover:font-bold"
                }`}
              >
                Paste Text
              </button>
              <button
                onClick={() => setInputMode("pdf")}
                className={`px-3 py-1 border rounded-full transition-all cursor-pointer shadow-sm ${
                  inputMode === "pdf" ? "bg-black text-white" : "hover:bg-gray-100 hover:font-bold"
                }`}
              >
                Upload PDF
              </button>
            </div>

            {inputMode === "url" && (
              <input
                type="url"
                placeholder="https://jobs.example.com/..."
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                className="w-full p-2 border rounded-xl shadow-sm"
              />
            )}
            {inputMode === "text" && (
              <textarea
                placeholder="Paste job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full p-2 border rounded-xl h-40 shadow-sm"
              />
            )}
            {inputMode === "pdf" && (
              <>
                <input
                  id="job-pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleJobPdfChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById("job-pdf-upload")?.click()}
                  className="w-full p-2 border rounded-xl hover:bg-gray-100 hover:font-bold transition-all cursor-pointer shadow-sm text-left"
                >
                  {jobPdfFile ? jobPdfFile.name : "Upload Job Description PDF"}
                </button>
              </>
            )}
          </div>

          <div className="mb-6">
            <label className="block mb-2 font-medium">Resume (PDF)</label>
            <input
              id="resume-upload"
              type="file"
              accept=".pdf"
              onChange={handleResumeChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => document.getElementById("resume-upload")?.click()}
              className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer shadow-sm"
            >
              {resumeFile ? resumeFile.name : "Upload Resume"}
            </button>
          </div>

          <div className="mb-6">
            <label className="block mb-2 font-medium">
              School Logo (UWaterloo default)
            </label>
            <input
              id="logo-upload"
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => document.getElementById("logo-upload")?.click()}
                className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer shadow-sm"
              >
                {logoFile ? logoFile.name : "Upload Logo"}
              </button>
              {logoFile && (
                <button
                  type="button"
                  onClick={() => setLogoFile(null)}
                  className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer shadow-sm"
                >
                  Reset to UWaterloo
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!isFormValid || isGenerating}
            className="w-full p-3 bg-black text-white rounded-full hover:bg-gray-700 hover:font-bold transition-all cursor-pointer shadow-sm disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating..." : "Generate Cover Letter"}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl">
              {error}
            </div>
          )}

          {pdfUrl && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={() => setShowPdf(!showPdf)}
                className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer shadow-sm"
              >
                {showPdf ? "Hide Cover Letter" : "View Cover Letter"}
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer shadow-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          )}

          <div className="mt-10 flex justify-start">
            <a
              href="https://github.com/Blynkosaur/Tailored"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-gray-500 hover:text-gray-700 hover:font-bold transition-all font-medium"
            >
              <Github className="w-5 h-5" />
              <span>(star it <Star className="w-4 h-4 inline" />)</span>
            </a>
          </div>
        </div>
      </div>

      {hasPdf && showPdf && letterSections && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden h-[100dvh] max-h-[100dvh] overflow-hidden"
          style={{ height: "100dvh", maxHeight: "100dvh" }}
          aria-modal="true"
          role="dialog"
          aria-label="Editing"
        >
          <div className="flex items-center justify-between gap-2 p-3 border-b border-border bg-background shrink-0 flex-shrink-0">
            <h2 className="text-lg font-semibold">Editing</h2>
            <div className="flex items-center gap-2">
              {lastCompiledSnapshot != null && (
                <span
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    isPdfSynced ? "text-green-600" : "text-red-600"
                  }`}
                >
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                      isPdfSynced
                        ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                        : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                    }`}
                  />
                  {isPdfSynced ? "Synced" : "Modified"}
                </span>
              )}
              {isCompiling ? (
                <span className="text-sm text-muted-foreground animate-pulse">
                  Recompiling…
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => recompile(letterSections)}
                  className="p-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                  title="Recompile PDF"
                  aria-label="Recompile PDF"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPdf(false)}
                className="p-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 min-w-0 p-6 overflow-auto overflow-x-hidden overscroll-contain">
            <article
              className="mx-auto bg-white text-black shadow-pdf rounded-lg max-w-[21cm] min-h-[29.7cm] p-10 font-[family-name:theme(fontFamily.sans)] text-[11pt] leading-relaxed"
              style={{ boxShadow: "var(--shadow-pdf, 0 0 20px rgba(0,0,0,0.1))" }}
            >
              <div className="mb-4">
                <img
                  src={logoPreviewUrl ?? "/school.png"}
                  alt="Logo"
                  className="max-w-[40%] h-auto"
                />
              </div>
              <div className="flex flex-col items-end gap-0.5 mb-4">
                <EditableBlock
                  sectionKey="date"
                  value={letterSections.date ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  placeholder="Month Day, Year"
                  onEdit={updateSection}
                />
                <EditableBlock
                  sectionKey="sender_name"
                  value={letterSections.sender_name ?? ""}
                  placeholder="Your name"
                  onEdit={updateSection}
                />
                {letterSections.sender_email != null && (
                  <EditableBlock
                    sectionKey="sender_email"
                    value={letterSections.sender_email ?? ""}
                    placeholder="your@email.com"
                    onEdit={updateSection}
                  />
                )}
              </div>
              <div className="mb-4 whitespace-pre-line">
                <EditableBlock
                  sectionKey="addressee"
                  value={letterSections.addressee ?? ""}
                  placeholder="Hiring Manager\nTitle\nCompany\nAddress"
                  onEdit={updateSection}
                  block
                />
              </div>
              <div className="mb-4">
                <EditableBlock
                  sectionKey="greeting"
                  value={letterSections.greeting ?? ""}
                  placeholder="Dear Hiring Manager,"
                  onEdit={updateSection}
                />
              </div>
              <div className="space-y-4 mb-4">
                <EditableBlock
                  sectionKey="intro"
                  value={letterSections.intro ?? ""}
                  placeholder="Opening paragraph…"
                  onEdit={updateSection}
                  block
                />
                <EditableBlock
                  sectionKey="body_1"
                  value={letterSections.body_1 ?? ""}
                  placeholder="Second paragraph…"
                  onEdit={updateSection}
                  block
                />
                <EditableBlock
                  sectionKey="body_2"
                  value={letterSections.body_2 ?? ""}
                  placeholder="Third paragraph…"
                  onEdit={updateSection}
                  block
                />
                <EditableBlock
                  sectionKey="closing"
                  value={letterSections.closing ?? ""}
                  placeholder="Optional closing sentence…"
                  onEdit={updateSection}
                  block
                />
              </div>
              <div className="mb-2">
                <EditableBlock
                  sectionKey="sincerely"
                  value={letterSections.sincerely ?? "Sincerely yours,"}
                  placeholder="Sincerely yours,"
                  onEdit={updateSection}
                />
              </div>
              <div className="mt-6">
                <EditableBlock
                  sectionKey="signature"
                  value={letterSections.signature ?? ""}
                  placeholder="Your name"
                  onEdit={updateSection}
                />
              </div>
            </article>
          </div>
        </div>
      )}

      {hasPdf && showPdf && letterSections && (
        <div
          data-resize-handle
          className="hidden lg:flex shrink-0 w-2 cursor-col-resize border-l border-r border-border bg-muted/50 hover:bg-muted transition-colors items-center justify-center group"
          aria-label="Resize panes"
        >
          <div className="w-1 h-8 rounded-full bg-border group-hover:bg-foreground/30 transition-colors" />
        </div>
      )}

      {hasPdf && letterSections && (
        <div
          className={`flex flex-col border-l border-border bg-muted/30 overflow-hidden transition-all duration-300 ease-out shrink-0 min-h-0 ${
            showPdf
              ? "opacity-100 w-full min-h-[50vh] hidden lg:flex lg:w-[calc(var(--right-pct)-4px)] lg:min-w-[280px] lg:min-h-0"
              : "w-0 min-w-0 max-w-0 opacity-0"
          }`}
        >
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between gap-2 p-3 border-b border-border bg-background shrink-0">
              <h2 className="text-lg font-semibold">Editing</h2>
              <div className="flex items-center gap-3">
                {letterSections != null && lastCompiledSnapshot != null && (
                  <span
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      isPdfSynced ? "text-green-600" : "text-red-600"
                    }`}
                    title={
                      isPdfSynced
                        ? "PDF is in sync with edits"
                        : "Edits not yet compiled to PDF"
                    }
                  >
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                        isPdfSynced
                          ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                          : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                      }`}
                    />
                    {isPdfSynced ? "Synced" : "Modified"}
                  </span>
                )}
                {isCompiling ? (
                  <span className="text-sm text-muted-foreground animate-pulse">
                    Recompiling…
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => letterSections && recompile(letterSections)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
                    title="Recompile PDF from current edits"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Recompile
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 p-6 overflow-auto">
              <article
                className="mx-auto bg-white text-black shadow-pdf rounded-lg max-w-[21cm] min-h-[29.7cm] p-10 font-[family-name:theme(fontFamily.sans)] text-[11pt] leading-relaxed"
                style={{ boxShadow: "var(--shadow-pdf, 0 0 20px rgba(0,0,0,0.1))" }}
              >
                <div className="mb-4">
                  <img
                    src={logoPreviewUrl ?? "/school.png"}
                    alt="Logo"
                    className="max-w-[40%] h-auto"
                  />
                </div>
                <div className="flex flex-col items-end gap-0.5 mb-4">
                  <EditableBlock
                    sectionKey="date"
                    value={letterSections.date ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    placeholder="Month Day, Year"
                    onEdit={updateSection}
                  />
                  <EditableBlock
                    sectionKey="sender_name"
                    value={letterSections.sender_name ?? ""}
                    placeholder="Your name"
                    onEdit={updateSection}
                  />
                  {letterSections.sender_email != null && (
                    <EditableBlock
                      sectionKey="sender_email"
                      value={letterSections.sender_email ?? ""}
                      placeholder="your@email.com"
                      onEdit={updateSection}
                    />
                  )}
                </div>
                <div className="mb-4 whitespace-pre-line">
                  <EditableBlock
                    sectionKey="addressee"
                    value={letterSections.addressee ?? ""}
                    placeholder="Hiring Manager\nTitle\nCompany\nAddress"
                    onEdit={updateSection}
                    block
                  />
                </div>
                <div className="mb-4">
                  <EditableBlock
                    sectionKey="greeting"
                    value={letterSections.greeting ?? ""}
                    placeholder="Dear Hiring Manager,"
                    onEdit={updateSection}
                  />
                </div>
                <div className="space-y-4 mb-4">
                  <EditableBlock
                    sectionKey="intro"
                    value={letterSections.intro ?? ""}
                    placeholder="Opening paragraph…"
                    onEdit={updateSection}
                    block
                  />
                  <EditableBlock
                    sectionKey="body_1"
                    value={letterSections.body_1 ?? ""}
                    placeholder="Second paragraph…"
                    onEdit={updateSection}
                    block
                  />
                  <EditableBlock
                    sectionKey="body_2"
                    value={letterSections.body_2 ?? ""}
                    placeholder="Third paragraph…"
                    onEdit={updateSection}
                    block
                  />
                  <EditableBlock
                    sectionKey="closing"
                    value={letterSections.closing ?? ""}
                    placeholder="Optional closing sentence…"
                    onEdit={updateSection}
                    block
                  />
                </div>
                <div className="mb-2">
                  <EditableBlock
                    sectionKey="sincerely"
                    value={letterSections.sincerely ?? "Sincerely yours,"}
                    placeholder="Sincerely yours,"
                    onEdit={updateSection}
                  />
                </div>
                <div className="mt-6">
                  <EditableBlock
                    sectionKey="signature"
                    value={letterSections.signature ?? ""}
                    placeholder="Your name"
                    onEdit={updateSection}
                  />
                </div>
              </article>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
