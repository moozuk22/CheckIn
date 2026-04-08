"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="container flex items-center justify-center fade-in" style={{ minHeight: "100vh" }}>
          <div className="member-card" style={{ maxWidth: "420px", width: "100%" }}>
            <div className="text-center mb-8">
              <div className="loading mx-auto" />
            </div>
          </div>
        </div>
      }
    >
      <AdminLoginPageInner />
    </Suspense>
  );
}

function AdminLoginPageInner() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const data = await response.json();
        const memberCardCode = searchParams.get("memberCardCode")?.trim() || "";
        if (data.role === "MEDIA_MANAGER") {
          if (memberCardCode) {
            sessionStorage.setItem("admin_return_member_card_code", memberCardCode);
          } else {
            sessionStorage.removeItem("admin_return_member_card_code");
          }
          router.push("/admin/media");
        } else {
          sessionStorage.removeItem("admin_return_member_card_code");
          router.push("/admin/members");
        }
      } else {
        const data = await response.json();
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container flex items-center justify-center fade-in" style={{ minHeight: '100vh' }}>
      <div className="member-card" style={{ maxWidth: '420px', width: '100%' }}>
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Logo"
            className="mb-5 mx-auto"
            style={{ width: '56px', height: '56px', objectFit: 'contain' }}
          />
          <h2 className="text-gold mb-2" style={{ fontSize: '2rem', fontWeight: '600' }}>
            Администраторски вход
          </h2>
        </div>
        
        <form className="space-y-8" onSubmit={handleSubmit}>
          <div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Въведете парола"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
            />
          </div>

          {error && (
            <div className="alert alert-error text-center">
              {error}
            </div>
          )}

          <div className="mt-8">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
              style={{ cursor: loading ? 'not-allowed' : 'pointer', padding: '12px 20px' }}
            >
              {loading ? "Влизане..." : "Вход"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
