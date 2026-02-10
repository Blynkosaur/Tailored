"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Download, Github, Star } from "lucide-react";

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
  return (
    <Tag
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
    >
      {value}
    </Tag>
  );
}

const RECOMPILE_DEBOUNCE_MS = 1500;

export type LetterSections = Record<string, string>;

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
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

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
      const sections: LetterSections = data.sections ?? {};
      setLetterSections(sections);
      lastCompiledRef.current = JSON.stringify(sections);
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
        lastCompiledRef.current = JSON.stringify(sections);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Compilation failed");
      } finally {
        setIsCompiling(false);
      }
    },
    [logoFile]
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

  const [leftPanePercent, setLeftPanePercent] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

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
      className={`flex min-h-screen w-full transition-[background] duration-300 ${
        hasPdf ? "flex-row" : ""
      }`}
    >
      {/* Left pane: form + actions */}
      <div
        className={`min-h-screen overflow-auto shrink-0 ${
          hasPdf ? "" : "w-full"
        }`}
        style={
          hasPdf
            ? {
                width: showPdf ? `calc(${leftPanePercent}% - 4px)` : "100%",
                minWidth: showPdf ? 280 : undefined,
                maxWidth: showPdf ? "calc(80% - 8px)" : undefined,
              }
            : undefined
        }
      >
        <div className="max-w-xl mx-auto p-8 flex flex-col">
          <h1 className="text-4xl font-bold mb-6 font-[family-name:var(--font-shizuru)]">
            Tailored
          </h1>

          {/* Job Input */}
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

          {/* Resume Upload */}
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

          {/* School Logo Upload */}
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

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!isFormValid || isGenerating}
            className="w-full p-3 bg-black text-white rounded-full hover:bg-gray-700 hover:font-bold transition-all cursor-pointer shadow-sm disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating..." : "Generate Cover Letter"}
          </button>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl">
              {error}
            </div>
          )}

          {/* PDF Result actions */}
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

          {/* GitHub Link */}
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

      {/* Resize handle (only when split is open) */}
      {hasPdf && showPdf && letterSections && (
        <div
          data-resize-handle
          className="shrink-0 w-2 cursor-col-resize border-l border-r border-border bg-muted/50 hover:bg-muted transition-colors flex items-center justify-center group"
          aria-label="Resize panes"
        >
          <div className="w-1 h-8 rounded-full bg-border group-hover:bg-foreground/30 transition-colors" />
        </div>
      )}

      {/* Right pane: HTML letter (PDF-like layout, contenteditable sections) */}
      {hasPdf && letterSections && (
        <div
          className={`flex flex-col border-l border-border bg-muted/30 overflow-hidden transition-all duration-300 ease-out shrink-0 ${
            showPdf
              ? "opacity-100"
              : "w-0 min-w-0 max-w-0 opacity-0"
          }`}
          style={
            showPdf
              ? {
                  width: `calc(${100 - leftPanePercent}% - 4px)`,
                  minWidth: 280,
                }
              : undefined
          }
        >
          <div className="flex flex-col h-full min-h-0 overflow-auto">
            <div className="flex items-center justify-between gap-2 p-3 border-b border-border bg-background shrink-0">
              <h2 className="text-lg font-semibold">Cover letter (editable)</h2>
              {isCompiling && (
                <span className="text-sm text-muted-foreground animate-pulse">
                  Recompiling…
                </span>
              )}
            </div>
            {/* Ghost overlay: HTML/CSS letter that looks like the PDF */}
            <div className="flex-1 min-h-0 p-6 overflow-auto">
              <article
                className="mx-auto bg-white text-black shadow-pdf rounded-lg max-w-[21cm] min-h-[29.7cm] p-10 font-[family-name:theme(fontFamily.sans)] text-[11pt] leading-relaxed"
                style={{ boxShadow: "var(--shadow-pdf, 0 0 20px rgba(0,0,0,0.1))" }}
              >
                {logoPreviewUrl && (
                  <div className="mb-4">
                    <img
                      src={logoPreviewUrl}
                      alt="Logo"
                      className="max-w-[40%] h-auto"
                    />
                  </div>
                )}
                <div className="border-b border-black pb-2 mb-4" />
                <div className="flex justify-end mb-4">
                  <div className="text-right space-y-0.5">
                    <p className="text-sm text-gray-600">{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
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
                <p className="mb-2">Sincerely yours,</p>
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
