"use client";

import { FormEvent, useState } from "react";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
};

export function TaskBoard({ workspaceId, initialTasks, compact = false }: { workspaceId: string; initialTasks: Task[]; compact?: boolean }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
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
      setTitle("");
      setDueAt("");
      setMessage("Task created.");
    } catch {
      setMessage("Compass could not create the task.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(task: Task) {
    const nextStatus = task.status === "done" ? "open" : "done";
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage("Compass could not update the task.");
        return;
      }
      setTasks(current => current.map(item => item.id === task.id ? json.task : item));
    } catch {
      setMessage("Compass could not update the task.");
    }
  }

  const visibleTasks = compact ? tasks.slice(0, 5) : tasks;

  return (
    <div className={`task-board${compact ? " compact" : ""}`}>
      <form className="task-create-form" onSubmit={createTask}>
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Add a follow-up or task…" maxLength={180}/>
        {!compact && <input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)}/>} 
        <button className="button primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add"}</button>
      </form>
      {message && <p className="action-feedback">{message}</p>}
      <div className="task-list">
        {visibleTasks.length ? visibleTasks.map(task => (
          <article className={`task-row${task.status === "done" ? " done" : ""}`} key={task.id}>
            <button className="task-toggle" onClick={() => toggleTask(task)} aria-label={task.status === "done" ? "Reopen task" : "Complete task"}>
              {task.status === "done" ? "✓" : ""}
            </button>
            <div>
              <b>{task.title}</b>
              {task.notes && <p>{task.notes.replace(/Source message:[\s\S]*$/m, "").trim()}</p>}
              <small>{task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}</small>
            </div>
            <span className="pill">{task.status.replaceAll("_", " ")}</span>
          </article>
        )) : <div className="empty-inline"><b>No tasks yet</b><p>Create one here or turn an imported message into a follow-up.</p></div>}
      </div>
    </div>
  );
}
