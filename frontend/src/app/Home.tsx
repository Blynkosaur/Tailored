"use client";
import { getPDFDisplay } from "@/backend/server_posts/post";
import LatexEditor from "@/components/Editor";
import Navbar from "@/components/Navbar";
import PdfViewer from "@/components/PdfViewer";
import { ResumeData } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type HomeProps = {
  initialPdfResumeContent: ResumeData;
};

export default function Home({ initialPdfResumeContent }: HomeProps) {
  const [resumeContent, setResumeContent] = useState<string | undefined>(
    initialPdfResumeContent.resume
  );
  const [pdfResumeContent, setPdfResumeContent] = useState<string>(
    initialPdfResumeContent.resume
  );
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);

  useEffect(() => {
    const localData =
      typeof window !== "undefined"
        ? localStorage.getItem("resumeContent")
        : null;
    console.log("localData", localData);
    if (localData && localData !== "") {
      const resumeData = ResumeData.parse(JSON.parse(localData));
      if (resumeData.datetime > initialPdfResumeContent.datetime) {
        setResumeContent(resumeData.resume);
        setPdfResumeContent(resumeData.resume);
      }
      // console.log("Loaded local data");
      return;
    }
  }, []);

  useEffect(() => {
    if (pdfResumeContent && pdfResumeContent !== "") {
      loadPDF();
    }
  }, [pdfResumeContent]);

  useEffect(() => {
    localStorage.setItem(
      "resumeContent",
      JSON.stringify(
        ResumeData.parse({ resume: resumeContent, datetime: Date.now() })
      )
    );
  }, [resumeContent]);

  async function loadPDF() {
    if (pdfLoading) return;
    try {
      setPdfLoading(true);
      const data = await getPDFDisplay(pdfResumeContent);
      if (data?.pdf) {
        // Convert base64 to data URL
        const dataUrl = `data:application/pdf;base64,${data.pdf}`;
        setPdfUrl(dataUrl);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="h-screen">
      <Navbar />
      <div className="flex flex-1 flex-row gap-4 bg-(--bg-primary) p-5 overflow-hidden h-full">
        <LatexEditor
          content={resumeContent}
          onChange={(content) => {
            setResumeContent(content);
          }}
          onRefresh={setPdfResumeContent}
        />
        <PdfViewer
          pdfUrl={pdfUrl}
          isLoading={pdfLoading}
          setIsLoading={setPdfLoading}
        />
      </div>
    </div>
  );
}
