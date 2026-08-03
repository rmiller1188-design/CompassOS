"use client";

export function ConnectAccountButtons({ profileId }: { profileId: string }) {
  function connect(provider: "google" | "microsoft") {
    window.location.href = `/api/oauth/${provider}/start?profileId=${encodeURIComponent(profileId)}`;
  }
  return (
    <div className="button-row">
      <button className="button primary" onClick={() => connect("google")}>Connect Google</button>
      <button className="button secondary" onClick={() => connect("microsoft")}>Connect Microsoft</button>
    </div>
  );
}
