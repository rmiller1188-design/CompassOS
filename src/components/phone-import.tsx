"use client";
import {useState} from "react";

export function PhoneImport(){
 const[files,setFiles]=useState<File[]>([]);const[busy,setBusy]=useState(false);const[result,setResult]=useState("");
 async function upload(){if(!files.length)return;setBusy(true);setResult("");const body=new FormData();files.forEach(file=>body.append("files",file));try{const res=await fetch("/api/import/phone",{method:"POST",body});const data=await res.json();if(!res.ok)throw new Error(data?.error||"Import failed");setResult(`Added ${data.imported||0} items${data.skipped?` · ${data.skipped} already imported`:""}.`);setFiles([]);}catch(error){setResult(error instanceof Error?error.message:"Import failed");}finally{setBusy(false)}}
 return <div className="phone-import"><label className="upload-box"><b>Choose iPhone export files</b><span>Messages CSV and Call History CSV are supported. You can select both at once.</span><input type="file" accept=".csv,text/csv" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>{files.length>0&&<div className="phone-import-files">{files.map(f=><span key={`${f.name}-${f.size}`}>{f.name}</span>)}</div>}<button className="button primary" disabled={!files.length||busy} onClick={upload}>{busy?"Importing…":`Import${files.length?` ${files.length} file${files.length===1?"":"s"}`:""}`}</button>{result&&<p className="muted">{result}</p>}</div>
}
