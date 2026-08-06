"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
};

type Filter = "all" | "open" | "done";

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled"
};

function localDateTimeValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function sourceMessageId(notes: string | null): string | null {
  const match = notes?.match(/Source message:\s*([0-9a-f-]{36})/i);
  return match?.[1] || null;
}

function cleanNotes(notes: string | null): string {
  return (notes || "").replace(/Source message:\s*[0-9a-f-]{36}/gi, "").trim();
}

export function TaskBoard({ workspaceId, initialTasks, compact = false }: { workspaceId: string; initialTasks: Task[]; compact?: boolean }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dueEdits, setDueEdits] = useState<Record<string, string>>(() => Object.fromEntries(initialTasks.map(task => [task.id, localDateTimeValue(task.due_at)])));
  const [message, setMessage] = useState("");

  const counts = useMemo(() => ({
    all: tasks.filter(task => task.status !== "cancelled").length,
    open: tasks.filter(task => task.status === "open" || task.status === "in_progress").length,
    done: tasks.filter(task => task.status === "done").length
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter(task => {
      if (task.status === "cancelled") return false;
      if (filter === "open") return task.status === "open" || task.status === "in_progress";
      if (filter === "done") return task.status === "done";
      return true;
    });
    return compact ? filtered.slice(0, 5) : filtered;
  }, [compact, filter, tasks]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setMessage("Enter a task title first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: title.trim(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage("Compass could not create the task.");
        return;
      }
      setTasks(current => [json.task, ...current]);
      setDueEdits(current => ({ ...current, [json.task.id]: localDateTimeValue(json.task.due_at) }));
      setTitle("");
      setDueAt("");
      setFilter("all");
      setExpandedId(json.task.id);
      setMessage("Task created and opened.");
    } catch {
      setMessage("Compass could not create the task.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task: Task, changes: Record<string, unknown>, successMessage: string) {
    setBusyTaskId(task.id);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes)
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage("Compass could not update the task.");
        return;
      }
      setTasks(current => current.map(item => item.id === task.id ? json.task : item));
      setDueEdits(current => ({ ...current, [task.id]: localDateTimeValue(json.task.due_at) }));
      setMessage(successMessage);
    } catch {
      setMessage("Compass could not update the task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function toggleTask(task: Task) {
    const nextStatus = task.status === "done" ? "open" : "done";
    await updateTask(task, { status: nextStatus }, nextStatus === "done" ? "Task completed." : "Task reopened.");
  }

  async function changeStatus(task: Task, status: string) {
    await updateTask(task, { status }, `Task marked ${statusLabels[status]?.toLowerCase() || status}.`);
  }

  async function saveDueDate(task: Task) {
    const value = dueEdits[task.id] || "";
    await updateTask(task, { dueAt: value ? new Date(value).toISOString() : null }, value ? "Due date saved." : "Due date removed.");
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) {
      setMessage("Delete cancelled.");
      return;
    }
    setBusyTaskId(task.id);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) {
        setMessage("Compass could not delete the task.");
        return;
      }
      setTasks(current => current.filter(item => item.id !== task.id));
      setExpandedId(current => current === task.id ? null : current);
      setMessage("Task deleted.");
    } catch {
      setMessage("Compass could not delete the task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className={`task-board${compact ? " compact" : ""}`}>
      <form className="task-create-form" onSubmit={createTask}>
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Add a follow-up or task…" maxLength={180} aria-label="Task title"/>
        {!compact && <input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} aria-label="Task due date"/>}
        <button className="button primary" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
      </form>

      <div className="task-filter-bar" aria-label="Filter tasks">
        {(["all", "open", "done"] as const).map(option => (
          <button type="button" className={`filter-chip${filter === option ? " active" : ""}`} onClick={() => { setFilter(option); setMessage(`Showing ${option} tasks.`); }} key={option} aria-pressed={filter === option}>
            {option === "all" ? "All" : option === "open" ? "Open" : "Done"} <span>{counts[option]}</span>
          </button>
        ))}
      </div>

      {message && <p className="action-feedback" role="status" aria-live="polite">{message}</p>}
      <div className="task-list">
        {visibleTasks.length ? visibleTasks.map(task => {
          const expanded = expandedId === task.id;
          const sourceId = sourceMessageId(task.notes);
          const notes = cleanNotes(task.notes);
          const taskBusy = busyTaskId === task.id;
          return (
            <article className={`task-row${task.status === "done" ? " done" : ""}${expanded ? " expanded" : ""}`} key={task.id}>
              <button type="button" className="task-toggle" onClick={() => void toggleTask(task)} disabled={taskBusy} aria-label={task.status === "done" ? "Reopen task" : "Complete task"} title={task.status === "done" ? "Reopen task" : "Complete task"}>
                {task.status === "done" ? "✓" : ""}
              </button>
              <button type="button" className="task-main-button" onClick={() => { setExpandedId(expanded ? null : task.id); setMessage(expanded ? "Task details closed." : "Task details opened."); }} aria-expanded={expanded}>
                <span><b>{task.title}</b>{notes && <p>{notes}</p>}<small>{task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}</small></span>
                <span className="row-chevron" aria-hidden="true">{expanded ? "⌃" : "›"}</span>
              </button>
              <select className={`task-status-select status-${task.status}`} value={task.status} onChange={event => void changeStatus(task, event.target.value)} disabled={taskBusy} aria-label={`Status for ${task.title}`} title="Change task status">
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
              {expanded && (
                <div className="task-details">
                  <div className="task-detail-copy">
                    <b>Task details</b>
                    <p>{notes || "No notes were added to this task."}</p>
                    <small>Created {new Date(task.created_at).toLocaleString()}</small>
                  </div>
                  <label>Due date<input type="datetime-local" value={dueEdits[task.id] || ""} onChange={event => setDueEdits(current => ({ ...current, [task.id]: event.target.value }))}/></label>
                  <div className="task-detail-actions">
                    <button type="button" className="button secondary" onClick={() => void saveDueDate(task)} disabled={taskBusy}>{taskBusy ? "Saving…" : "Save due date"}</button>
                    {sourceId && <Link className="button secondary" href={`/app/messages?message=${sourceId}`}>Open source message</Link>}
                    <button type="button" className="button danger" onClick={() => void deleteTask(task)} disabled={taskBusy}>Delete task</button>
                  </div>
                </div>
              )}
            </article>
          );
        }) : <div className="empty-inline"><b>No {filter === "all" ? "" : `${filter} `}tasks</b><p>Create one here or turn an imported message into a follow-up.</p></div>}
      </div>
      {compact && visibleTasks.length < tasks.filter(task => task.status !== "cancelled").length && <p className="form-message">Showing the first five matching tasks. Use the filters above to narrow the list.</p>}
    </div>
  );
}
