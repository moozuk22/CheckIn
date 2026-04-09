"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Folder {
  id: string;
  name: string;
  createdAt: string;
  _count: { children: number; items: number };
}

export default function MediaLibraryPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [isAdminRole, setIsAdminRole] = useState(false);
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

  const handleBack = () => {
    if (isAdminRole || !memberReturnCardCode) {
      router.push("/admin/members");
      return;
    }
    router.push(`/member/${memberReturnCardCode}`);
  };

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
        {isAdminRole && (<button onClick={() => router.push("/admin/audit")} className="btn btn-secondary">
          Одитен дневник
        </button>)}
        {(isAdminRole || memberReturnCardCode) && (<button onClick={handleBack} className="btn btn-secondary">
          Назад
        </button>)}
      </div>

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
                {isAdminRole && (
                  <button
                    className="btn btn-error"
                    style={{ padding: "4px 10px", fontSize: "11px" }}
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
