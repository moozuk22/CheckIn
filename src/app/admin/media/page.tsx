"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface MediaFile {
  id: string;
  displayName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  isVisible: boolean;
  durationSecs: number | null;
  createdAt: string;
  references: number;
}

interface Folder {
  id: string;
  name: string;
  createdAt: string;
  _count: { children: number; items: number };
}

export default function MediaLibraryPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deletingFile, setDeletingFile] = useState<MediaFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingFile, setEditingFile] = useState<MediaFile | null>(null);
  const [editName, setEditName] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const router = useRouter();
  const limit = 20;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/media?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Error fetching media:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchFiles();
    fetchFolders();
  }, [fetchFiles, fetchFolders]);

  const handleDelete = async () => {
    if (!deletingFile) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/media/${deletingFile.id}`, { method: "DELETE" });
      if (res.ok) {
        setFiles(files.filter((f) => f.id !== deletingFile.id));
        setTotal((t) => t - 1);
        setDeletingFile(null);
      } else {
        alert("Грешка при изтриване на файла.");
      }
    } catch {
      alert("Грешка при изтриване на файла.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleVisibility = async (file: MediaFile) => {
    try {
      const res = await fetch(`/api/admin/media/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: !file.isVisible }),
      });
      if (res.ok) {
        setFiles(files.map((f) => (f.id === file.id ? { ...f, isVisible: !f.isVisible } : f)));
      }
    } catch {
      alert("Грешка при промяна на видимостта.");
    }
  };

  const handleRename = async () => {
    if (!editingFile || !editName.trim()) return;
    try {
      const res = await fetch(`/api/admin/media/${editingFile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editName.trim() }),
      });
      if (res.ok) {
        setFiles(
          files.map((f) =>
            f.id === editingFile.id ? { ...f, displayName: editName.trim() } : f
          )
        );
        setEditingFile(null);
      }
    } catch {
      alert("Грешка при преименуване.");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/admin/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (res.ok) {
        setShowNewFolder(false);
        setNewFolderName("");
        fetchFolders();
      }
    } catch {
      alert("Грешка при създаване на папка.");
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="container p-6 fade-in">
      <div className="flex-col flex items-center text-center mb-8">
        <h1 className="text-gold mb-2" style={{ fontSize: "2rem", fontWeight: "600" }}>
          Медия библиотека
        </h1>
      </div>

      <div className="flex justify-center gap-4 mb-8" style={{ flexWrap: "wrap" }}>
        <button onClick={() => router.push("/admin/media/shares")} className="btn btn-primary">
          Споделени линкове
        </button>
        <button onClick={() => router.push("/admin/audit")} className="btn btn-secondary">
          Одитен дневник
        </button>
        <button onClick={() => router.push("/admin/members")} className="btn btn-secondary">
          Назад
        </button>
      </div>

      {/* Folders section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 style={{ fontSize: "1.3rem", marginBottom: 0 }}>Папки</h2>
          <button
            className="btn btn-secondary"
            style={{ padding: "6px 14px", fontSize: "12px" }}
            onClick={() => setShowNewFolder(true)}
          >
            Нова папка
          </button>
        </div>
        {folders.length === 0 ? (
          <p className="text-muted" style={{ fontSize: "0.85rem" }}>
            Няма създадени папки
          </p>
        ) : (
          <div className="grid grid-cols-1" style={{ gap: "8px" }}>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="folder-card"
                onClick={() => router.push(`/admin/media/folders/${folder.id}`)}
              >
                <div style={{ flex: 1 }}>
                  <strong>{folder.name}</strong>
                  <span className="text-muted" style={{ fontSize: "0.8rem", marginLeft: "12px" }}>
                    {folder._count.items} видеа · {folder._count.children} подпапки
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search and filter */}
      <div className="flex gap-4 mb-4" style={{ flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Търсене по име..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: "200px" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{ width: "auto", minWidth: "150px" }}
        >
          <option value="">Всички статуси</option>
          <option value="READY">Готово</option>
          <option value="PROCESSING">Обработка</option>
          <option value="UPLOADING">Качване</option>
          <option value="FAILED">Неуспешно</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center mt-8">
          <div className="loading" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-muted" style={{ textAlign: "center", marginTop: "2rem" }}>
          Няма намерени видеа
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1" style={{ gap: "12px" }}>
            {files.map((file) => (
              <div key={file.id} className="card" style={{ padding: "16px" }}>
                <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div className="flex items-center gap-3">
                      <strong style={{ fontSize: "1rem" }}>{file.displayName}</strong>
                      <span
                        className="badge"
                        style={{
                          background:
                            file.status === "READY"
                              ? "var(--success)"
                              : file.status === "PROCESSING"
                              ? "var(--warning)"
                              : file.status === "FAILED"
                              ? "var(--error)"
                              : "var(--text-muted)",
                          color: "#000",
                          fontSize: "0.7rem",
                        }}
                      >
                        {file.status === "READY"
                          ? "Готово"
                          : file.status === "PROCESSING"
                          ? "Обработка"
                          : file.status === "UPLOADING"
                          ? "Качване"
                          : "Неуспешно"}
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: file.isVisible
                            ? "rgba(76,175,80,0.2)"
                            : "rgba(136,136,136,0.2)",
                          color: file.isVisible ? "var(--success)" : "var(--text-muted)",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                        }}
                        onClick={() => handleToggleVisibility(file)}
                      >
                        {file.isVisible ? "Видимо" : "Скрито"}
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                      {formatSize(file.sizeBytes)}
                      {file.durationSecs ? ` · ${formatDuration(file.durationSecs)}` : ""}
                      {` · ${new Date(file.createdAt).toLocaleDateString("bg-BG")}`}
                      {file.references > 0 ? ` · ${file.references} реф.` : ""}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "12px" }}
                      onClick={() => {
                        setEditingFile(file);
                        setEditName(file.displayName);
                      }}
                    >
                      Преименувай
                    </button>
                    <button
                      className="btn btn-error"
                      style={{ padding: "6px 12px", fontSize: "12px" }}
                      onClick={() => setDeletingFile(file)}
                    >
                      Изтрий
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-3 mt-4">
              <button
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                Назад
              </button>
              <span className="text-muted" style={{ lineHeight: "36px" }}>
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                Напред
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      {deletingFile && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeletingFile(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Потвърждение</h3>
            <p style={{ marginBottom: "24px" }}>
              Сигурни ли сте, че искате да изтриете <strong>{deletingFile.displayName}</strong>?
            </p>
            <p className="text-muted" style={{ marginBottom: "24px", fontSize: "0.85rem" }}>
              Това действие е необратимо. Файлът ще бъде премахнат от всички папки и линкове.
            </p>
            <div className="flex justify-center gap-4">
              <button
                className="btn btn-secondary"
                onClick={() => setDeletingFile(null)}
                disabled={isDeleting}
              >
                Отказ
              </button>
              <button className="btn btn-error" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Изтриване..." : "Изтрий"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {editingFile && (
        <div className="modal-overlay" onClick={() => setEditingFile(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Преименувай</h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              style={{ marginBottom: "24px" }}
              autoFocus
            />
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setEditingFile(null)}>
                Отказ
              </button>
              <button className="btn btn-primary" onClick={handleRename}>
                Запази
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <div className="modal-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Нова папка</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Име на папката"
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              style={{ marginBottom: "24px" }}
              autoFocus
            />
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setShowNewFolder(false)}>
                Отказ
              </button>
              <button className="btn btn-primary" onClick={handleCreateFolder}>
                Създай
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}
