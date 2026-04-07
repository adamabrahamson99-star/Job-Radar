"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";

interface OnboardingResumeProps {
  onNext: () => void;
  onSkip: () => void;
  onUploaded: () => void;
}

type UploadState = "idle" | "uploading" | "parsing" | "success" | "error";

export function OnboardingResume({ onNext, onSkip, onUploaded }: OnboardingResumeProps) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;

    if (file.type !== "application/pdf") {
      setErrorMsg("Please upload a PDF file.");
      setUploadState("error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("File must be under 10MB.");
      setUploadState("error");
      return;
    }

    setFileName(file.name);
    setErrorMsg("");
    setUploadState("uploading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadState("parsing");
      const res = await fetch("/api/profile/upload-resume", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Upload failed");
      }

      setUploadState("success");
      onUploaded();
    } catch (err: any) {
      setErrorMsg(err.message || "Upload failed. Please try again.");
      setUploadState("error");
    }
  }, [onUploaded]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const isUploading = uploadState === "uploading" || uploadState === "parsing";

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-xs font-mono text-blue-400">STEP 2 — RESUME</span>
        </div>
        <h1
          className="text-2xl font-bold text-text-primary mb-2"
          style={{ fontFamily: "Syne, sans-serif" }}
        >
          Upload your resume
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed">
          Radar uses Claude AI to parse your resume and build a skills profile. This powers
          the match scoring for every job you see.
        </p>
      </div>

      {uploadState === "success" ? (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <h3 className="text-green-400 font-semibold mb-1">Resume parsed successfully</h3>
          <p className="text-sm text-text-secondary">{fileName}</p>
          <p className="text-xs text-text-muted mt-2">
            Skills, experience level, and target roles have been extracted
          </p>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 mb-4 ${
            dragOver
              ? "border-blue-500 bg-blue-500/10"
              : uploadState === "error"
              ? "border-red-500/40 bg-red-500/5"
              : "border-radar-border hover:border-blue-500/40 hover:bg-radar-surface"
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
              <div>
                <p className="text-text-primary font-medium">
                  {uploadState === "uploading" ? "Uploading..." : "Parsing with Claude AI..."}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {uploadState === "parsing"
                    ? "Extracting skills, experience, and roles"
                    : "Transferring file securely"}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl bg-radar-elevated border border-radar-border flex items-center justify-center">
                  <svg className="w-7 h-7 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-text-primary font-medium mb-1">
                Drop your PDF resume here
              </p>
              <p className="text-sm text-text-secondary mb-4">or click to browse</p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileInput}
                  data-testid="input-resume-file"
                />
                <span className="inline-flex items-center gap-2 bg-radar-elevated border border-radar-border rounded-lg px-4 py-2 text-sm text-text-secondary hover:border-blue-500/40 hover:text-text-primary transition-all">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Choose PDF file
                </span>
              </label>
              <p className="text-xs text-text-muted mt-4">PDF only · Max 10MB</p>
            </>
          )}
        </div>
      )}

      {uploadState === "error" && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="flex items-center gap-3">
        {uploadState === "success" ? (
          <Button size="lg" onClick={onNext} className="flex-1" data-testid="button-continue">
            Continue
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="lg" onClick={onSkip} data-testid="button-skip">
              Skip for now
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
