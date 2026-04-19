"use client";

import { useState, useEffect, useRef } from "react";

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  sentAt: string;
}

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("bg-BG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function AdminNotificationBell() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [lastOpened, setLastOpened] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("adminNotificationsLastOpened") ?? "0");
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { notifications: AdminNotification[] };
        setNotifications(data.notifications);
      }
    } catch {
      // silently ignore fetch errors
    }
  };

  useEffect(() => {
    void fetchNotifications();

    const es = new EventSource("/api/admin/notifications/stream");
    es.addEventListener("notification-created", () => {
      void fetchNotifications();
    });

    return () => es.close();
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (isOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  const unreadCount = notifications.filter(
    (n) => new Date(n.sentAt).getTime() > lastOpened
  ).length;

  return (
    <div ref={dropdownRef} style={{ position: "absolute", top: "24px", right: "24px" }}>
      <button
        type="button"
        onClick={() =>
          setIsOpen((prev) => {
            if (!prev) {
              const now = Date.now();
              localStorage.setItem("adminNotificationsLastOpened", String(now));
              setLastOpened(now);
            }
            return !prev;
          })
        }
        aria-label="Toggle notifications"
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "999px",
          padding: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          border: "none",
          background: "var(--accent-gold-color)",
          color: "#fff",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 4.5C9.51472 4.5 7.5 6.51472 7.5 9V12.2143C7.5 13.1375 7.18026 14.0322 6.59512 14.7462L5.5 16.0833H18.5L17.4049 14.7462C16.8197 14.0322 16.5 13.1375 16.5 12.2143V9C16.5 6.51472 14.4853 4.5 12 4.5Z"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="18" r="1.2" fill="#FFFFFF" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-3px",
              right: "-3px",
              minWidth: "18px",
              height: "18px",
              borderRadius: "999px",
              background: "#ef4444",
              color: "#fff",
              fontSize: "10px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              border: "1px solid rgba(0,0,0,0.25)",
            }}
          >
            {Math.min(unreadCount, 99)}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "50px",
            right: 0,
            width: "320px",
            maxHeight: "300px",
            overflow: "auto",
            zIndex: 50,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            padding: "12px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "10px",
              color: "var(--accent-gold-color)",
            }}
          >
            Последни известия
          </div>
          {notifications.length > 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "8px",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: "13px" }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.95 }}>{n.body}</div>
                  <div style={{ fontSize: "10px", opacity: 0.75, marginTop: "6px" }}>
                    {formatNotificationTime(n.sentAt)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "12px", opacity: 0.75 }}>Няма скорошни известия</div>
          )}
        </div>
      )}
    </div>
  );
}
