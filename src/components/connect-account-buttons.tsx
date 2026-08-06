"use client";

import { useState } from "react";

export function ConnectAccountButtons({ profileId }: { profileId: string }) {
  const [opening, setOpening] = useState<"google" | "microsoft" | null>(null);

  function connect(provider: "google" | "microsoft") {
    setOpening(provider);
    window.location.assign(`/api/oauth/${provider}/start?profileId=${encodeURIComponent(profileId)}`);
  }

  return (
    <div>
      <div className="button-row">
        <button className="button primary" onClick={() => connect("google")} disabled={Boolean(opening)}>{opening === "google" ? "Opening Google…" : "Connect Google"}</button>
        <button className="button secondary" onClick={() => connect("microsoft")} disabled={Boolean(opening)}>{opening === "microsoft" ? "Opening Microsoft…" : "Connect Microsoft"}</button>
      </div>
      {opening && <p className="form-message" role="status" aria-live="polite">Opening the secure {opening === "google" ? "Google" : "Microsoft"} authorization screen…</p>}
    </div>
  );
}
