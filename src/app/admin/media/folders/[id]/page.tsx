"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface FolderInfo {
  id: string;
  name: string;
  parentId: string | null;
  parent: { id: string; name: string } | null;
  createdAt: string;
}

interface ChildFolder {
  id: string;
  name: string;
  createdAt: string;
  _count: { children: number; items: number };
}

interface FolderItemEntry {
  id: string;
  mediaFileId: string;
  displayName: string | null;
  sortOrder: number;
  mediaFile: {
    id: string;
    displayName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    isVisible: boolean;
    references: number;
    durationSecs: number | null;
    createdAt: string;
  };
}

interface MediaFile {
  id: string;
  displayName: string;
  status: string;
}

export default function FolderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [folder, setFolder] = useState<FolderInfo | null>(null);
  const [children, setChildren] = useState<ChildFolder[]>([]);
  const [items, setItems] = useState<FolderItemEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [allFiles, setAllFiles] = useState<MediaFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [showRename, setShowRename] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [editingMedia, setEditingMedia] = useState<FolderItemEntry | null>(null);
  const [editMediaName, setEditMediaName] = useState("");
  const [deletingItem, setDeletingItem] = useState<FolderItemEntry | null>(null);
  const [deletingChild, setDeletingChild] = useState<ChildFolder | null>(null);
  const [deletingCurrentFolder, setDeletingCurrentFolder] = useState(false);
  const [playingItem, setPlayingItem] = useState<FolderItemEntry | null>(null);

  const fetchFolder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/folders/${id}`);
      if (res.ok) {
        const data = await res.json();
        setFolder(data.folder);
        setChildren(data.children);
        setItems(data.items);
      }
    } catch (err) {
      console.error("Error fetching folder:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchFolder();
  }, [fetchFolder]);

  const handleCreateSubfolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/admin/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: id }),
      });
      if (res.ok) {
        setShowNewFolder(false);
        setNewFolderName("");
        fetchFolder();
      }
    } catch {
      alert("Грешка при създаване на папка.");
    }
  };

  const handleAddVideo = async () => {
    if (!selectedFileId) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaFileId: selectedFileId }),
      });
      if (res.ok) {
        setShowAddVideo(false);
        setSelectedFileId("");
        fetchFolder();
      } else {
        const data = await res.json();
        alert(data.error || "Грешка при добавяне.");
      }
    } catch {
      alert("Грешка при добавяне на видео.");
    }
  };

  const handleRemoveItem = async () => {
    if (!deletingItem) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}/items/${deletingItem.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
        setDeletingItem(null);
      }
    } catch {
      alert("Грешка при изтриване.");
    }
  };

  const handleToggleVisibility = async (item: FolderItemEntry) => {
    try {
      const res = await fetch(`/api/admin/media/${item.mediaFile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: !item.mediaFile.isVisible }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  mediaFile: { ...i.mediaFile, isVisible: !i.mediaFile.isVisible },
                }
              : i
          )
        );
      }
    } catch {
      alert("Грешка при промяна на видимостта.");
    }
  };

  const handleRenameMedia = async () => {
    if (!editingMedia || !editMediaName.trim()) return;
    try {
      const res = await fetch(`/api/admin/media/${editingMedia.mediaFile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editMediaName.trim() }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === editingMedia.id
              ? {
                  ...i,
                  mediaFile: { ...i.mediaFile, displayName: editMediaName.trim() },
                }
              : i
          )
        );
        setEditingMedia(null);
      }
    } catch {
      alert("Грешка при преименуване.");
    }
  };

  const handleDeleteChild = async () => {
    if (!deletingChild) return;
    try {
      const res = await fetch(`/api/admin/folders/${deletingChild.id}`, { method: "DELETE" });
      if (res.ok) {
        setChildren((prev) => prev.filter((c) => c.id !== deletingChild.id));
        setDeletingChild(null);
      }
    } catch {
      alert("Грешка при изтриване на папка.");
    }
  };

  const handleRename = async () => {
    if (!renameName.trim()) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (res.ok) {
        setFolder((prev) => (prev ? { ...prev, name: renameName.trim() } : prev));
        setShowRename(false);
      }
    } catch {
      alert("Грешка при преименуване.");
    }
  };

  const handleCopyFolder = async () => {
    try {
      const res = await fetch(`/api/admin/folders/${id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetParentId: folder?.parentId ?? null }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/admin/media/folders/${data.id}`);
      }
    } catch {
      alert("Грешка при копиране.");
    }
  };

  const handleDeleteCurrentFolder = async () => {
    if (!folder) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}`, { method: "DELETE" });
      if (res.ok) {
        const target = folder.parentId ? `/admin/media/folders/${folder.parentId}` : "/admin/media";
        router.push(target);
      } else {
        const data = await res.json();
        alert(data.error || "Грешка при изтриване на папка.");
      }
    } catch {
      alert("Грешка при изтриване на папка.");
    } finally {
      setDeletingCurrentFolder(false);
    }
  };

  const openAddVideo = async () => {
    setShowAddVideo(true);
    try {
      const res = await fetch("/api/admin/media?limit=100&status=READY");
      if (res.ok) {
        const data = await res.json();
        setAllFiles(data.files);
      }
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return (
      <div className="container p-6 fade-in">
        <div className="flex justify-center mt-8">
          <div className="loading" />
        </div>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="container p-6 fade-in">
        <p className="text-muted" style={{ textAlign: "center" }}>
          Папката не е намерена
        </p>
      </div>
    );
  }

  return (
    <div className="container p-6 fade-in">
      <div className="folder-breadcrumb">
        <button className="folder-breadcrumb-item" onClick={() => router.push("/admin/media")}>
          Библиотека
        </button>
        {folder.parent && (
          <>
            <span className="folder-breadcrumb-sep">/</span>
            <button
              className="folder-breadcrumb-item"
              onClick={() => router.push(`/admin/media/folders/${folder.parent!.id}`)}
            >
              {folder.parent.name}
            </button>
          </>
        )}
        <span className="folder-breadcrumb-sep">/</span>
        <span>{folder.name}</span>
      </div>

      <h1 className="text-gold mb-4" style={{ fontSize: "1.8rem" }}>
        {folder.name}
      </h1>

      <div className="flex gap-3 mb-8" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setShowNewFolder(true)}>
          Нова подпапка
        </button>
        <button className="btn btn-primary" onClick={() => router.push(`/admin/media/upload?folderId=${id}`)}>
          Качи медия
        </button>
        <button className="btn btn-primary" onClick={openAddVideo}>
          Добави медия
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setRenameName(folder.name);
            setShowRename(true);
          }}
        >
          Преименувай
        </button>
        <button className="btn btn-secondary" onClick={handleCopyFolder}>
          Копирай папка
        </button>
        <button className="btn btn-error" onClick={() => setDeletingCurrentFolder(true)}>
          Изтрий папка
        </button>
      </div>

      {children.length > 0 && (
        <div className="mb-8">
          <h3 style={{ marginBottom: "12px" }}>Подпапки</h3>
          <div className="grid grid-cols-1" style={{ gap: "8px" }}>
            {children.map((child) => (
              <div key={child.id} className="folder-card">
                <div
                  style={{ flex: 1, cursor: "pointer" }}
                  onClick={() => router.push(`/admin/media/folders/${child.id}`)}
                >
                  <strong>{child.name}</strong>
                  <span className="text-muted" style={{ fontSize: "0.8rem", marginLeft: "12px" }}>
                    {child._count.items} файла · {child._count.children} подпапки
                  </span>
                </div>
                <button
                  className="btn btn-error"
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingChild(child);
                  }}
                >
                  Изтрий
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <div>
          <h3 style={{ marginBottom: "12px" }}>Медия</h3>
          <div className="grid grid-cols-1" style={{ gap: "12px" }}>
            {items.map((item) => (
              <div key={item.id} className="card" style={{ padding: "16px" }}>
                <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                      <strong
                        title={item.displayName || item.mediaFile.displayName}
                        style={{
                          fontSize: "1rem",
                          minWidth: 0,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.displayName || item.mediaFile.displayName}
                      </strong>
                      <span
                        className="badge"
                        style={{
                          background:
                            item.mediaFile.status === "READY"
                              ? "var(--success)"
                              : item.mediaFile.status === "PROCESSING"
                              ? "var(--warning)"
                              : item.mediaFile.status === "FAILED"
                              ? "var(--error)"
                              : "var(--text-muted)",
                          color: "#000",
                          fontSize: "0.7rem",
                        }}
                      >
                        {item.mediaFile.status === "READY"
                          ? "Готово"
                          : item.mediaFile.status === "PROCESSING"
                          ? "Обработка"
                          : item.mediaFile.status === "UPLOADING"
                          ? "Качване"
                          : "Неуспешно"}
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: item.mediaFile.isVisible
                            ? "rgba(76,175,80,0.2)"
                            : "rgba(136,136,136,0.2)",
                          color: item.mediaFile.isVisible ? "var(--success)" : "var(--text-muted)",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                        }}
                        onClick={() => handleToggleVisibility(item)}
                      >
                        {item.mediaFile.isVisible ? "Видимо" : "Скрито"}
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                      {formatSize(item.mediaFile.sizeBytes)}
                      {item.mediaFile.durationSecs ? ` · ${formatDuration(item.mediaFile.durationSecs)}` : ""}
                      {` · ${new Date(item.mediaFile.createdAt).toLocaleDateString("bg-BG")}`}
                      {item.mediaFile.references > 0 ? ` · ${item.mediaFile.references} реф.` : ""}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {item.mediaFile.status === "READY" && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                        onClick={() => setPlayingItem(item)}
                      >
                        Пусни
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "12px" }}
                      onClick={() => {
                        setEditingMedia(item);
                        setEditMediaName(item.mediaFile.displayName);
                      }}
                    >
                      Преименувай
                    </button>
                    <button
                      className="btn btn-error"
                      style={{ padding: "6px 12px", fontSize: "12px" }}
                      onClick={() => setDeletingItem(item)}
                    >
                      Изтрий
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        children.length === 0 && (
          <p className="text-muted" style={{ textAlign: "center" }}>
            Празна папка
          </p>
        )
      )}

      {showNewFolder && (
        <div className="modal-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Нова подпапка</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Име на папката"
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubfolder()}
              style={{ marginBottom: "24px" }}
              autoFocus
            />
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setShowNewFolder(false)}>
                Отказ
              </button>
              <button className="btn btn-primary" onClick={handleCreateSubfolder}>
                Създай
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddVideo && (
        <div className="modal-overlay" onClick={() => setShowAddVideo(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <h3 style={{ marginBottom: "16px" }}>Добави медия</h3>
            <select
              value={selectedFileId}
              onChange={(e) => setSelectedFileId(e.target.value)}
              style={{ marginBottom: "24px" }}
            >
              <option value="">Избери медия...</option>
              {allFiles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.displayName}
                </option>
              ))}
            </select>
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setShowAddVideo(false)}>
                Отказ
              </button>
              <button className="btn btn-primary" onClick={handleAddVideo} disabled={!selectedFileId}>
                Добави
              </button>
            </div>
          </div>
        </div>
      )}

      {showRename && (
        <div className="modal-overlay" onClick={() => setShowRename(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Преименувай папка</h3>
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              style={{ marginBottom: "24px" }}
              autoFocus
            />
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setShowRename(false)}>
                Отказ
              </button>
              <button className="btn btn-primary" onClick={handleRename}>
                Запази
              </button>
            </div>
          </div>
        </div>
      )}

      {editingMedia && (
        <div className="modal-overlay" onClick={() => setEditingMedia(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Преименувай медия</h3>
            <input
              type="text"
              value={editMediaName}
              onChange={(e) => setEditMediaName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameMedia()}
              style={{ marginBottom: "24px" }}
              autoFocus
            />
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setEditingMedia(null)}>
                Отказ
              </button>
              <button className="btn btn-primary" onClick={handleRenameMedia}>
                Запази
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingItem && (
        <div className="modal-overlay" onClick={() => setDeletingItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Потвърждение</h3>
            <p style={{ marginBottom: "24px" }}>
              Изтриване на <strong>{deletingItem.displayName || deletingItem.mediaFile.displayName}</strong>?
            </p>
            <p className="text-muted" style={{ marginBottom: "24px", fontSize: "0.85rem" }}>
              {deletingItem.mediaFile.references > 1
                ? "Файлът е в повече от една папка. Ще бъде премахната само текущата референция."
                : "Файлът е само в тази папка. Ще бъде изтрит от диска и от базата."}
            </p>
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setDeletingItem(null)}>
                Отказ
              </button>
              <button className="btn btn-error" onClick={handleRemoveItem}>
                Изтрий
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingCurrentFolder && (
        <div className="modal-overlay" onClick={() => setDeletingCurrentFolder(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Потвърждение</h3>
            <p style={{ marginBottom: "24px" }}>
              Изтриване на папка <strong>{folder.name}</strong>?
            </p>
            <p className="text-muted" style={{ marginBottom: "24px", fontSize: "0.85rem" }}>
              Всички подпапки и референции ще бъдат премахнати. Физическите файлове няма да бъдат изтрити.
            </p>
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setDeletingCurrentFolder(false)}>
                Отказ
              </button>
              <button className="btn btn-error" onClick={handleDeleteCurrentFolder}>
                Изтрий
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingChild && (
        <div className="modal-overlay" onClick={() => setDeletingChild(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Потвърждение</h3>
            <p style={{ marginBottom: "24px" }}>
              Изтриване на папка <strong>{deletingChild.name}</strong>?
            </p>
            <p className="text-muted" style={{ marginBottom: "24px", fontSize: "0.85rem" }}>
              Всички подпапки и референции ще бъдат премахнати. Физическите файлове няма да бъдат изтрити.
            </p>
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setDeletingChild(null)}>
                Отказ
              </button>
              <button className="btn btn-error" onClick={handleDeleteChild}>
                Изтрий
              </button>
            </div>
          </div>
        </div>
      )}

      {playingItem && (
        <div className="modal-overlay" onClick={() => setPlayingItem(null)}>
          <div
            className="modal-content"
            style={{
              maxWidth: "min(800px, 95vw)",
              maxHeight: "90vh",
              textAlign: "left",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: "12px", flexShrink: 0 }}>
              <strong style={{ fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "12px" }}>
                {playingItem.displayName || playingItem.mediaFile.displayName}
              </strong>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 12px", fontSize: "12px", flexShrink: 0 }}
                onClick={() => setPlayingItem(null)}
              >
                Затвори
              </button>
            </div>
            {playingItem.mediaFile.mimeType.startsWith("audio/") ? (
              <audio
                key={playingItem.mediaFile.id}
                controls
                autoPlay
                style={{ width: "100%" }}
              >
                <source
                  src={`/api/admin/media/${playingItem.mediaFile.id}/stream`}
                  type={playingItem.mediaFile.mimeType}
                />
              </audio>
            ) : (
              <video
                key={playingItem.mediaFile.id}
                controls
                autoPlay
                style={{ width: "100%", borderRadius: "8px", background: "#000", display: "block", maxHeight: "calc(90vh - 70px)", objectFit: "contain" }}
              >
                <source
                  src={`/api/admin/media/${playingItem.mediaFile.id}/stream`}
                  type="video/mp4"
                />
              </video>
            )}
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
