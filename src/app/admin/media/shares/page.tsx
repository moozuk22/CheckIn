"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ShareLink {
  id: string;
  token: string;
  name: string | null;
  expiresAt: string;
  createdAt: string;
  accessCount: number;
  videoCount: number;
  publicUrl: string;
  isExpired: boolean;
}

interface BrowserFolder {
  id: string;
  name: string;
  _count: { children: number; items: number };
}

interface BrowserItem {
  id: string;
  mediaFile: {
    id: string;
    displayName: string;
    status: string;
  };
}

export default function SharesPage() {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [shareName, setShareName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingShare, setDeletingShare] = useState<ShareLink | null>(null);

  // Folder browser state
  const [browserChildren, setBrowserChildren] = useState<BrowserFolder[]>([]);
  const [browserItems, setBrowserItems] = useState<BrowserItem[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserBreadcrumb, setBrowserBreadcrumb] = useState<{ id: string | null; name: string }[]>([]);

  const router = useRouter();

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shares");
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares);
      }
    } catch (err) {
      console.error("Error fetching shares:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const navigateToFolder = useCallback(async (folderId: string | null) => {
    setBrowserLoading(true);
    try {
      if (folderId === null) {
        const res = await fetch("/api/admin/folders");
        if (res.ok) {
          const data = await res.json();
          setBrowserChildren(data.folders);
          setBrowserItems([]);
        }
      } else {
        const res = await fetch(`/api/admin/folders/${folderId}`);
        if (res.ok) {
          const data = await res.json();
          setBrowserChildren(data.children);
          setBrowserItems(data.items);
        }
      }
    } catch {
      // Ignore
    } finally {
      setBrowserLoading(false);
    }
  }, []);

  const openCreate = () => {
    setShowCreate(true);
    setSelected(new Map());
    setShareName("");
    setBrowserBreadcrumb([{ id: null, name: "Библиотека" }]);
    navigateToFolder(null);
  };

  const enterFolder = (child: BrowserFolder) => {
    setBrowserBreadcrumb((prev) => [...prev, { id: child.id, name: child.name }]);
    navigateToFolder(child.id);
  };

  const navigateTo = (entry: { id: string | null; name: string }, index: number) => {
    setBrowserBreadcrumb((prev) => prev.slice(0, index + 1));
    navigateToFolder(entry.id);
  };

  const toggleFile = (id: string, name: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  };

  const handleCreate = async () => {
    if (selected.size === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: shareName.trim() || null,
          mediaFileIds: Array.from(selected.keys()),
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        fetchShares();
      } else {
        const data = await res.json();
        alert(data.error || "Грешка при създаване на линк.");
      }
    } catch {
      alert("Грешка при създаване на линк.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingShare) return;
    try {
      const res = await fetch(`/api/admin/shares/${deletingShare.id}`, { method: "DELETE" });
      if (res.ok) {
        setShares(shares.filter((s) => s.id !== deletingShare.id));
        setDeletingShare(null);
      }
    } catch {
      alert("Грешка при деактивиране.");
    }
  };

  const copyUrl = async (share: ShareLink) => {
    try {
      await navigator.clipboard.writeText(share.publicUrl);
      setCopiedId(share.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      prompt("Копирайте линка:", share.publicUrl);
    }
  };

  const readyItems = browserItems.filter((item) => item.mediaFile.status === "READY");
  const hasContent = browserChildren.length > 0 || readyItems.length > 0;

  return (
    <div className="container p-6 fade-in">
      <div className="flex-col flex items-center text-center mb-8">
        <h1 className="text-gold mb-2" style={{ fontSize: "2rem", fontWeight: "600" }}>
          Споделени линкове
        </h1>
      </div>

      <div className="flex justify-center gap-4 mb-8">
        <button className="btn btn-primary" onClick={openCreate}>
          Създай линк за споделяне
        </button>
        <button onClick={() => router.push("/admin/media")} className="btn btn-secondary">
          Назад
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center mt-8">
          <div className="loading" />
        </div>
      ) : shares.length === 0 ? (
        <p className="text-muted" style={{ textAlign: "center" }}>
          Няма създадени линкове
        </p>
      ) : (
        <div className="grid grid-cols-1" style={{ gap: "12px" }}>
          {shares.map((share) => (
            <div key={share.id} className="card" style={{ padding: "16px" }}>
              <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <div className="flex items-center gap-3">
                    <strong>{share.name || "Без име"}</strong>
                    <span
                      className="badge"
                      style={{
                        background: share.isExpired ? "var(--error)" : "var(--success)",
                        color: "#000",
                        fontSize: "0.7rem",
                      }}
                    >
                      {share.isExpired ? "Изтекъл" : "Активен"}
                    </span>
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                    {share.videoCount} видеа ·{" "}
                    Създаден: {new Date(share.createdAt).toLocaleDateString("bg-BG")} ·{" "}
                    Изтича: {new Date(share.expiresAt).toLocaleDateString("bg-BG")} ·{" "}
                    Достъпвания: {share.accessCount}
                  </div>
                </div>
                <div className="flex gap-3">
                  {!share.isExpired && (
                    <button
                      className="btn btn-primary"
                      style={{ padding: "6px 12px", fontSize: "12px" }}
                      onClick={() => copyUrl(share)}
                    >
                      {copiedId === share.id ? "Копирано!" : "Копирай линк"}
                    </button>
                  )}
                  <button
                    className="btn btn-error"
                    style={{ padding: "6px 12px", fontSize: "12px" }}
                    onClick={() => setDeletingShare(share)}
                  >
                    Деактивирай
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create share modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => !creating && setShowCreate(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "580px", maxHeight: "90vh", display: "flex", flexDirection: "column", textAlign: "left", padding: "24px" }}
          >
            <h3 style={{ marginBottom: "8px", textAlign: "center" }}>Създай линк за споделяне</h3>
            <p className="text-muted" style={{ marginBottom: "16px", fontSize: "0.85rem", textAlign: "center" }}>
              Линкът изтича след 7 дни
            </p>
            <input
              type="text"
              placeholder="Име на линка (незадължително)"
              value={shareName}
              onChange={(e) => setShareName(e.target.value)}
              style={{ marginBottom: "16px" }}
            />
            <p style={{ marginBottom: "8px", fontSize: "0.9rem" }}>
              Избери видеа:
            </p>

            {/* Folder browser panel */}
            <div
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                overflow: "hidden",
                marginBottom: "12px",
                flexShrink: 0,
              }}
            >
              {/* Breadcrumb */}
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
                  <span key={index} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {index > 0 && <span className="text-muted">/</span>}
                    <button
                      onClick={() => navigateTo(entry, index)}
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

              {/* Content */}
              <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                {browserLoading ? (
                  <div className="flex justify-center" style={{ padding: "24px" }}>
                    <div className="loading" />
                  </div>
                ) : !hasContent ? (
                  <p className="text-muted" style={{ padding: "16px", textAlign: "center", fontSize: "0.85rem" }}>
                    Няма видеа в тази папка
                  </p>
                ) : (
                  <>
                    {browserChildren.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => enterFolder(child)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-color)",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>📁</span>
                          <span style={{ fontSize: "0.9rem" }}>{child.name}</span>
                          <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                            {child._count.items} видеа
                            {child._count.children > 0 ? ` · ${child._count.children} подпапки` : ""}
                          </span>
                        </span>
                        <span className="text-muted" style={{ fontSize: "0.8rem" }}>›</span>
                      </div>
                    ))}
                    {readyItems.map((item) => (
                      <label
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-color)",
                          background: selected.has(item.mediaFile.id)
                            ? "rgba(212, 175, 55, 0.08)"
                            : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(item.mediaFile.id)}
                          onChange={() => toggleFile(item.mediaFile.id, item.mediaFile.displayName)}
                          style={{ width: "auto", marginRight: "12px" }}
                        />
                        <span style={{ fontSize: "0.9rem" }}>{item.mediaFile.displayName}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Selected summary */}
            {selected.size > 0 && (
              <p style={{ marginBottom: "12px", fontSize: "0.85rem", color: "var(--accent-gold-color)" }}>
                Избрани: {selected.size} видеа
              </p>
            )}

            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>
                Отказ
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating || selected.size === 0}
              >
                {creating ? "Създаване..." : `Създай (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingShare && (
        <div className="modal-overlay" onClick={() => setDeletingShare(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "16px" }}>Потвърждение</h3>
            <p style={{ marginBottom: "24px" }}>
              Деактивиране на линк <strong>{deletingShare.name || "без име"}</strong>?
            </p>
            <p className="text-muted" style={{ marginBottom: "24px", fontSize: "0.85rem" }}>
              Линкът ще стане неактивен. Видеата няма да бъдат изтрити.
            </p>
            <div className="flex justify-center gap-4">
              <button className="btn btn-secondary" onClick={() => setDeletingShare(null)}>
                Отказ
              </button>
              <button className="btn btn-error" onClick={handleDelete}>
                Деактивирай
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
