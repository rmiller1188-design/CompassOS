import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProjectItemForm } from "@/components/project-item-form";
import styles from "../projects.module.css";

export const dynamic = "force-dynamic";

type Project = {
  id: string;
  name: string;
  client_name: string | null;
  project_number: string | null;
  status: string;
  phase: string | null;
  location: string | null;
  bid_due_at: string | null;
  start_at: string | null;
  end_at: string | null;
  estimated_value: number | null;
  notes: string | null;
  updated_at: string;
};
type ProjectItem = { id: string; item_type: string; title: string; status: string; due_at: string | null; assignee: string | null; reference_number: string | null; notes: string | null; updated_at: string };

function itemIcon(type: string): string {
  if (type === "estimate") return "$";
  if (type === "rfi") return "?";
  if (type === "submittal") return "S";
  if (type === "milestone") return "◆";
  if (type === "issue") return "!";
  if (type === "note") return "N";
  return "✓";
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: projectData, error }, { data: itemsData }, { data: linksData }] = await Promise.all([
    admin.from("projects").select("id,name,client_name,project_number,status,phase,location,bid_due_at,start_at,end_at,estimated_value,notes,updated_at").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    admin.from("project_items").select("id,item_type,title,status,due_at,assignee,reference_number,notes,updated_at").eq("project_id", id).eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(300),
    admin.from("project_links").select("id,entity_type,entity_id").eq("project_id", id).eq("owner_id", user.id).limit(500)
  ]);
  if (error || !projectData) notFound();
  const project = projectData as Project;
  const items = (itemsData || []) as ProjectItem[];
  const links = linksData || [];
  const open = items.filter(item => !["done","approved","cancelled"].includes(item.status));
  const rfis = items.filter(item => item.item_type === "rfi").length;
  const submittals = items.filter(item => item.item_type === "submittal").length;
  const estimates = items.filter(item => item.item_type === "estimate").length;

  return (
    <div className={styles.page}>
      <section className={`${styles.detailHero} card`}>
        <Link className={styles.back} href="/app/projects">← Back to Projects</Link>
        <div className={styles.titleRow}>
          <div><p className="eyebrow">Project workspace</p><h1>{project.name}</h1><p>{[project.client_name, project.project_number && `#${project.project_number}`, project.location].filter(Boolean).join(" · ") || "No client metadata yet"}</p></div>
          <span className={`${styles.status} ${styles[project.status] || ""}`}>{project.status.replace("_", " ")}</span>
        </div>
        <div className={styles.detailMetrics}>
          <Metric label="Open items" value={String(open.length)} note={`${items.length} total`}/>
          <Metric label="RFIs" value={String(rfis)} note="tracked requests"/>
          <Metric label="Submittals" value={String(submittals)} note="tracked packages"/>
          <Metric label="Estimate" value={project.estimated_value ? `$${Math.round(project.estimated_value).toLocaleString()}` : String(estimates)} note={project.estimated_value ? "estimated value" : "estimate records"}/>
        </div>
      </section>

      <div className={styles.detailGrid}>
        <section className={`${styles.card} card`}>
          <div className={styles.header}><div><p className="eyebrow">Project register</p><h2>RFIs, submittals, estimates and follow-ups</h2><p>Operational items stay attached to this project instead of disappearing into general tasks.</p></div><span className="pill">{items.length}</span></div>
          <div className={styles.items}>
            {items.length ? items.map(item => (
              <article className={styles.item} key={item.id}>
                <span className={styles.itemIcon}>{itemIcon(item.item_type)}</span>
                <span className={styles.itemCopy}><b>{item.reference_number ? `${item.reference_number} · ` : ""}{item.title}</b><p>{item.item_type.replace("_", " ")} · {item.status.replace("_", " ")}{item.assignee ? ` · ${item.assignee}` : ""}</p><small>{item.due_at ? `Due ${new Date(item.due_at).toLocaleString()}` : `Updated ${new Date(item.updated_at).toLocaleDateString()}`}{item.notes ? ` · ${item.notes}` : ""}</small></span>
                <span className="pill">{item.status.replace("_", " ")}</span>
              </article>
            )) : <div className={styles.empty}><b>No project items yet</b>Add the first RFI, estimate, submittal, issue, milestone, or follow-up.</div>}
          </div>
        </section>

        <div style={{display:"grid",gap:12,alignContent:"start"}}>
          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Add to project</p><h2>New register item</h2><p>Keep project obligations in the project context.</p></div></div>
            <ProjectItemForm projectId={project.id}/>
          </section>
          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Project facts</p><h2>Operating context</h2></div></div>
            <div className="contact-detail-grid">
              <div><small>Phase</small><b>{project.phase || "Not set"}</b></div>
              <div><small>Bid / due</small><b>{project.bid_due_at ? new Date(project.bid_due_at).toLocaleString() : "Not set"}</b></div>
              <div><small>Start</small><b>{project.start_at ? new Date(project.start_at).toLocaleDateString() : "Not set"}</b></div>
              <div><small>End</small><b>{project.end_at ? new Date(project.end_at).toLocaleDateString() : "Not set"}</b></div>
              <div><small>Linked Compass records</small><b>{links.length}</b></div>
              <div><small>Last updated</small><b>{new Date(project.updated_at).toLocaleString()}</b></div>
            </div>
            {project.notes && <div className="message-body">{project.notes}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.metric}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}
