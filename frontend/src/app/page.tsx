"use client";

import { useState } from "react";
import { Download, Github, Star } from "lucide-react";

type InputMode = "url" | "text" | "pdf";


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
  const [error, setError] = useState<string | null>(null);

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
    setPdfUrl(null);
    setShowPdf(false);

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
      
      // Convert base64 to blob URL
      const pdfBlob = base64ToBlob(data.pdf, "application/pdf");
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
      
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

  const isFormValid =
    resumeFile &&
    (inputMode === "url" ? jobUrl : inputMode === "text" ? jobDescription : jobPdfFile);

  return (
    <div className="max-w-xl mx-auto p-8 min-h-screen flex flex-col">
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

      {/* PDF Result */}
      {pdfUrl && (
        <div className="mt-6">
          <div className="flex gap-2">
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
          {showPdf && (
            <iframe
              src={pdfUrl}
              className="w-full h-[600px] border rounded-xl mt-4"
              title="Cover Letter PDF"
            />
          )}
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
  );
}
