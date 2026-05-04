"use client";

import { AppShell } from "@/components/app-shell";
import { faCircleCheck, faSpinner, faUpload, faFileMedical, faCalendarDay } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, useRef, useEffect } from "react";

export default function UploadPage() {
  const [reportDate, setReportDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [view, setView] = useState<"upload" | "date-picker">("upload");
  const [message, setMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreviewUrl(null);
    }
  }, [file]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  async function onSubmit(e?: React.FormEvent<HTMLFormElement>) {
    if (e) e.preventDefault();
    if (!file) {
      setStatus("error");
      setMessage("Please select a file.");
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    if (reportDate) {
      fd.set("reportDate", reportDate);
    }

    setStatus("uploading");
    setMessage(null);
    const res = await fetch("/api/reports/upload", { method: "POST", body: fd });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      readingsCount?: number;
      method?: string;
      note?: string;
      requiresDate?: boolean;
    };

    if (res.ok && body.requiresDate) {
      setStatus("error");
      setView("date-picker");
      setMessage(body.error ?? "Date missing from report. Please enter it manually.");
      return;
    }

    if (!res.ok) {
      setStatus("error");
      setMessage(body.error ?? "Upload failed");
      return;
    }

    setStatus("done");
    setMessage(
      `Stored ${body.readingsCount ?? 0} values (${body.method ?? "unknown"}).${body.note ? ` ${body.note}` : ""}`,
    );
    setFile(null);
    setReportDate("");
    setView("upload");
  }

  return (
    <AppShell>
      <div className={`mx-auto px-4 py-12 sm:px-6 lg:px-8 ${view === 'date-picker' ? 'max-w-6xl' : 'max-w-xl'}`}>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Upload report</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          PDF (text-based), CSV, XLS/XLSX, DOCX, or images. Values are extracted with deterministic rules — only
          parameters that match the clinical catalog are saved.
        </p>
        
        {view === "date-picker" && filePreviewUrl ? (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-950/60 p-6 shadow-xl h-full">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <FontAwesomeIcon icon={faFileMedical} className="text-cyan-400" /> File Preview
              </h2>
              <div className="flex-1 bg-white/5 rounded-xl border border-white/10 overflow-hidden min-h-[500px]">
                {file?.type.startsWith("image/") ? (
                  <img src={filePreviewUrl} alt="Preview" className="w-full h-full object-contain" />
                ) : (
                  <iframe src={filePreviewUrl} className="w-full h-full border-0 bg-white" title="Report Preview" />
                )}
              </div>
            </div>
            
            <form
              onSubmit={onSubmit}
              className="space-y-6 rounded-2xl border border-white/10 bg-zinc-950/60 p-6 shadow-xl sticky top-8"
            >
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Report date</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2.5 text-sm text-white outline-none ring-cyan-500/30 focus:ring-2"
                  required
                />
                <p className="mt-2 text-xs text-zinc-400">
                  We couldn't automatically find the date on your report. Please review the document and provide the collection or test date.
                </p>
              </div>
              <button
                type="submit"
                disabled={status === "uploading"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/25 disabled:opacity-60"
              >
                {status === "uploading" ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin />
                    Processing…
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCalendarDay} />
                    Confirm Date & Upload
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className={`mt-8 space-y-6 rounded-2xl border-2 border-dashed ${isDragging ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10 bg-zinc-950/60'} p-8 text-center shadow-xl transition-colors duration-200`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex justify-center mb-4">
               <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center">
                 <FontAwesomeIcon icon={faUpload} className="text-2xl text-cyan-400" />
               </div>
            </div>
            <div>
              <label className="text-base font-semibold tracking-wide text-white block">
                Drag & Drop your report here
              </label>
              <span className="mt-2 block text-sm text-zinc-400">or</span>
              <input
                ref={fileInputRef}
                name="file"
                type="file"
                accept=".pdf,.csv,.tsv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setFile(e.target.files[0]);
                    setStatus("idle");
                    setView("upload");
                  }
                }}
                className="hidden"
              />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors"
              >
                Browse Files
              </button>
            </div>
            
            {file && (
              <div className="mt-6 flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900 rounded-xl border border-white/5 w-full max-w-sm mx-auto">
                  <FontAwesomeIcon icon={faFileMedical} className="text-cyan-500" />
                  <span className="text-sm text-zinc-300 truncate flex-1 text-left">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                </div>
                
                <button
                  type="submit"
                  disabled={status === "uploading"}
                  className="flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/25 disabled:opacity-60"
                >
                  {status === "uploading" ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      Processing…
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faUpload} />
                      Upload & parse
                    </>
                  )}
                </button>
              </div>
            )}
            
            {message ? (
              <p
                className={`flex items-center justify-center gap-2 text-sm mt-4 ${
                  status === "error" ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {status === "done" ? <FontAwesomeIcon icon={faCircleCheck} /> : null}
                {message}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </AppShell>
  );
}
