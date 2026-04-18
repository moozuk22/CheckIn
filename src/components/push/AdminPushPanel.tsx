"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(normalized);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}

async function registerServiceWorker() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function AdminPushPanel() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supported =
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);
    if (!supported) return;

    let cancelled = false;
    registerServiceWorker().then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (!cancelled) setIsSubscribed(Boolean(sub));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, []);

  const handleEnable = async () => {
    setMessage("");
    setIsBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Разрешението беше отказано.");
        return;
      }

      const reg = await registerServiceWorker();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyRes = await fetch("/api/push/public-key", { cache: "no-store" });
        const { publicKey } = await keyRes.json() as { publicKey: string };
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const res = await fetch("/api/admin/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("Грешка при запазване.");

      setIsSubscribed(true);
      setMessage("Известията са активирани.");
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "Грешка при активиране.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisable = async () => {
    setMessage("");
    setIsBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/admin/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setIsSubscribed(false);
      setMessage("Известията са изключени.");
    } catch (err) {
      console.error(err);
      setMessage("Грешка при изключване.");
    } finally {
      setIsBusy(false);
    }
  };

  if (!isSupported) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "10px 14px", borderRadius: "8px",
      background: isSubscribed ? "rgba(50,205,50,0.08)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${isSubscribed ? "rgba(50,205,50,0.3)" : "rgba(255,255,255,0.1)"}`,
      marginBottom: "16px",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isSubscribed ? "#9eff9e" : "rgba(255,255,255,0.5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4.5C9.51472 4.5 7.5 6.51472 7.5 9V12.2143C7.5 13.1375 7.18026 14.0322 6.59512 14.7462L5.5 16.0833H18.5L17.4049 14.7462C16.8197 14.0322 16.5 13.1375 16.5 12.2143V9C16.5 6.51472 14.4853 4.5 12 4.5Z" />
        <circle cx="12" cy="18" r="1.2" />
      </svg>
      <span style={{ fontSize: "13px", color: isSubscribed ? "#9eff9e" : "rgba(255,255,255,0.65)", flex: 1 }}>
        {message || (isSubscribed ? "Push известия: активни" : "Push известия: изключени")}
      </span>
      <button
        type="button"
        disabled={isBusy}
        onClick={isSubscribed ? handleDisable : handleEnable}
        style={{
          padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
          background: isSubscribed ? "rgba(255,107,107,0.15)" : "rgba(212,175,55,0.15)",
          border: `1px solid ${isSubscribed ? "rgba(255,107,107,0.4)" : "rgba(212,175,55,0.4)"}`,
          color: isSubscribed ? "#ff8f8f" : "var(--accent-gold-color, #d4af37)",
          cursor: isBusy ? "not-allowed" : "pointer",
          opacity: isBusy ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {isBusy ? "..." : isSubscribed ? "Изключи" : "Активирай"}
      </button>
    </div>
  );
}
