"use client";

import { useRef, useState } from "react";

interface CsvUploadProps {
  endpoint: string;
  onSuccess: (result: { upserted: number; errors: string[]; total: number }) => void;
  onError?: (msg: string) => void;
  templateHint?: string;
}

export default function CsvUpload({
  endpoint,
  onSuccess,
  onError,
  templateHint = "state, city, fuel_type, price_per_litre",
}: CsvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function upload(file: File) {
    if (!file.name.endsWith(".csv")) {
      onError?.("Only .csv files are accepted");
      return;
    }
    setFileName(file.name);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onSuccess(data);
    } catch (err: unknown) {
      onError?.((err as Error).message ?? "Upload error");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  return (
    <div
      className={`csv-upload ${dragging ? "csv-upload--drag" : ""} ${uploading ? "csv-upload--loading" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="csv-input-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      <div className="csv-upload-inner">
        {uploading ? (
          <>
            <div className="csv-spinner" />
            <p className="csv-hint">Uploading {fileName}…</p>
          </>
        ) : (
          <>
            <span className="csv-icon">📂</span>
            <p className="csv-title">
              {fileName ? `Uploaded: ${fileName}` : "Drop CSV here or click to browse"}
            </p>
            <p className="csv-hint">Expected columns: {templateHint}</p>
          </>
        )}
      </div>
    </div>
  );
}
