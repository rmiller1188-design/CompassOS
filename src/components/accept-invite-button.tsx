"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteButton({ token }: { token: string }) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();
  async function accept(){setBusy(true);setError("");const response=await fetch("/api/invitations/accept",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});const json=await response.json();if(response.ok){router.replace("/app/us");router.refresh()}else{setError(json.error||"Unable to accept invitation");setBusy(false)}}
  return <div className="stack"><button className="button primary" onClick={accept} disabled={busy}>{busy?"Joining…":"Join Us"}</button>{error&&<p className="error-text">{error}</p>}</div>;
}
