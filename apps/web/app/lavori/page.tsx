"use client";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Order = {
  id: string;
  work_order_number: string;
  status: string;
  priority: string;
  repair_case_id: string;
  notes?: string;
};

type Task = {
  id: string;
  work_order_id: string;
  task_type: string;
  description: string;
  status: string;
  assigned_user_id?: string;
  sort_order: number;
};

const states = ["NEW","WAITING_APPROVAL","APPROVED","WAITING_PARTS","IN_REPAIR","PAINTING","ASSEMBLY","QUALITY_CONTROL","READY","DELIVERED","INVOICED"];
const taskStates = ["PENDING","IN_PROGRESS","DONE","BLOCKED"];

export default function LavoriPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [newTask, setNewTask] = useState("");

  async function load() {
    const r = await apiFetch("/work-orders");
    if (r.ok) setItems(await r.json());
  }

  useEffect(() => {
    if (getAccessToken()) load();
  }, []);

  async function setStatus(id: string, status: string) {
    const r = await apiFetch(`/work-orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (r.ok) load();
  }

  async function loadTasks(orderId: string) {
    const r = await apiFetch(`/work-orders/${orderId}/tasks`);
    if (r.ok) {
      const data: Task[] = await r.json();
      setTasks((prev) => ({ ...prev, [orderId]: data }));
    }
  }

  async function toggle(orderId: string) {
    if (expanded === orderId) {
      setExpanded(null);
      return;
    }
    setExpanded(orderId);
    await loadTasks(orderId);
  }

  async function setTaskStatus(orderId: string, taskId: string, status: string) {
    const r = await apiFetch(`/work-orders/${orderId}/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (r.ok) loadTasks(orderId);
  }

  async function addTask(orderId: string) {
    const description = newTask.trim();
    if (!description) return;
    const r = await apiFetch(`/work-orders/${orderId}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        task_type: "CUSTOM",
        description,
        sort_order: (tasks[orderId]?.length || 0) + 20,
      }),
    });
    if (r.ok) {
      setNewTask("");
      loadTasks(orderId);
    }
  }

  return (
    <SectionShell title="Ordini di lavoro" eyebrow="WORKSHOP FLOW">
      {!getAccessToken() ? (
        <div className="empty-state">Accedi per gestire l'officina. <a href="/login">Accedi</a></div>
      ) : (
        <div className="panel list-panel">
          <div className="data-table work head">
            <span>Ordine</span><span>Priorità</span><span>Pratica</span><span>Stato operativo</span><span>Dettaglio</span>
          </div>

          {items.length === 0 ? (
            <div className="empty-state">Nessun ordine di lavoro.</div>
          ) : items.map((order) => (
            <div className="work-order-wrap" key={order.id}>
              <div className="data-table work work-main">
                <strong>{order.work_order_number}</strong>
                <span>{order.priority}</span>
                <span>{order.repair_case_id.slice(0,8)}…</span>
                <select value={order.status} onChange={(e) => setStatus(order.id, e.target.value)}>
                  {states.map((state) => <option key={state}>{state}</option>)}
                </select>
                <button className="task-toggle" onClick={() => toggle(order.id)}>
                  {expanded === order.id ? "Chiudi" : "Attività"}
                </button>
              </div>

              {expanded === order.id && (
                <div className="task-panel">
                  <div className="task-panel-head">
                    <div>
                      <strong>Checklist lavorazione</strong>
                      <small>Le attività seguono l'ordine operativo della carrozzeria.</small>
                    </div>
                    <span>{(tasks[order.id] || []).filter((x) => x.status === "DONE").length}/{(tasks[order.id] || []).length} completate</span>
                  </div>

                  <div className="task-list">
                    {(tasks[order.id] || []).length === 0 ? (
                      <div className="task-empty">Nessuna attività. Gli ordini creati da preventivo approvato ricevono automaticamente la checklist standard.</div>
                    ) : (tasks[order.id] || []).map((task) => (
                      <div className="task-row" key={task.id}>
                        <span className={`task-check ${task.status === "DONE" ? "done" : ""}`}>{task.status === "DONE" ? "✓" : ""}</span>
                        <div><strong>{task.description}</strong><small>{task.task_type}</small></div>
                        <select value={task.status} onChange={(e) => setTaskStatus(order.id, task.id, e.target.value)}>
                          {taskStates.map((state) => <option key={state}>{state}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="add-task">
                    <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Aggiungi attività personalizzata…" />
                    <button onClick={() => addTask(order.id)}>+ Aggiungi</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
