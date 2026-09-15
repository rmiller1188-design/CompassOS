import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DecisionActions } from "@/components/decision-actions";
import styles from "./decision-center.module.css";

export const dynamic = "force-dynamic";

type ActionRequest = {
  id: string;
  connection_id: string | null;
  action_type: string;
  risk_level: "internal" | "external_write" | "financial";
  payload: unknown;
  status: string;
  approved_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
};
type Connection = { id: string; provider: string; account_email: string };

function sourceLabel(connection: Connection | null | undefined): string {
  if (!connection) return "CompassOS";
  const provider = connection.provider === "microsoft" ? "Outlook" : connection.provider === "google" ? "Gmail" : connection.provider;
  return `${provider} · ${connection.account_email}`;
}

function actionLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function actionIcon(value: string): string {
  if (value.includes("mail") || value.includes("email") || value.includes("message")) return "✉";
  if (value.includes("calendar") || value.includes("event")) return "◷";
  if (value.includes("file")) return "▣";
  if (value.includes("task")) return "✓";
  return "→";
}

function payloadPreview(payload: unknown): string {
  try {
    const json = JSON.stringify(payload, null, 2);
    return json.length > 1400 ? `${json.slice(0, 1400)}\n…` : json;
  } catch {
    return "Payload could not be rendered.";
  }
}

export default async function DecisionsPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const [{ data: actionsData }, { data: connectionsData }] = await Promise.all([
    admin.from("action_requests")
      .select("id,connection_id,action_type,risk_level,payload,status,approved_at,executed_at,created_at,updated_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("provider_connections")
      .select("id,provider,account_email")
      .eq("owner_id", user.id)
  ]);

  const actions = (actionsData || []) as ActionRequest[];
  const connections = (connectionsData || []) as Connection[];
  const connectionById = new Map(connections.map(connection => [connection.id, connection]));
  const pending = actions.filter(action => action.status === "pending");
  const approved = actions.filter(action => action.status === "approved" || action.status === "executing");
  const completed = actions.filter(action => action.status === "completed");
  const failed = actions.filter(action => action.status === "failed");
  const history = actions.filter(action => action.status !== "pending").slice(0, 30);

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} card`}>
        <div>
          <p className="eyebrow">Decision Center</p>
          <h1>Nothing important leaves Compass without you.</h1>
          <p>Review proposed external writes before they can execute. Approval changes the request state only; execution remains a separate controlled step.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className="button secondary" href="/app">Mission Control</Link>
          <Link className="button secondary" href="/app/settings/connections">Accounts</Link>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Decision summary">
        <Metric label="Pending" value={String(pending.length)} note="waiting for your decision"/>
        <Metric label="Approved" value={String(approved.length)} note="not necessarily executed"/>
        <Metric label="Completed" value={String(completed.length)} note="finished actions"/>
        <Metric label="Failed" value={String(failed.length)} note="needs review"/>
      </section>

      <div className={styles.layout}>
        <section className={`${styles.card} card`}>
          <div className={styles.header}><div><p className="eyebrow">Approval queue</p><h2>Needs your decision</h2><p>Inspect source, risk level, and exact payload before approving.</p></div><span className="pill">{pending.length}</span></div>
          <div className={styles.queue}>
            {pending.length ? pending.map(action => {
              const connection = action.connection_id ? connectionById.get(action.connection_id) : null;
              return (
                <article className={styles.request} key={action.id}>
                  <div className={styles.requestTop}>
                    <span className={styles.icon}>{actionIcon(action.action_type)}</span>
                    <span className={styles.copy}><b>{actionLabel(action.action_type)}</b><p>{sourceLabel(connection)}</p><small>Requested {new Date(action.created_at).toLocaleString()}</small></span>
                    <span className={`${styles.risk} ${styles[action.risk_level]}`}>{action.risk_level.replace("_", " ")}</span>
                  </div>
                  <pre className={styles.payload}>{payloadPreview(action.payload)}</pre>
                  <DecisionActions requestId={action.id}/>
                </article>
              );
            }) : <div className={styles.empty}><b>No pending approvals</b>Compass has nothing waiting for permission right now.</div>}
          </div>
        </section>

        <div style={{display:"grid",gap:12,alignContent:"start"}}>
          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Guardrails</p><h2>How actions work</h2></div></div>
            <div className={styles.guardrails}>
              <Guardrail icon="1" title="Propose" text="Compass creates a structured action request instead of silently changing an external system."/>
              <Guardrail icon="2" title="Review" text="You see the source account, risk class, and payload before approving or rejecting."/>
              <Guardrail icon="3" title="Execute separately" text="Approval does not itself send mail, move money, or modify a provider. Execution must use a dedicated handler."/>
              <Guardrail icon="4" title="Audit" text="Decision and execution states remain in the action history for accountability."/>
            </div>
          </section>

          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Recent history</p><h2>Decision trail</h2></div><span className="pill">{history.length}</span></div>
            <div className={styles.history}>
              {history.length ? history.map(action => {
                const connection = action.connection_id ? connectionById.get(action.connection_id) : null;
                return <div className={styles.historyRow} key={action.id}><span className={styles.historyIcon}>{actionIcon(action.action_type)}</span><span className={styles.historyCopy}><b>{actionLabel(action.action_type)}</b><small>{sourceLabel(connection)} · {new Date(action.updated_at).toLocaleString()}</small></span><span className={`status ${action.status}`}>{action.status}</span></div>;
              }) : <div className={styles.empty}><b>No decision history yet</b>Approved, rejected, completed, and failed requests will appear here.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.metric}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}

function Guardrail({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className={styles.guardrail}><span>{icon}</span><span><b>{title}</b><p>{text}</p></span></div>;
}
