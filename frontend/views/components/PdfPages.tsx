'use client';

import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function PdfPages(props: { file: string; onError: () => void }) {
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(800);

  useEffect(() => {
    const updatePageWidth = () => {
      const availableWidth = Math.min(window.innerWidth - 48, 960);
      setPageWidth(window.innerWidth < 640 ? Math.round(availableWidth * 1.3) : availableWidth);
    };
    updatePageWidth();
    window.addEventListener('resize', updatePageWidth);
    return () => window.removeEventListener('resize', updatePageWidth);
  }, []);

  return (
    <Document
      file={props.file}
      onLoadSuccess={({ numPages: loadedPages }) => setNumPages(loadedPages)}
      onLoadError={props.onError}
      loading={<div className="flex min-h-[60vh] items-center justify-center text-slate-700">Loading order pages...</div>}
      className="mx-auto flex w-full max-w-full flex-col items-center gap-4 overflow-hidden"
    >
      {Array.from({ length: numPages }, (_, index) => (
        <Page
          key={`page-${index + 1}`}
          pageNumber={index + 1}
          width={pageWidth}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          className="-translate-x-[15%] overflow-hidden rounded-lg shadow-sm sm:translate-x-0"
        />
      ))}
    </Document>
  );
}
