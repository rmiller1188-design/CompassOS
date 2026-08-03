"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignInForm({ nextPath = "/app" }: { nextPath?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = createBrowserSupabaseClient();

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` }
    });
    setBusy(false);
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  async function social(provider: "google" | "azure") {
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        scopes: provider === "azure" ? "email" : undefined
      }
    });
    if (error) { setMessage(error.message); setBusy(false); }
  }

  return (
    <div className="signin-card">
      <div className="brand-mark">C</div>
      <p className="eyebrow">Compass M26</p>
      <h1>Your private space. Your shared Us space.</h1>
      <p className="muted">Each person signs in separately and controls their own connected accounts.</p>
      <form onSubmit={sendMagicLink} className="stack">
        <label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <button className="button primary" disabled={busy}>{busy ? "Working…" : "Email me a sign-in link"}</button>
      </form>
      <div className="divider"><span>or</span></div>
      <div className="social-grid">
        <button className="button secondary" onClick={() => social("google")} disabled={busy}>Continue with Google</button>
        <button className="button secondary" onClick={() => social("azure")} disabled={busy}>Continue with Microsoft</button>
      </div>
      {message && <p className="form-message">{message}</p>}
      <p className="fine-print">Signing in does not automatically grant Gmail or Outlook data access. Those connections are requested separately inside Compass.</p>
    </div>
  );
}
