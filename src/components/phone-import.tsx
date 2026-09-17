"use client";
import {useState} from "react";

const categories=[
 ["Messages","iMessage, SMS and exported conversation history"],
 ["Calls","Incoming, outgoing and missed call history"],
 ["Voicemail","Voicemail records and audio exports"],
 ["Contacts","vCard and contact exports"],
 ["Photos & Videos","Media you select from iPhone or Files"],
 ["Calendar","Calendar export files"],
 ["Notes & Files","Documents and other iPhone exports"],
] as const;

export function PhoneImport(){
 const[files,setFiles]=useState<File[]>([]);const[busy,setBusy]=useState(false);const[result,setResult]=useState("");
 async function upload(){if(!files.length)return;setBusy(true);setResult("");const body=new FormData();files.forEach(file=>body.append("files",file));try{const csv=files.filter(f=>f.name.toLowerCase().endsWith(".csv"));if(!csv.length){setResult("These files are ready for Compass, but this version only processes Messages and Call History CSV automatically. The other formats are staged for the Companion importer.");return}const csvBody=new FormData();csv.forEach(file=>csvBody.append("files",file));const res=await fetch("/api/import/phone",{method:"POST",body:csvBody});const data=await res.json();if(!res.ok)throw new Error(data?.error||"Import failed");setResult(`Added ${data.imported||0} phone items${data.skipped?` · ${data.skipped} already imported`:""}.`);setFiles([]);}catch(error){setResult(error instanceof Error?error.message:"Import failed");}finally{setBusy(false)}}
 return <div className="phone-import"><div className="section-heading"><div><p className="eyebrow">Compass Import Center</p><h3>Bring your iPhone into Compass</h3><p className="muted">Use direct exports now. Compass Companion is the extraction layer for protected iPhone backup data such as complete Messages, Calls and Voicemail.</p></div></div><div className="provider-control-grid">{categories.map(([name,detail])=><div className="card provider-control-card" key={name}><div><b>{name}</b><p className="muted">{detail}</p></div></div>)}</div><label className="upload-box"><b>Choose iPhone files</b><span>Current automatic import: Messages CSV and Call History CSV. You can also select other exported iPhone files here while Companion support is being added.</span><input type="file" accept=".csv,.vcf,.ics,.jpg,.jpeg,.png,.heic,.mov,.mp4,.m4a,.pdf,.txt,.zip,text/csv,text/vcard,text/calendar,image/*,video/*,audio/*" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>{files.length>0&&<div className="phone-import-files">{files.map(f=><span key={`${f.name}-${f.size}`}>{f.name}</span>)}</div>}<button className="button primary" disabled={!files.length||busy} onClick={upload}>{busy?"Importing…":`Import${files.length?` ${files.length} file${files.length===1?"":"s"}`:""}`}</button>{result&&<p className="muted">{result}</p>}<div className="phone-help"><b>Compass Companion</b><p>The Companion will run outside the browser, pair with a trusted iPhone, create/read an Apple backup locally, and hand supported data to this Import Center. ChromeOS USB support will be detected before backup controls are enabled.</p></div></div>
}
