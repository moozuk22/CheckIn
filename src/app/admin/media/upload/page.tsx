"use client";

import { Suspense, useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CHUNK_SIZE } from "@/lib/media/chunk-size";

interface UploadItem {
  file: File;
  uploadId: string | null;
  mediaFileId: string | null;
  progress: number;
  status: "pending" | "uploading" | "finalizing" | "done" | "error";
  error: string | null;
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="container p-6 fade-in">
          <div className="flex justify-center mt-8">
            <div className="loading" />
          </div>
        </div>
      }
    >
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderLoading, setFolderLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const uploadingRef = useRef(false);

  const folderId = searchParams.get("folderId");

  useEffect(() => {
    if (!folderId) {
      router.replace("/admin/media");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/admin/folders/${folderId}`);
        if (res.ok) {
          const data = await res.json();
          setFolderName(data.folder.name);
        } else {
          router.replace("/admin/media");
        }
      } catch {
        router.replace("/admin/media");
      } finally {
        setFolderLoading(false);
      }
    })();
  }, [folderId, router]);

  const updateUpload = (index: number, update: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, ...update } : u)));
  };

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const newUploads: UploadItem[] = Array.from(fileList)
        .filter((f) => f.type.startsWith("video/"))
        .map((file) => ({
          file,
          uploadId: null,
          mediaFileId: null,
          progress: 0,
          status: "pending" as const,
          error: null,
        }));

      if (newUploads.length === 0) return;

      setUploads((prev) => {
        const updated = [...prev, ...newUploads];
        // Start processing if not already running
        if (!uploadingRef.current) {
          processQueue(updated, prev.length);
        }
        return updated;
      });
    },
    []
  );

  const processQueue = async (allUploads: UploadItem[], startIndex: number) => {
    uploadingRef.current = true;

    for (let i = startIndex; i < allUploads.length; i++) {
      const item = allUploads[i];
      if (item.status !== "pending") continue;

      try {
        await uploadFile(i, item.file);
      } catch {
        // Error already handled in uploadFile
      }
    }

    uploadingRef.current = false;
  };

  const uploadFile = async (index: number, file: File) => {
    updateUpload(index, { status: "uploading", progress: 0 });

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Step 1: Init
    let uploadId: string;
    let mediaFileId: string;
    try {
      const res = await fetch("/api/admin/media/upload-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "video/mp4",
          totalChunks,
          folderId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Грешка при инициализиране");
      }

      const data = await res.json();
      uploadId = data.uploadId;
      mediaFileId = data.mediaFileId;
      updateUpload(index, { uploadId, mediaFileId });
    } catch (err) {
      updateUpload(index, {
        status: "error",
        error: err instanceof Error ? err.message : "Грешка при качване",
      });
      throw err;
    }

    // Step 2: Check for already uploaded chunks (resume support)
    let receivedChunks: number[] = [];
    try {
      const statusRes = await fetch(`/api/admin/media/upload-status?uploadId=${uploadId}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        receivedChunks = statusData.receivedChunks || [];
      }
    } catch {
      // Ignore — will upload all chunks
    }

    // Step 3: Upload chunks
    const receivedSet = new Set(receivedChunks);
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (receivedSet.has(chunkIndex)) {
        updateUpload(index, { progress: ((chunkIndex + 1) / totalChunks) * 90 });
        continue;
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("chunk", chunk);

      const maxRetries = 5;
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          const res = await fetch("/api/admin/media/upload-chunk", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Грешка при качване на част");
          }
          break;
        } catch (err) {
          attempt++;
          if (attempt >= maxRetries) {
            updateUpload(index, {
              status: "error",
              error: err instanceof Error ? err.message : "Грешка при качване",
            });
            throw err;
          }
          // Exponential backoff: 1s, 2s, 4s, 8s
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
      }

      updateUpload(index, { progress: ((chunkIndex + 1) / totalChunks) * 90 });
    }

    // Step 4: Finalize
    updateUpload(index, { status: "finalizing", progress: 90 });

    try {
      const res = await fetch("/api/admin/media/upload-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, folderId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Грешка при финализиране");
      }

      updateUpload(index, { status: "done", progress: 100 });
    } catch (err) {
      updateUpload(index, {
        status: "error",
        error: err instanceof Error ? err.message : "Грешка при финализиране",
      });
      throw err;
    }
  };

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
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  if (folderLoading) {
    return (
      <div className="container p-6 fade-in">
        <div className="flex justify-center mt-8">
          <div className="loading" />
        </div>
      </div>
    );
  }

  const doneCount = uploads.filter((u) => u.status === "done").length;
  const errorCount = uploads.filter((u) => u.status === "error").length;
  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "finalizing"
  ).length;

  return (
    <div className="container p-6 fade-in">
      <div className="flex-col flex items-center text-center mb-8">
        <h1 className="text-gold mb-2" style={{ fontSize: "2rem", fontWeight: "600" }}>
          Качване на видео
        </h1>
        {folderName && (
          <p className="text-muted" style={{ fontSize: "0.95rem" }}>
            в папка: <strong>{folderName}</strong>
          </p>
        )}
      </div>

      <div className="flex justify-center gap-4 mb-8">
        <button onClick={() => router.push(`/admin/media/folders/${folderId}`)} className="btn btn-secondary">
          Назад към папката
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "var(--accent-gold-color)" : "var(--border-color)"}`,
          borderRadius: "16px",
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.3s ease",
          background: isDragging ? "rgba(212, 175, 55, 0.05)" : "transparent",
          marginBottom: "24px",
        }}
      >
        <p style={{ fontSize: "1.1rem", marginBottom: "8px" }}>
          Плъзнете файлове тук или натиснете за избор
        </p>
        <p className="text-muted" style={{ fontSize: "0.85rem" }}>
          Приемат се всички видео формати
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
      </div>

      {/* Summary */}
      {uploads.length > 0 && (
        <div className="flex justify-center gap-4 mb-4 text-muted" style={{ fontSize: "0.85rem" }}>
          <span>Общо: {uploads.length}</span>
          {activeCount > 0 && <span>Качване: {activeCount}</span>}
          {doneCount > 0 && <span style={{ color: "var(--success)" }}>Готови: {doneCount}</span>}
          {errorCount > 0 && <span style={{ color: "var(--error)" }}>Грешки: {errorCount}</span>}
        </div>
      )}

      {/* Upload list */}
      <div className="grid grid-cols-1" style={{ gap: "8px" }}>
        {uploads.map((upload, index) => (
          <div key={index} className="card" style={{ padding: "12px 16px" }}>
            <div className="flex justify-between items-center" style={{ gap: "12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.9rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {upload.file.name}
                </div>
                <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                  {formatSize(upload.file.size)}
                </div>
              </div>
              <div style={{ minWidth: "120px", textAlign: "right" }}>
                {upload.status === "pending" && (
                  <span className="text-muted">Изчакване...</span>
                )}
                {upload.status === "uploading" && (
                  <span style={{ color: "var(--accent-gold-color)" }}>
                    {Math.round(upload.progress)}%
                  </span>
                )}
                {upload.status === "finalizing" && (
                  <span style={{ color: "var(--warning)" }}>Обработка...</span>
                )}
                {upload.status === "done" && (
                  <span style={{ color: "var(--success)" }}>Качено</span>
                )}
                {upload.status === "error" && (
                  <span style={{ color: "var(--error)", fontSize: "0.8rem" }}>
                    {upload.error || "Грешка"}
                  </span>
                )}
              </div>
            </div>
            {(upload.status === "uploading" || upload.status === "finalizing") && (
              <div
                style={{
                  height: "3px",
                  background: "var(--border-color)",
                  borderRadius: "2px",
                  marginTop: "8px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${upload.progress}%`,
                    background: "var(--accent-gold-color)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}
