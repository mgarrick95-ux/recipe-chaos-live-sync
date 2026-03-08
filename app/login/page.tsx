// app/login/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // cookie session should now exist; server routes can see it
    router.push("/shopping-list");
    router.refresh();
  }

  async function signUp() {
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    alert("Account created. You can now sign in.");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0f1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#f8fafc",
      }}
    >
      <div
        style={{
          width: 420,
          padding: 28,
          borderRadius: 12,
          background: "#121826",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>
          Sign in
        </h1>

        <form onSubmit={signIn}>
          <label style={{ display: "block", marginBottom: 6 }}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 16,
              borderRadius: 6,
              border: "1px solid #2d3748",
              background: "#0f172a",
              color: "#f8fafc",
            }}
          />

          <label style={{ display: "block", marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 16,
              borderRadius: 6,
              border: "1px solid #2d3748",
              background: "#0f172a",
              color: "#f8fafc",
            }}
          />

          {error && (
            <div style={{ color: "#f87171", marginBottom: 12 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "none",
              background: "#7c3aed",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <button
          onClick={signUp}
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            marginTop: 12,
            borderRadius: 8,
            border: "1px solid #334155",
            background: "transparent",
            color: "#e5e7eb",
            cursor: "pointer",
          }}
        >
          Create account
        </button>
      </div>
    </div>
  );
}
