"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateUsWorkspace() {
  const [name,setName]=useState("Us");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();
  async function create(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");const response=await fetch("/api/workspaces/shared",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})});const json=await response.json();setBusy(false);if(response.ok)router.refresh();else setError(json.error||"Unable to create workspace")}
  return <form onSubmit={create} className="stack"><label>Shared space name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label><button className="button primary" disabled={busy}>{busy?"Creating…":"Create Us workspace"}</button>{error&&<p className="error-text">{error}</p>}</form>;
}
