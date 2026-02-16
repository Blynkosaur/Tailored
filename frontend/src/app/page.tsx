"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Download, Github, RefreshCw, Star, X } from "lucide-react";
import {
  buildLetterSectionsFromGenerateResponse,
  getChangedSections,
  getSectionLabel,
  type LetterSections,
  type ChangedItem,
} from "@/lib/letterSections";
import { LetterSectionsEditor } from "@/components/LetterSectionsEditor";
import { EditChatPopup } from "@/components/EditChatPopup";

type InputMode = "url" | "text" | "pdf";

const RECOMPILE_DEBOUNCE_MS = 1500;

function HomeContent() {
  const searchParams = useSearchParams();
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  useEffect(() => {
    const url = searchParams.get("url");
    if (url && typeof url === "string") {
      setJobUrl(url);
      setInputMode("url");
    }
  }, [searchParams]);
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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [proposedSections, setProposedSections] = useState<LetterSections | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
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
      const bodyArr = Array.isArray(sections.body) ? sections.body : [];
      const hasContent =
        ((sections.intro as string)?.trim() ?? "") !== "" ||
        bodyArr.some((p) => (p || "").trim() !== "") ||
        ((sections.addressee as string)?.trim() ?? "") !== "";
      if (!hasContent) {
        console.warn(
          "300"
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
    setLetterSections((prev) => {
      if (!prev) return prev;
      if (key.startsWith("body.")) {
        const i = parseInt(key.slice(5), 10);
        if (Number.isNaN(i) || i < 0) return prev;
        const body = Array.isArray(prev.body) ? [...prev.body] : [""];
        while (body.length <= i) body.push("");
        body[i] = text;
        return { ...prev, body };
      }
      return { ...prev, [key]: text };
    });
  }, []);

  const addBodyParagraph = useCallback((afterIndex: number) => {
    setLetterSections((prev) => {
      if (!prev) return prev;
      const body = Array.isArray(prev.body) ? [...prev.body] : [""];
      body.splice(afterIndex + 1, 0, "");
      return { ...prev, body };
    });
  }, []);

  const removeBodyParagraph = useCallback((index: number) => {
    setLetterSections((prev) => {
      if (!prev) return prev;
      const body = Array.isArray(prev.body) ? [...prev.body] : [""];
      if (body.length <= 1) return prev;
      body.splice(index, 1);
      return { ...prev, body };
    });
  }, []);

  const sendEdit = useCallback(
    async (instruction: string) => {
      if (!letterSections || !instruction.trim()) return;
      setIsEditLoading(true);
      setChatMessages((prev) => prev.concat({ role: "user", content: instruction.trim() }));
      try {
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: instruction.trim(), sections: letterSections }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.detail || "Edit failed");
        }
        const data = await res.json();
        const proposed = data.sections as LetterSections;
        setProposedSections(proposed);
        const count = getChangedSections(letterSections, proposed).length;
        setChatMessages((prev) =>
          prev.concat({
            role: "assistant",
            content: count
              ? `${count} proposed change(s) in the letter — review and accept or reject each one in the letter view.`
              : "No changes suggested.",
          })
        );
      } catch (e) {
        setChatMessages((prev) =>
          prev.concat({ role: "assistant", content: e instanceof Error ? e.message : "Edit failed." })
        );
      } finally {
        setIsEditLoading(false);
      }
    },
    [letterSections]
  );

  const acceptSection = useCallback(
    (key: string, index?: number) => {
      if (!letterSections || !proposedSections) return;
      let next: LetterSections;
      if (key === "body" && index !== undefined) {
        const propBody = Array.isArray(proposedSections.body) ? [...proposedSections.body] : [];
        const body = Array.isArray(letterSections.body) ? [...letterSections.body] : [];
        while (body.length <= index) body.push("");
        body[index] = propBody[index] ?? "";
        next = { ...letterSections, body };
      } else {
        const val = proposedSections[key];
        if (typeof val !== "string") return;
        next = { ...letterSections, [key]: val };
      }
      setLetterSections(next);
      if (getChangedSections(next, proposedSections).length === 0) setProposedSections(null);
      setChatMessages((prev) =>
        prev.concat({
          role: "assistant",
          content: `Accepted change to ${getSectionLabel(key, index)}.`,
        })
      );
    },
    [letterSections, proposedSections]
  );

  const acceptAll = useCallback(() => {
    if (!proposedSections) return;
    setLetterSections(proposedSections);
    setProposedSections(null);
    setChatMessages((prev) => prev.concat({ role: "assistant", content: "Accepted all changes." }));
  }, [proposedSections]);

  const rejectChanges = useCallback(() => {
    setProposedSections(null);
    setChatMessages((prev) => prev.concat({ role: "assistant", content: "Changes discarded." }));
  }, []);

  const rejectSection = useCallback(
    (key: string, index?: number) => {
      if (!proposedSections || !letterSections) return;
      if (key === "body" && index !== undefined) {
        const currentBody = Array.isArray(letterSections.body) ? [...letterSections.body] : [];
        const proposedBody = Array.isArray(proposedSections.body) ? [...proposedSections.body] : [];
        while (proposedBody.length <= index) proposedBody.push("");
        proposedBody[index] = currentBody[index] ?? "";
        setProposedSections({ ...proposedSections, body: proposedBody });
      } else {
        const currentVal = letterSections[key];
        setProposedSections({ ...proposedSections, [key]: currentVal });
      }
      setChatMessages((prev) =>
        prev.concat({ role: "assistant", content: `Rejected change to ${getSectionLabel(key, index)}.` })
      );
    },
    [letterSections, proposedSections]
  );

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

  const changedList: ChangedItem[] =
    letterSections && proposedSections ? getChangedSections(letterSections, proposedSections) : [];

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
          <h1 className="flex items-center gap-0 text-4xl font-bold mb-6 font-title tracking-tight -ml-2 italic">
            <Image 
              src="/bobbypin.svg"
              alt=""
              width={36}
              height={36}
              unoptimized
              className="shrink-0 h-[0.75em] w-auto rounded-sm -rotate-100 -scale-x-100 translate-y-0.5"
            />
            Tailored
          </h1>

          <div className="mb-6">
            <label className="block mb-2 font-medium">Job Posting</label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setInputMode("url")}
                className={`px-3 py-1 border rounded-full transition-all cursor-pointer ${
                  inputMode === "url" ? "bg-black text-white" : "hover:bg-gray-100 hover:font-bold"
                }`}
              >
                URL
              </button>
              <button
                onClick={() => setInputMode("text")}
                className={`px-3 py-1 border rounded-full transition-all cursor-pointer ${
                  inputMode === "text" ? "bg-black text-white" : "hover:bg-gray-100 hover:font-bold"
                }`}
              >
                Paste Text
              </button>
              <button
                onClick={() => setInputMode("pdf")}
                className={`px-3 py-1 border rounded-full transition-all cursor-pointer ${
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
                className="w-full p-2 border rounded-xl "
              />
            )}
            {inputMode === "text" && (
              <textarea
                placeholder="Paste job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full p-2 border rounded-xl h-40 "
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
                  className="w-full p-2 border rounded-xl hover:bg-gray-100 hover:font-bold transition-all cursor-pointer text-left"
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
              className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer "
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
                className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer "
              >
                {logoFile ? logoFile.name : "Upload Logo"}
              </button>
              {logoFile && (
                <button
                  type="button"
                  onClick={() => setLogoFile(null)}
                  className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer "
                >
                  Reset to UWaterloo
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!isFormValid || isGenerating}
            className="w-full p-3 bg-black text-white rounded-full hover:bg-gray-800 hover:font-bold transition-all cursor-pointer disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 disabled:cursor-not-allowed"
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
                className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer "
              >
                {showPdf ? "Hide Cover Letter" : "View Cover Letter"}
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 border rounded-full hover:bg-gray-100 hover:font-bold transition-all cursor-pointer flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          )}

          <div className="mt-10 flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Tailored
            </p>
            <a
              href="https://github.com/Blynkosaur/Tailored"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 hover:font-bold transition-all font-medium"
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
            <LetterSectionsEditor
              letterSections={letterSections}
              changedList={changedList}
              logoPreviewUrl={logoPreviewUrl}
              onEdit={updateSection}
              onAcceptSection={acceptSection}
              onRejectSection={rejectSection}
              onAddBodyParagraph={addBodyParagraph}
              onRemoveBodyParagraph={removeBodyParagraph}
            />
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
              : "hidden"
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
              <LetterSectionsEditor
                letterSections={letterSections}
                changedList={changedList}
                logoPreviewUrl={logoPreviewUrl}
                onEdit={updateSection}
                onAcceptSection={acceptSection}
                onRejectSection={rejectSection}
                onAddBodyParagraph={addBodyParagraph}
                onRemoveBodyParagraph={removeBodyParagraph}
              />
            </div>
          </div>
        </div>
      )}

      {letterSections && (
        <EditChatPopup
          open={chatOpen}
          onOpenChange={setChatOpen}
          messages={chatMessages}
          hasPendingChanges={!!(proposedSections && changedList.length > 0)}
          onAcceptAll={acceptAll}
          onRejectAll={rejectChanges}
          onSendEdit={sendEdit}
          isEditLoading={isEditLoading}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
