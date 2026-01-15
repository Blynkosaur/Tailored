"use client";

import { useState } from "react";

type InputMode = "url" | "text";

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setResumeFile(file);
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

    setIsGenerating(true);
    // TODO: Connect to backend
    console.log("Generating cover letter...", {
      inputMode,
      jobUrl,
      jobDescription,
      resumeFile: resumeFile.name,
    });

    setTimeout(() => {
      setIsGenerating(false);
    }, 2000);
  };

  const isFormValid =
    resumeFile && (inputMode === "url" ? jobUrl : jobDescription);

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Tailored</h1>

      {/* Job Input */}
      <div className="mb-6">
        <label className="block mb-2 font-medium">Job Posting</label>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setInputMode("url")}
            className={`px-3 py-1 border rounded-full transition-colors cursor-pointer ${
              inputMode === "url" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            URL
          </button>
          <button
            onClick={() => setInputMode("text")}
            className={`px-3 py-1 border rounded-full transition-colors cursor-pointer ${
              inputMode === "text" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            Paste Text
          </button>
        </div>

        {inputMode === "url" ? (
          <input
            type="url"
            placeholder="https://jobs.example.com/..."
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            className="w-full p-2 border rounded-xl"
          />
        ) : (
          <textarea
            placeholder="Paste job description here..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="w-full p-2 border rounded-xl h-40"
          />
        )}
      </div>

      {/* Resume Upload */}
      <div className="mb-6">
        <label className="block mb-2 font-medium">Resume (PDF)</label>
        <input
          id="resume-upload"
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => document.getElementById("resume-upload")?.click()}
          className="px-4 py-2 border rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
        >
          {resumeFile ? resumeFile.name : "Upload Resume"}
        </button>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!isFormValid || isGenerating}
        className="w-full p-3 bg-black text-white rounded-full hover:bg-gray-700 transition-colors cursor-pointer disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 disabled:cursor-not-allowed"
      >
        {isGenerating ? "Generating..." : "Generate Cover Letter"}
      </button>
    </div>
  );
}
