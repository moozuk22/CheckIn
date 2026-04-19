"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./folders/[id]/page.css";
import "./page.css";

interface Folder {
  id: string;
  name: string;
  createdAt: string;
  _count: { children: number; items: number; videos: number; images: number; audios: number };
}

interface FolderDownloadResponse {
  children: Array<{ id: string }>;
  items: Array<{
    mediaFile: {
      id: string;
      displayName: string;
      originalName: string;
      status: string;
    };
  }>;
}

export default function MediaLibraryPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [isMediaManager, setIsMediaManager] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [downloadingSelection, setDownloadingSelection] = useState(false);
  const [memberReturnCardCode] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("admin_return_member_card_code") : null
  );
  const router = useRouter();

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
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/folders");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setFolders(data.folders);
        }
      } catch {
        // Ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedFolderIds((prev) => {
      if (prev.size === 0) return prev;
      const folderIds = new Set(folders.map((folder) => folder.id));
      const next = new Set(Array.from(prev).filter((id) => folderIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [folders]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/check-session", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setIsAdminRole(data.role === "ADMIN");
          setIsMediaManager(data.role === "MEDIA_MANAGER");
        }
      } catch {
        // Ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleDeleteFolder = async () => {
    if (!deletingFolder) return;
    try {
      const res = await fetch(`/api/admin/folders/${deletingFolder.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFolders((prev) => prev.filter((f) => f.id !== deletingFolder.id));
        setDeletingFolder(null);
      } else {
        const data = await res.json();
        alert(data.error || "Грешка при изтриване на папка.");
      }
    } catch {
      alert("Грешка при изтриване на папка.");
    }
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const toggleSelectAllFolders = () => {
    if (folders.length === 0) return;
    if (selectedFolderIds.size === folders.length) {
      setSelectedFolderIds(new Set());
      return;
    }
    setSelectedFolderIds(new Set(folders.map((folder) => folder.id)));
  };

  const triggerFileDownload = (mediaFileId: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = `/api/admin/media/${mediaFileId}/stream`;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const collectReadyFiles = async (
    folderId: string,
    visited: Set<string>,
    downloads: Map<string, string>
  ): Promise<void> => {
    if (visited.has(folderId)) return;
    visited.add(folderId);

    const res = await fetch(`/api/admin/folders/${folderId}`);
    if (!res.ok) return;
    const data = (await res.json()) as FolderDownloadResponse;

    for (const item of data.items ?? []) {
      if (item.mediaFile.status === "READY") {
        downloads.set(
          item.mediaFile.id,
          item.mediaFile.originalName || item.mediaFile.displayName
        );
      }
    }

    for (const child of data.children ?? []) {
      await collectReadyFiles(child.id, visited, downloads);
    }
  };

  const handleDownloadSelectedFolders = async () => {
    if (selectedFolderIds.size === 0 || downloadingSelection) return;
    setDownloadingSelection(true);
    try {
      const visited = new Set<string>();
      const downloads = new Map<string, string>();

      for (const folderId of selectedFolderIds) {
        await collectReadyFiles(folderId, visited, downloads);
      }

      if (downloads.size === 0) {
        alert("Няма готови файлове за сваляне в избраните папки.");
        return;
      }

      for (const [mediaFileId, fileName] of downloads) {
        triggerFileDownload(mediaFileId, fileName);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      }
    } catch {
      alert("Грешка при групово сваляне.");
    } finally {
      setDownloadingSelection(false);
    }
  };

  const handleBack = () => {
    if (isAdminRole || !memberReturnCardCode) {
      router.push("/admin/members");
      return;
    }
    router.push(`/member/${memberReturnCardCode}`);
  };

  const allFoldersSelected = folders.length > 0 && selectedFolderIds.size === folders.length;

  return (
    <>
      <div className="fd-root">
        <div className="fd-container fd-library-container">
          <div className="fd-header">
            <h1 className="fd-title">Медия библиотека</h1>
          </div>

          <div className="fd-actions">
            <button onClick={() => router.push("/admin/media/shares")} className="fd-btn fd-btn-primary">
              Споделени линкове
            </button>
            {isAdminRole && (
              <button onClick={() => router.push("/admin/audit")} className="fd-btn fd-btn-secondary">
                Одитен дневник
              </button>
            )}
            {(isAdminRole || memberReturnCardCode) && (
              <button onClick={handleBack} className="fd-btn fd-btn-secondary">
                Назад
              </button>
            )}
            {(isAdminRole || isMediaManager) && (
              <button
                onClick={async () => {
                  await fetch("/api/admin/logout", { method: "POST" });
                  router.push("/admin/login");
                }}
                className="fd-btn fd-btn-ghost"
              >
                Изход
              </button>
            )}
          </div>

          <div className="fd-section">
            <div className="fd-section-header">
              <span className="fd-section-title">Папки</span>
              <span className="fd-section-count">{folders.length}</span>
              <div className="fd-section-line" />
              <div className="fd-media-bulk-actions fd-library-bulk-actions">
                <button
                  className="fd-btn fd-btn-ghost fd-btn-sm"
                  onClick={toggleSelectAllFolders}
                  disabled={folders.length === 0 || downloadingSelection}
                >
                  {allFoldersSelected ? "Размаркирай всички" : "Маркирай всички"}
                </button>
                <button
                  className="fd-btn fd-btn-secondary fd-btn-sm"
                  onClick={handleDownloadSelectedFolders}
                  disabled={selectedFolderIds.size === 0 || downloadingSelection}
                >
                  {downloadingSelection ? "Сваляне..." : `Свали избрани (${selectedFolderIds.size})`}
                </button>
                <button className="fd-btn fd-btn-primary fd-btn-sm" onClick={() => setShowNewFolder(true)}>
                  Нова папка
                </button>
              </div>
            </div>

            {folders.length === 0 ? (
              <div className="fd-empty fd-library-empty">
                <p className="fd-empty-text">Няма създадени папки</p>
              </div>
            ) : (
              <div className="fd-folder-grid fd-library-folder-grid">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`fd-folder-card fd-library-folder-card ${selectedFolderIds.has(folder.id) ? "fd-library-folder-card-selected" : ""}`}
                    onClick={() => router.push(`/admin/media/folders/${folder.id}`)}
                  >
                    <label className="fd-library-folder-select" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="fd-media-checkbox"
                        checked={selectedFolderIds.has(folder.id)}
                        onChange={() => toggleFolderSelection(folder.id)}
                        aria-label={`Select folder ${folder.name}`}
                        disabled={downloadingSelection}
                      />
                    </label>
                    <div className="fd-folder-icon">📁</div>
                    <div className="fd-folder-info">
                      <div className="fd-folder-name">{folder.name}</div>
                      <div className="fd-folder-meta">
                        {formatFolderMeta(folder._count)}
                      </div>
                    </div>
                    {isAdminRole && (
                      <button
                        className="fd-btn fd-btn-danger fd-btn-sm fd-library-folder-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingFolder(folder);
                        }}
                      >
                        Изтрий
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewFolder && (
        <div className="fd-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Нова папка</h3>
            <input
              type="text"
              className="fd-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Име на папката"
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
            />
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setShowNewFolder(false)}>
                Отказ
              </button>
              <button className="fd-btn fd-btn-primary" onClick={handleCreateFolder}>
                Създай
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingFolder && (
        <div className="fd-overlay" onClick={() => setDeletingFolder(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Потвърждение</h3>
            <p className="fd-modal-body">
              Изтриване на папка <strong style={{ color: "#e8e0d0" }}>{deletingFolder.name}</strong>?
            </p>
            <div className="fd-modal-note">
              Всички подпапки и референции ще бъдат премахнати. Физическите файлове няма да бъдат изтрити.
            </div>
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setDeletingFolder(null)}>
                Отказ
              </button>
              {isAdminRole && (
                <button className="fd-btn fd-btn-danger" onClick={handleDeleteFolder}>
                  Изтрий
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatFolderMeta(count: { items: number; children: number; videos: number; images: number; audios: number }): string {
  const parts: string[] = [];
  if (count.videos > 0) parts.push(`${count.videos} видеа`);
  if (count.images > 0) parts.push(`${count.images} снимки`);
  if (count.audios > 0) parts.push(`${count.audios} аудио`);
  const other = count.items - count.videos - count.images - count.audios;
  if (other > 0) parts.push(`${other} файла`);
  if (parts.length === 0) parts.push("0 файла");
  if (count.children > 0) parts.push(`${count.children} подпапки`);
  return parts.join(" · ");
}
