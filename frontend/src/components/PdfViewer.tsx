import {
  ZoomIn,
  ZoomOut,
  RefreshCw,
  FileOutput,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Spinner } from "@radix-ui/themes";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

interface PdfViewerProps {
  pdfUrl: string;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function PdfViewer({
  pdfUrl,
  isLoading,
  setIsLoading,
}: PdfViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);

  if (pdfUrl)
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  const baseWidth = 595; // A4 width in pixels at 72 DPI
  return (
    <div className="flex-1 flex flex-col bg-background rounded-2xl h-full overflow-hidden">
      <div className="p-3 border-b border-border flex gap-2 items-center justify-between">
        <div className="flex gap-2 items-center">
          <Button
            onClick={() => setZoom(Math.max(50, zoom - 10))}
            variant="outline"
            size="sm"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setZoom(Math.min(200, zoom + 10))}
            variant="outline"
            size="sm"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="text-sm text-(--editor-text) px-2 text-center">
            {zoom}%
          </span>
        </div>

        <div className="flex gap-2 items-center">
          {numPages && numPages > 1 && (
            <div className="flex gap-2 items-center">
              <Button
                onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                variant="outline"
                size="sm"
                disabled={pageNumber <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-(--editor-text) px-2">
                Page {pageNumber} of {numPages}
              </span>
              <Button
                onClick={() =>
                  setPageNumber(Math.min(numPages, pageNumber + 1))
                }
                variant="outline"
                size="sm"
                disabled={pageNumber >= numPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button variant="default" size="sm" className="gap-2">
            <FileOutput className="h-4 w-4" />
            Generate PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-2 border border-border gap-3"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="text-sm text-(--editor-text) text-center">
              Refresh
            </span>
          </Button>
        </div>
      </div>

      <div className="text-editor-text mb-5 h-full overflow-auto">
        <div className="flex-1 overflow-hidden p-8 flex items-start justify-center">
          {isLoading ? (
            <Spinner />
          ) : pdfUrl && pdfUrl !== "" ? (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<Spinner />}
              className="bg-(--editor-bg) shadow-(--shadow-pdf) rounded-sm"
              scale={zoom / 100}
            >
              {Array.from(new Array(numPages), (_, index) => (
                <Page
                  key={`page_${index + 1}`}
                  pageNumber={index + 1}
                  width={(baseWidth * zoom) / 100}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              ))}
            </Document>
          ) : (
            <>Invalid PDF</>
          )}
        </div>
      </div>
    </div>
  );
}

// className="bg-(--editor-bg) shadow-(--shadow-pdf) rounded-sm"
//               style={{
//                 width: `${(595 * zoom) / 100}px`,
//                 minHeight: `${(842 * zoom) / 100}px`,
//                 transform: `scale(${zoom / 100})`,
//                 transformOrigin: "top center",
//               }}
