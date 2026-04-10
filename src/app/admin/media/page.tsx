"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./page.css";

interface Folder {
  id: string;
  name: string;
  createdAt: string;
  _count: { children: number; items: number };
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
    <div className="container p-6 fade-in ml-page">
      <div className="flex-col flex items-center text-center mb-8 ml-title-wrap">
        <h1 className="text-gold mb-2 ml-title">
          Медия библиотека
        </h1>
      </div>

      <div className="flex justify-center gap-4 mb-8 ml-nav-actions">
        <button onClick={() => router.push("/admin/media/shares")} className="btn btn-primary">
          Споделени линкове
        </button>
        {isAdminRole && (<button onClick={() => router.push("/admin/audit")} className="btn btn-secondary">
          Одитен дневник
        </button>)}
        {(isAdminRole || memberReturnCardCode) && (<button onClick={handleBack} className="btn btn-secondary">
          Назад
        </button>)}
      </div>

      <div className="mb-8 ml-folders-section">
        <div className="flex justify-between items-center mb-4 ml-folders-header">
          <h2 className="ml-folders-title">Папки</h2>
          <div className="flex gap-2 ml-bulk-toolbar">
            <button
              className="btn btn-secondary ml-btn-sm"
              onClick={toggleSelectAllFolders}
              disabled={folders.length === 0 || downloadingSelection}
            >
              {allFoldersSelected ? "Размаркирай всички" : "Маркирай всички"}
            </button>
            <button
              className="btn btn-primary ml-btn-sm"
              onClick={handleDownloadSelectedFolders}
              disabled={selectedFolderIds.size === 0 || downloadingSelection}
            >
              {downloadingSelection ? "Сваляне..." : `Свали избрани (${selectedFolderIds.size})`}
            </button>
            <button
              className="btn btn-secondary ml-btn-sm"
              onClick={() => setShowNewFolder(true)}
            >
              Нова папка
            </button>
          </div>
        </div>
        {folders.length === 0 ? (
          <p className="text-muted ml-empty">
            Няма създадени папки
          </p>
        ) : (
          <div className="grid grid-cols-1 ml-folder-list">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`folder-card ml-folder-card ${selectedFolderIds.has(folder.id) ? "ml-folder-card-selected" : ""}`}
                onClick={() => router.push(`/admin/media/folders/${folder.id}`)}
              >
                <label
                  className="ml-folder-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="ml-folder-checkbox"
                    checked={selectedFolderIds.has(folder.id)}
                    onChange={() => toggleFolderSelection(folder.id)}
                    aria-label={`Select folder ${folder.name}`}
                    disabled={downloadingSelection}
                  />
                </label>
                <div className="ml-folder-content">
                  <strong>{folder.name}</strong>
                  <span className="text-muted ml-folder-meta">
                    {folder._count.items} видеа · {folder._count.children} подпапки
                  </span>
                </div>
                {isAdminRole && (
                  <button
                    className="btn btn-error ml-delete-btn"
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

      {deletingFolder && (
        <div className="modal-overlay" onClick={() => setDeletingFolder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Потвърждение</h3>
            <p style={{ marginBottom: "24px" }}>
              Изтриване на папка <strong>{deletingFolder.name}</strong>?
            </p>
            <p className="text-muted" style={{ marginBottom: "24px", fontSize: "0.85rem" }}>
              Всички подпапки и референции ще бъдат премахнати. Физическите файлове няма да бъдат изтрити.
            </p>
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setDeletingFolder(null)}>
                Отказ
              </button>
              {isAdminRole && (
                <button className="btn btn-error" onClick={handleDeleteFolder}>
                  Изтрий
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
