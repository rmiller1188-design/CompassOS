"use client";

import { useState } from "react";

export function ContactActions({ emails, phones }: { emails: string[]; phones: string[] }) {
  const [message, setMessage] = useState("");
  const email = emails[0] || null;
  const phone = phones[0] || null;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <div className="contact-actions">
      <div className="button-row">
        {email && <a className="button primary" href={`mailto:${email}`}>Compose email</a>}
        {phone && <a className="button secondary" href={`tel:${phone}`}>Call</a>}
        {email && <button type="button" className="button secondary" onClick={() => void copy(email, "Email address")}>Copy email</button>}
        {phone && <button type="button" className="button secondary" onClick={() => void copy(phone, "Phone number")}>Copy phone</button>}
      </div>
      {!email && !phone && <p className="muted">This provider contact has no imported email address or phone number.</p>}
      {message && <p className="action-feedback" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
