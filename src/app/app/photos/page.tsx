import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic="force-dynamic";
type FileItem={id:string;name:string;mime_type:string|null;created_at:string};
export default async function PhotosPage(){
 const user=await requireUser(); const admin=createAdminClient();
 const {data}=await admin.from("file_entries").select("id,name,mime_type,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);
 const media=((data||[]) as FileItem[]).filter(f=>(f.mime_type||"").startsWith("image/")||(f.mime_type||"").startsWith("video/"));
 const photos=media.filter(f=>(f.mime_type||"").startsWith("image/")); const videos=media.filter(f=>(f.mime_type||"").startsWith("video/"));
 return <div className="photos-page"><section className="photos-title"><div><h1>Photos</h1><p>Your photos, videos, albums and memories.</p></div><Link href="/app/files" className="button secondary">Add from Files</Link></section>
 <nav className="photo-tabs"><span className="active">Library</span><span>Albums</span><span>Memories</span><span>Favorites</span><span>Videos</span><span>Shared</span></nav>
 <section className="photo-feature"><div><small>MEMORIES</small><h2>Your moments belong here</h2><p>As you add photos and videos, Compass can organize them into albums and memories without cluttering Home.</p></div><span>♡</span></section>
 <div className="photo-stats"><div><b>{photos.length}</b><small>Photos</small></div><div><b>{videos.length}</b><small>Videos</small></div><div><b>0</b><small>Albums</small></div><div><b>0</b><small>Favorites</small></div></div>
 <section className="home-panel"><div className="home-panel-title"><h2>Library</h2><Link href="/app/files">Files</Link></div>{media.length?<div className="media-grid">{media.map(item=><Link href="/app/files" className="media-tile" key={item.id}><span>{(item.mime_type||"").startsWith("video/")?"▶":"▧"}</span><b>{item.name}</b><small>{new Date(item.created_at).toLocaleDateString()}</small></Link>)}</div>:<div className="photos-empty"><span>▧</span><h2>Start your library</h2><p>Add photos and videos to Files and they’ll appear here. Albums, favorites and memories can build on top of your library.</p><Link href="/app/files" className="button primary">Open Files</Link></div>}</section></div>;
}
