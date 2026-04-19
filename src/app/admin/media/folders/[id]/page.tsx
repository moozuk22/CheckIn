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
  _count: { children: number; items: number; videos: number; images: number; audios: number };
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
    cloudinaryUrl: string | null;
  };
}

interface BrowserFolder {
  id: string;
  name: string;
  _count: { children: number; items: number; videos: number; images: number; audios: number };
}

interface BrowserItem {
  id: string;
  mediaFile: {
    id: string;
    displayName: string;
    status: string;
  };
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
  const [selectedFileId, setSelectedFileId] = useState("");
  const [browserChildren, setBrowserChildren] = useState<BrowserFolder[]>([]);
  const [browserItems, setBrowserItems] = useState<BrowserItem[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserBreadcrumb, setBrowserBreadcrumb] = useState<{ id: string | null; name: string }[]>([]);
  const [showRename, setShowRename] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [editingMedia, setEditingMedia] = useState<FolderItemEntry | null>(null);
  const [editMediaName, setEditMediaName] = useState("");
  const [deletingItem, setDeletingItem] = useState<FolderItemEntry | null>(null);
  const [deletingChild, setDeletingChild] = useState<ChildFolder | null>(null);
  const [deletingCurrentFolder, setDeletingCurrentFolder] = useState(false);
  const [playingItem, setPlayingItem] = useState<FolderItemEntry | null>(null);
  const [viewingImage, setViewingImage] = useState<FolderItemEntry | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);

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

  useEffect(() => {
    setSelectedItemIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(
        items
          .filter((entry) => entry.mediaFile.status === "READY")
          .map((entry) => entry.id)
      );
      const next = new Set(Array.from(prev).filter((entryId) => validIds.has(entryId)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

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

  const navigateBrowserFolder = useCallback(async (folderId: string | null) => {
    setBrowserLoading(true);
    try {
      if (folderId === null) {
        const res = await fetch("/api/admin/folders");
        if (!res.ok) return;
        const data = await res.json();
        setBrowserChildren(data.folders ?? []);
        setBrowserItems([]);
        return;
      }

      const res = await fetch(`/api/admin/folders/${folderId}`);
      if (!res.ok) return;
      const data = await res.json();
      setBrowserChildren(data.children ?? []);
      setBrowserItems(data.items ?? []);
    } catch {
      setBrowserChildren([]);
      setBrowserItems([]);
    } finally {
      setBrowserLoading(false);
    }
  }, []);

  const openAddVideo = () => {
    setShowAddVideo(true);
    setSelectedFileId("");
    setBrowserChildren([]);
    setBrowserItems([]);
    setBrowserBreadcrumb([{ id: null, name: "Библиотека" }]);
    void navigateBrowserFolder(null);
  };

  const enterBrowserFolder = (child: BrowserFolder) => {
    setBrowserBreadcrumb((prev) => [...prev, { id: child.id, name: child.name }]);
    void navigateBrowserFolder(child.id);
  };

  const navigateToBrowserCrumb = (entry: { id: string | null; name: string }, index: number) => {
    setBrowserBreadcrumb((prev) => prev.slice(0, index + 1));
    void navigateBrowserFolder(entry.id);
  };

  const currentFolderMediaIds = new Set(items.map((item) => item.mediaFile.id));
  const addableReadyItems = browserItems.filter(
    (entry) => entry.mediaFile.status === "READY" && !currentFolderMediaIds.has(entry.mediaFile.id)
  );

  useEffect(() => {
    if (!selectedFileId) return;
    const selectedStillVisible = addableReadyItems.some((entry) => entry.mediaFile.id === selectedFileId);
    if (!selectedStillVisible) setSelectedFileId("");
  }, [addableReadyItems, selectedFileId]);

  const readyItems = items.filter((item) => item.mediaFile.status === "READY");
  const selectedReadyItems = readyItems.filter((item) => selectedItemIds.has(item.id));
  const allReadyItemsSelected =
    readyItems.length > 0 && selectedReadyItems.length === readyItems.length;

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAllReady = () => {
    if (allReadyItemsSelected) {
      setSelectedItemIds(new Set());
      return;
    }
    setSelectedItemIds(new Set(readyItems.map((item) => item.id)));
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

  const handleDownloadSelected = async () => {
    if (selectedReadyItems.length === 0 || bulkDownloading) return;
    setBulkDownloading(true);
    try {
      for (const item of selectedReadyItems) {
        triggerFileDownload(item.mediaFile.id, item.mediaFile.originalName || item.mediaFile.displayName);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      }
    } finally {
      setBulkDownloading(false);
    }
  };

  const getMediaIcon = (item: FolderItemEntry) => {
    const { mimeType, cloudinaryUrl } = item.mediaFile;
    if (mimeType.startsWith("video/")) return "▶";
    if (mimeType.startsWith("audio/")) return "♪";
    if (mimeType.startsWith("image/") && cloudinaryUrl) {
      return (
        <img
          src={cloudinaryUrl}
          alt=""
          style={{
            width: "36px",
            height: "36px",
            objectFit: "cover",
            borderRadius: "6px",
            display: "block",
          }}
        />
      );
    }
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
                        {formatFolderMeta(child._count)}
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
                <div className="fd-media-bulk-actions">
                  <button
                    className="fd-btn fd-btn-ghost fd-btn-sm"
                    onClick={toggleSelectAllReady}
                    disabled={readyItems.length === 0 || bulkDownloading}
                  >
                    {allReadyItemsSelected ? "Размаркирай всички" : "Маркирай всички"}
                  </button>
                  <button
                    className="fd-btn fd-btn-secondary fd-btn-sm"
                    onClick={handleDownloadSelected}
                    disabled={selectedReadyItems.length === 0 || bulkDownloading}
                  >
                    {bulkDownloading
                      ? "Сваляне..."
                      : `Свали избрани (${selectedReadyItems.length})`}
                  </button>
                </div>
              </div>
              <div className="fd-media-list">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`fd-media-item ${selectedItemIds.has(item.id) ? "fd-media-item-selected" : ""}`}
                  >
                    <div className="fd-media-row">
                      <div className="fd-media-select">
                        {item.mediaFile.status === "READY" ? (
                          <input
                            type="checkbox"
                            className="fd-media-checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            aria-label={`Select ${item.displayName || item.mediaFile.displayName}`}
                          />
                        ) : (
                          <span className="fd-media-select-placeholder" aria-hidden="true" />
                        )}
                      </div>
                      <div className="fd-media-icon">
                        {getMediaIcon(item)}
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
                        {item.mediaFile.status === "READY" && !item.mediaFile.mimeType.startsWith("image/") && (
                          <button
                            className="fd-btn fd-btn-primary fd-btn-sm"
                            onClick={() => setPlayingItem(item)}
                          >
                            ▶ Пусни
                          </button>
                        )}
                        {item.mediaFile.status === "READY" && item.mediaFile.mimeType.startsWith("image/") && item.mediaFile.cloudinaryUrl && (
                          <button
                            className="fd-btn fd-btn-secondary fd-btn-sm"
                            onClick={() => setViewingImage(item)}
                          >
                            🔍 Преглед
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
            <div
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                overflow: "hidden",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "8px 12px",
                  background: "var(--bg-secondary, rgba(255,255,255,0.04))",
                  borderBottom: "1px solid var(--border-color)",
                  flexWrap: "wrap",
                  fontSize: "0.82rem",
                }}
              >
                {browserBreadcrumb.map((entry, index) => (
                  <span key={`${entry.id ?? "root"}-${index}`} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {index > 0 && <span className="text-muted">/</span>}
                    <button
                      onClick={() => navigateToBrowserCrumb(entry, index)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: "0 2px",
                        cursor: index < browserBreadcrumb.length - 1 ? "pointer" : "default",
                        color: index < browserBreadcrumb.length - 1 ? "var(--accent-gold-color)" : "inherit",
                        fontWeight: index === browserBreadcrumb.length - 1 ? 600 : 400,
                        fontSize: "inherit",
                      }}
                    >
                      {entry.name}
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ maxHeight: "320px", overflowY: "auto" }}>
                {browserLoading ? (
                  <div className="flex justify-center" style={{ padding: "24px" }}>
                    <div className="loading" />
                  </div>
                ) : (
                  <>
                    {browserChildren.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => enterBrowserFolder(child)}
                        className="folder-card fd-browser-folder-card"
                      >
                        <div className="fd-browser-folder-content">
                          <strong>{child.name}</strong>
                          <span className="text-muted fd-browser-folder-meta">
                            {formatFolderMeta(child._count)}
                          </span>
                        </div>
                        <span className="text-muted fd-browser-folder-arrow">›</span>
                      </div>
                    ))}
                    {addableReadyItems.map((entry) => (
                      <label
                        key={entry.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-color)",
                          background: selectedFileId === entry.mediaFile.id ? "rgba(212, 175, 55, 0.08)" : "transparent",
                        }}
                      >
                        <input
                          type="radio"
                          checked={selectedFileId === entry.mediaFile.id}
                          onChange={() => setSelectedFileId(entry.mediaFile.id)}
                          style={{ width: "auto", marginRight: "12px" }}
                        />
                        <span style={{ fontSize: "0.9rem" }}>{entry.mediaFile.displayName}</span>
                      </label>
                    ))}
                    {browserChildren.length === 0 && addableReadyItems.length === 0 && (
                      <p className="text-muted" style={{ padding: "16px", textAlign: "center", fontSize: "0.85rem" }}>
                        Няма READY файлове за добавяне в тази папка.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
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

      {/* Modal: View image */}
      {viewingImage && (
        <div className="fd-overlay" onClick={() => setViewingImage(null)}>
          <div
            className="fd-modal fd-modal-video"
            style={{ padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fd-video-header">
              <span className="fd-video-title">
                {viewingImage.displayName || viewingImage.mediaFile.displayName}
              </span>
              <button className="fd-btn fd-btn-ghost fd-btn-sm" onClick={() => setViewingImage(null)}>
                ✕ Затвори
              </button>
            </div>
            <img
              src={viewingImage.mediaFile.cloudinaryUrl!}
              alt={viewingImage.mediaFile.displayName}
              style={{
                width: "100%",
                borderRadius: "8px",
                display: "block",
                maxHeight: "calc(90vh - 80px)",
                objectFit: "contain",
              }}
            />
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
