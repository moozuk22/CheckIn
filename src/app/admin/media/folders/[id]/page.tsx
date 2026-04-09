"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import "./page.css";

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
  const [isAdminRole, setIsAdminRole] = useState(false);

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

  useEffect(() => { fetchFolder(); }, [fetchFolder]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/check-session", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setIsAdminRole(data.role === "ADMIN");
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreateSubfolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/admin/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: id }),
      });
      if (res.ok) { setShowNewFolder(false); setNewFolderName(""); fetchFolder(); }
    } catch { alert("Грешка при създаване на папка."); }
  };

  const handleAddVideo = async () => {
    if (!selectedFileId) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaFileId: selectedFileId }),
      });
      if (res.ok) { setShowAddVideo(false); setSelectedFileId(""); fetchFolder(); }
      else { const data = await res.json(); alert(data.error || "Грешка при добавяне."); }
    } catch { alert("Грешка при добавяне на видео."); }
  };

  const handleRemoveItem = async () => {
    if (!deletingItem) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}/items/${deletingItem.id}`, { method: "DELETE" });
      if (res.ok) { setItems((prev) => prev.filter((i) => i.id !== deletingItem.id)); setDeletingItem(null); }
    } catch { alert("Грешка при изтриване."); }
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
            i.id === item.id ? { ...i, mediaFile: { ...i.mediaFile, isVisible: !i.mediaFile.isVisible } } : i
          )
        );
      }
    } catch { alert("Грешка при промяна на видимостта."); }
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
            i.id === editingMedia.id ? { ...i, mediaFile: { ...i.mediaFile, displayName: editMediaName.trim() } } : i
          )
        );
        setEditingMedia(null);
      }
    } catch { alert("Грешка при преименуване."); }
  };

  const handleDeleteChild = async () => {
    if (!deletingChild) return;
    try {
      const res = await fetch(`/api/admin/folders/${deletingChild.id}`, { method: "DELETE" });
      if (res.ok) { setChildren((prev) => prev.filter((c) => c.id !== deletingChild.id)); setDeletingChild(null); }
    } catch { alert("Грешка при изтриване на папка."); }
  };

  const handleRename = async () => {
    if (!renameName.trim()) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (res.ok) { setFolder((prev) => (prev ? { ...prev, name: renameName.trim() } : prev)); setShowRename(false); }
    } catch { alert("Грешка при преименуване."); }
  };

  const handleCopyFolder = async () => {
    try {
      const res = await fetch(`/api/admin/folders/${id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetParentId: folder?.parentId ?? null }),
      });
      if (res.ok) { const data = await res.json(); router.push(`/admin/media/folders/${data.id}`); }
    } catch { alert("Грешка при копиране."); }
  };

  const handleDeleteCurrentFolder = async () => {
    if (!folder) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push(folder.parentId ? `/admin/media/folders/${folder.parentId}` : "/admin/media");
      } else {
        const data = await res.json();
        alert(data.error || "Грешка при изтриване на папка.");
      }
    } catch { alert("Грешка при изтриване на папка."); }
    finally { setDeletingCurrentFolder(false); }
  };

  const openAddVideo = async () => {
    setShowAddVideo(true);
    try {
      const res = await fetch("/api/admin/media?limit=100&status=READY");
      if (res.ok) { const data = await res.json(); setAllFiles(data.files); }
    } catch {}
  };

  const getMediaIcon = (mimeType: string) => {
    if (mimeType.startsWith("video/")) return "▶";
    if (mimeType.startsWith("audio/")) return "♪";
    if (mimeType.startsWith("image/")) return "◼";
    return "◻";
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      READY: { cls: "fd-badge fd-badge-ready", label: "Готово" },
      PROCESSING: { cls: "fd-badge fd-badge-processing", label: "Обработка" },
      UPLOADING: { cls: "fd-badge fd-badge-uploading", label: "Качване" },
      FAILED: { cls: "fd-badge fd-badge-failed", label: "Неуспешно" },
    };
    const s = map[status] ?? { cls: "fd-badge", label: status };
    return <span className={s.cls}>{s.label}</span>;
  };

  if (loading) {
    return (
      <div className="fd-root">
        <div className="fd-container">
          <div className="fd-loading"><div className="fd-spinner" /></div>
        </div>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="fd-root">
        <div className="fd-container">
          <div className="fd-empty">
            <div className="fd-empty-icon">📁</div>
            <p className="fd-empty-text">Папката не е намерена</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fd-root">
        <div className="fd-container">

          {/* Back Button */}
          <div style={{ marginBottom: "28px" }}>
            <button
              className="fd-btn fd-btn-secondary shadow-sm"
              onClick={() => {
                const target = folder.parentId ? `/admin/media/folders/${folder.parentId}` : "/admin/media";
                router.push(target);
              }}
              style={{ padding: "8px 20px" }}
            >
              ← Назад
            </button>
          </div>

          {/* Header */}
          <div className="fd-header">
            <h1 className="fd-title">
              <span className="fd-title-icon">📁</span>
              {folder.name}
            </h1>
          </div>

          {/* Actions */}
          <div className="fd-actions">
            <button className="fd-btn fd-btn-primary" onClick={() => setShowNewFolder(true)}>
              + Нова подпапка
            </button>
            <button className="fd-btn fd-btn-primary" onClick={() => router.push(`/admin/media/upload?folderId=${id}`)}>
              ↑ Качи медия
            </button>
            <button className="fd-btn fd-btn-secondary" onClick={openAddVideo}>
              + Добави медия
            </button>
            <button className="fd-btn fd-btn-ghost" onClick={() => { setRenameName(folder.name); setShowRename(true); }}>
              ✎ Преименувай
            </button>
            <button className="fd-btn fd-btn-ghost" onClick={handleCopyFolder}>
              ⊕ Копирай
            </button>
            {isAdminRole && (
              <button className="fd-btn fd-btn-danger" onClick={() => setDeletingCurrentFolder(true)}>
                ✕ Изтрий папка
              </button>
            )}
          </div>

          {/* Subfolders */}
          {children.length > 0 && (
            <div className="fd-section">
              <div className="fd-section-header">
                <span className="fd-section-title">Подпапки</span>
                <span className="fd-section-count">{children.length}</span>
                <div className="fd-section-line" />
              </div>
              <div className="fd-folder-grid">
                {children.map((child) => (
                  <div
                    key={child.id}
                    className="fd-folder-card"
                    onClick={() => router.push(`/admin/media/folders/${child.id}`)}
                  >
                    <div className="fd-folder-icon">📁</div>
                    <div className="fd-folder-info">
                      <div className="fd-folder-name">{child.name}</div>
                      <div className="fd-folder-meta">
                        {child._count.items} файла · {child._count.children} подпапки
                      </div>
                    </div>
                    {isAdminRole && (
                      <button
                        className="fd-btn fd-btn-danger fd-btn-sm fd-folder-delete"
                        onClick={(e) => { e.stopPropagation(); setDeletingChild(child); }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media items */}
          {items.length > 0 ? (
            <div className="fd-section">
              <div className="fd-section-header">
                <span className="fd-section-title">Медия</span>
                <span className="fd-section-count">{items.length}</span>
                <div className="fd-section-line" />
              </div>
              <div className="fd-media-list">
                {items.map((item) => (
                  <div key={item.id} className="fd-media-item">
                    <div className="fd-media-row">
                      <div className="fd-media-icon">
                        {getMediaIcon(item.mediaFile.mimeType)}
                      </div>
                      <div className="fd-media-body">
                        <div className="fd-media-name-row">
                          <span className="fd-media-name" title={item.displayName || item.mediaFile.displayName}>
                            {item.displayName || item.mediaFile.displayName}
                          </span>
                          {getStatusBadge(item.mediaFile.status)}
                          <span
                            className={`fd-badge ${item.mediaFile.isVisible ? "fd-badge-visible" : "fd-badge-hidden"}`}
                            onClick={() => handleToggleVisibility(item)}
                          >
                            {item.mediaFile.isVisible ? "● Видимо" : "○ Скрито"}
                          </span>
                        </div>
                        <div className="fd-media-meta">
                          {formatSize(item.mediaFile.sizeBytes)}
                          {item.mediaFile.durationSecs ? ` · ${formatDuration(item.mediaFile.durationSecs)}` : ""}
                          {` · ${new Date(item.mediaFile.createdAt).toLocaleDateString("bg-BG")}`}
                          {item.mediaFile.references > 0 ? ` · ${item.mediaFile.references} реф.` : ""}
                        </div>
                      </div>
                      <div className="fd-media-actions">
                        {item.mediaFile.status === "READY" && (
                          <button
                            className="fd-btn fd-btn-primary fd-btn-sm"
                            onClick={() => setPlayingItem(item)}
                          >
                            ▶ Пусни
                          </button>
                        )}
                        {item.mediaFile.status === "READY" && (
                          <a
                            href={`/api/admin/media/${item.mediaFile.id}/stream`}
                            download={item.mediaFile.originalName}
                            className="fd-btn fd-btn-secondary fd-btn-sm"
                          >
                            ↓ Свали
                          </a>
                        )}
                        <button
                          className="fd-btn fd-btn-ghost fd-btn-sm"
                          onClick={() => { setEditingMedia(item); setEditMediaName(item.mediaFile.displayName); }}
                        >
                          ✎
                        </button>
                        {isAdminRole && (
                          <button
                            className="fd-btn fd-btn-danger fd-btn-sm"
                            onClick={() => setDeletingItem(item)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            children.length === 0 && (
              <div className="fd-empty">
                <div className="fd-empty-icon">📂</div>
                <p className="fd-empty-text">Празна папка</p>
              </div>
            )
          )}

        </div>
      </div>

      {/* Modal: New subfolder */}
      {showNewFolder && (
        <div className="fd-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Нова подпапка</h3>
            <input
              type="text"
              className="fd-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Ime na papkata..."
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubfolder()}
              autoFocus
            />
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setShowNewFolder(false)}>Отказ</button>
              <button className="fd-btn fd-btn-primary" onClick={handleCreateSubfolder}>Създай</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add video */}
      {showAddVideo && (
        <div className="fd-overlay" onClick={() => setShowAddVideo(false)}>
          <div className="fd-modal fd-modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Добави медия</h3>
            <select
              className="fd-select"
              value={selectedFileId}
              onChange={(e) => setSelectedFileId(e.target.value)}
            >
              <option value="">Избери медия...</option>
              {allFiles.map((f) => (
                <option key={f.id} value={f.id}>{f.displayName}</option>
              ))}
            </select>
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setShowAddVideo(false)}>Отказ</button>
              <button className="fd-btn fd-btn-primary" onClick={handleAddVideo} disabled={!selectedFileId}>Добави</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rename folder */}
      {showRename && (
        <div className="fd-overlay" onClick={() => setShowRename(false)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Преименувай папка</h3>
            <input
              type="text"
              className="fd-input"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setShowRename(false)}>Отказ</button>
              <button className="fd-btn fd-btn-primary" onClick={handleRename}>Запази</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rename media */}
      {editingMedia && (
        <div className="fd-overlay" onClick={() => setEditingMedia(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Преименувай медия</h3>
            <input
              type="text"
              className="fd-input"
              value={editMediaName}
              onChange={(e) => setEditMediaName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameMedia()}
              autoFocus
            />
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setEditingMedia(null)}>Отказ</button>
              <button className="fd-btn fd-btn-primary" onClick={handleRenameMedia}>Запази</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete media item */}
      {deletingItem && (
        <div className="fd-overlay" onClick={() => setDeletingItem(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Потвърждение за изтриване</h3>
            <p className="fd-modal-body">
              Изтриване на <strong style={{ color: "#e8e0d0" }}>{deletingItem.displayName || deletingItem.mediaFile.displayName}</strong>?
            </p>
            <div className="fd-modal-note">
              {deletingItem.mediaFile.references > 1
                ? "Файлът е в повече от една папка. Ще бъде премахната само текущата референция."
                : "Файлът е само в тази папка. Ще бъде изтрит от диска и от базата."}
            </div>
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setDeletingItem(null)}>Отказ</button>
              {isAdminRole && (
                <button className="fd-btn fd-btn-danger" onClick={handleRemoveItem}>Изтрий</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete current folder */}
      {deletingCurrentFolder && (
        <div className="fd-overlay" onClick={() => setDeletingCurrentFolder(false)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Потвърждение за изтриване</h3>
            <p className="fd-modal-body">
              Изтриване на папка <strong style={{ color: "#e8e0d0" }}>{folder.name}</strong>?
            </p>
            <div className="fd-modal-note">
              Всички подпапки и референции ще бъдат премахнати. Физическите файлове няма да бъдат изтрити.
            </div>
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setDeletingCurrentFolder(false)}>Отказ</button>
              {isAdminRole && (
                <button className="fd-btn fd-btn-danger" onClick={handleDeleteCurrentFolder}>Изтрий</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete child folder */}
      {deletingChild && (
        <div className="fd-overlay" onClick={() => setDeletingChild(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fd-modal-title">Потвърждение за изтриване</h3>
            <p className="fd-modal-body">
              Изтриване на папка <strong style={{ color: "#e8e0d0" }}>{deletingChild.name}</strong>?
            </p>
            <div className="fd-modal-note">
              Всички подпапки и референции ще бъдат премахнати. Физическите файлове няма да бъдат изтрити.
            </div>
            <div className="fd-modal-actions">
              <button className="fd-btn fd-btn-ghost" onClick={() => setDeletingChild(null)}>Отказ</button>
              {isAdminRole && (
                <button className="fd-btn fd-btn-danger" onClick={handleDeleteChild}>Изтрий</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Play media */}
      {playingItem && (
        <div className="fd-overlay" onClick={() => setPlayingItem(null)}>
          <div
            className="fd-modal fd-modal-video"
            style={{ padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fd-video-header">
              <span className="fd-video-title">
                {playingItem.displayName || playingItem.mediaFile.displayName}
              </span>
              <button className="fd-btn fd-btn-ghost fd-btn-sm" onClick={() => setPlayingItem(null)}>
                ✕ Затвори
              </button>
            </div>
            {playingItem.mediaFile.mimeType.startsWith("audio/") ? (
              <audio
                key={playingItem.mediaFile.id}
                controls
                autoPlay
                style={{ width: "100%", borderRadius: "8px" }}
              >
                <source src={`/api/admin/media/${playingItem.mediaFile.id}/stream`} type={playingItem.mediaFile.mimeType} />
              </audio>
            ) : (
              <video
                key={playingItem.mediaFile.id}
                controls
                autoPlay
                style={{
                  width: "100%",
                  borderRadius: "8px",
                  background: "#000",
                  display: "block",
                  maxHeight: "calc(90vh - 80px)",
                  objectFit: "contain",
                }}
              >
                <source src={`/api/admin/media/${playingItem.mediaFile.id}/stream`} type="video/mp4" />
              </video>
            )}
          </div>
        </div>
      )}
    </>
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