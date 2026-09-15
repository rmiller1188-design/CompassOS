import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type HomeMessage={id:string;provider:string;channel:string;subject:string|null;sender:string|null;preview:string|null;occurred_at:string};
type HomeEvent={id:string;title:string;starts_at:string;location:string|null};

function when(value:string){return new Date(value).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"});}
function messageHref(m:HomeMessage){const source=m.channel==="sms"?"texts":m.provider==="microsoft"?"outlook":m.provider==="google"?"gmail":"all";return `/app/messages?source=${source}&message=${m.id}`;}

export default async function HomePage(){
 const user=await requireUser(); const admin=createAdminClient();
 const {data:profile}=await admin.from("profiles").select("display_name,personal_workspace_id").eq("owner_id",user.id).eq("kind","personal").single();
 if(!profile) return <div className="empty-state"><h1>Welcome to Compass</h1><p>Finish your profile to get started.</p></div>;
 const now=new Date().toISOString();
 const [messagesResult,eventsResult,peopleResult,filesResult]=await Promise.all([
  admin.from("communication_items").select("id,provider,channel,subject,sender,preview,occurred_at").eq("owner_id",user.id).eq("direction","inbound").order("occurred_at",{ascending:false}).limit(5),
  admin.from("calendar_events").select("id,title,starts_at,location").eq("workspace_id",profile.personal_workspace_id).gte("starts_at",now).order("starts_at").limit(4),
  admin.from("people").select("id",{count:"exact",head:true}).eq("owner_id",user.id),
  admin.from("file_entries").select("id",{count:"exact",head:true}).eq("owner_id",user.id)
 ]);
 const messages=(messagesResult.data||[]) as HomeMessage[]; const events=(eventsResult.data||[]) as HomeEvent[];
 const firstName=(profile.display_name||"").split(" ")[0];
 return <div className="simple-home">
  <section className="home-welcome"><div><p className="home-kicker">Compass</p><h1>{firstName?`Hi, ${firstName}`:"Hi"}</h1><p>Everything important, in one place.</p></div><Link className="home-search" href="/app/search">⌕ Search</Link></section>
  <div className="home-app-grid">
   <HomeApp href="/app/messages" icon="✉" label="Messages" note="Email, texts & calls"/>
   <HomeApp href="/app/calendar" icon="◷" label="Calendar" note="Your plans"/>
   <HomeApp href="/app/photos" icon="▧" label="Photos" note="Albums & memories"/>
   <HomeApp href="/app/people" icon="◎" label="People" note={`${peopleResult.count||0} contacts`}/>
   <HomeApp href="/app/files" icon="▣" label="Files" note={`${filesResult.count||0} saved`}/>
   <HomeApp href="/app/us" icon="♡" label="Us" note="Your shared space"/>
  </div>
  <div className="home-columns">
   <section className="home-panel"><div className="home-panel-title"><h2>Recent</h2><Link href="/app/messages">See All</Link></div><div className="home-feed">{messages.length?messages.map(m=><Link href={messageHref(m)} className="home-feed-row" key={m.id}><span className="home-avatar">{(m.sender||m.subject||"M").slice(0,1).toUpperCase()}</span><span><b>{m.sender||m.subject||"Message"}</b><small>{m.subject&&m.sender?m.subject:"Message"}</small><p>{m.preview||"Open to read"}</p></span><time>{new Date(m.occurred_at).toLocaleDateString([], {month:"short",day:"numeric"})}</time></Link>):<div className="home-empty">Your recent messages will appear here.</div>}</div></section>
   <section className="home-panel"><div className="home-panel-title"><h2>Up Next</h2><Link href="/app/calendar">Calendar</Link></div><div className="home-feed">{events.length?events.map(e=><Link href={`/app/calendar?event=${e.id}`} className="home-feed-row compact" key={e.id}><span className="home-date">{new Date(e.starts_at).getDate()}</span><span><b>{e.title}</b><small>{when(e.starts_at)}{e.location?` · ${e.location}`:""}</small></span></Link>):<div className="home-empty">Nothing coming up.</div>}</div></section>
  </div>
  <section className="home-memory"><div><span className="home-memory-icon">▧</span><h2>Photos & Memories</h2><p>Keep favorite moments, albums and videos together.</p></div><Link className="button primary" href="/app/photos">Open Photos</Link></section>
 </div>;
}
function HomeApp({href,icon,label,note}:{href:string;icon:string;label:string;note:string}){return <Link className="home-app" href={href}><span>{icon}</span><div><b>{label}</b><small>{note}</small></div></Link>}
