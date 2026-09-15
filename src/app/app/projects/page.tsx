import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProjectCreateForm } from "@/components/project-create-form";
import styles from "./projects.module.css";

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
  estimated_value: number | null;
  updated_at: string;
};

export default async function ProjectsPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const [{ data: profile }, { data: projectsData }] = await Promise.all([
    admin.from("profiles").select("personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single(),
    admin.from("projects").select("id,name,client_name,project_number,status,phase,location,bid_due_at,estimated_value,updated_at").eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(300)
  ]);

  const projects = (projectsData || []) as Project[];
  const active = projects.filter(project => project.status === "active").length;
  const bidding = projects.filter(project => project.status === "bidding").length;
  const dueSoon = projects.filter(project => {
    if (!project.bid_due_at) return false;
    const when = new Date(project.bid_due_at).getTime();
    return when >= Date.now() && when <= Date.now() + 14 * 86400000;
  }).length;
  const pipeline = projects.reduce((sum, project) => sum + Number(project.estimated_value || 0), 0);

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} card`}>
        <div><p className="eyebrow">Projects</p><h1>Run the work, not another spreadsheet.</h1><p>Track opportunities, bids, active jobs, project numbers, deadlines, values, RFIs, submittals, estimates, issues, and next actions in one place.</p></div>
        <div className={styles.heroActions}><Link className="button secondary" href="/app/search">Search Compass</Link><Link className="button secondary" href="/app/files">Files</Link></div>
      </section>

      <section className={styles.metrics}>
        <Metric label="Projects" value={String(projects.length)} note="tracked in Compass"/>
        <Metric label="Active" value={String(active)} note="currently moving"/>
        <Metric label="Bidding" value={String(bidding)} note={`${dueSoon} due in next 14 days`}/>
        <Metric label="Pipeline" value={pipeline ? `$${Math.round(pipeline).toLocaleString()}` : "$0"} note="estimated project value"/>
      </section>

      <div className={styles.layout}>
        <section className={`${styles.card} card`}>
          <div className={styles.header}><div><p className="eyebrow">Portfolio</p><h2>Projects and opportunities</h2><p>Newest activity first.</p></div><span className="pill">{projects.length}</span></div>
          <div className={styles.projectList}>
            {projects.length ? projects.map(project => (
              <Link className={styles.project} href={`/app/projects/${project.id}`} key={project.id}>
                <span className={styles.projectIcon}>P</span>
                <span className={styles.projectCopy}><b>{project.name}</b><p>{[project.client_name, project.project_number && `#${project.project_number}`].filter(Boolean).join(" · ") || "No client/project number"}</p><small>{project.phase || "No phase"}{project.bid_due_at ? ` · due ${new Date(project.bid_due_at).toLocaleDateString()}` : ""}{project.location ? ` · ${project.location}` : ""}</small></span>
                <span className={`${styles.status} ${styles[project.status] || ""}`}>{project.status.replace("_", " ")}</span>
              </Link>
            )) : <div className={styles.empty}><b>No projects yet</b>Create the first project or bid from the panel to the right.</div>}
          </div>
        </section>

        <section className={`${styles.card} card`}>
          <div className={styles.header}><div><p className="eyebrow">New project</p><h2>Create workspace</h2><p>Start with the identifiers and deadline. Add RFIs, estimates, submittals, and follow-ups after creation.</p></div></div>
          {profile?.personal_workspace_id ? <ProjectCreateForm workspaceId={profile.personal_workspace_id}/> : <div className={styles.empty}><b>Personal workspace missing</b>Compass could not resolve a personal workspace for project creation.</div>}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.metric}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}
