"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type Column } from "../_components/DataTable";

interface LogEntry {
  id: string;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  adminName: string | null;
  adminEmail: string | null;
}

interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

const ACTION_COLORS: Record<string, string> = {
  DELETE_USER: "badge--red",
  DELETE_FUEL_PRICE: "badge--red",
  DELETE_PROVIDER: "badge--red",
  DELETE_TOLL_PLAZA: "badge--red",
  UPDATE_USER_ROLE: "badge--amber",
  UPDATE_USER_STATUS: "badge--amber",
  UPDATE_FUEL_PRICE: "badge--amber",
  UPDATE_PROVIDER: "badge--amber",
  UPDATE_TOLL_PLAZA: "badge--amber",
  ADD_FUEL_PRICE: "badge--green",
  ADD_PROVIDER: "badge--green",
  ADD_TOLL_PLAZA: "badge--green",
  BULK_UPLOAD_FUEL_PRICES: "badge--blue",
  ACTIVATE_PROVIDER: "badge--green",
  DEACTIVATE_PROVIDER: "badge--gray",
};

export default function LogsPage() {
  const [response, setResponse] = useState<LogsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (actionFilter) params.set("action", actionFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/admin/logs?${params}`);
    setResponse(await res.json());
    setLoading(false);
  }, [page, actionFilter, from, to]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const columns: Column<LogEntry>[] = [
    {
      key: "createdAt",
      header: "Time",
      cell: (l) =>
        new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(l.createdAt)),
    },
    {
      key: "adminName",
      header: "Admin",
      cell: (l) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.8rem" }}>{l.adminName ?? "—"}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{l.adminEmail}</div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (l) => (
        <span className={`badge ${ACTION_COLORS[l.action] ?? "badge--gray"}`} style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem" }}>
          {l.action}
        </span>
      ),
    },
    {
      key: "targetTable",
      header: "Table",
      cell: (l) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)" }}>
          {l.targetTable ?? "—"}
        </span>
      ),
    },
    {
      key: "targetId",
      header: "Target ID",
      cell: (l) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--text-muted)" }}>
          {l.targetId ? l.targetId.slice(0, 8) + "…" : "—"}
        </span>
      ),
    },
    {
      key: "details",
      header: "Details",
      cell: (l) => {
        const hasDetails = l.details && Object.keys(l.details).length > 0;
        if (!hasDetails) return <span style={{ color: "var(--text-muted)" }}>—</span>;
        return (
          <button className="btn btn--ghost btn--sm" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
            {expandedId === l.id ? "Hide" : "View"}
          </button>
        );
      },
    },
  ];

  const expandedEntry = response?.data.find((d) => d.id === expandedId);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Audit Log</h1>
        <p className="page-subtitle">Read-only record of all admin actions</p>
      </div>

      <div className="table-container">
        <div className="table-toolbar">
          <input className="input" style={{ maxWidth: 200 }} placeholder="Filter by action…" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} />
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap" }}>From</label>
            <input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: "auto" }} />
          </div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap" }}>To</label>
            <input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: "auto" }} />
          </div>
          {(actionFilter || from || to) && (
            <button className="btn btn--ghost btn--sm" onClick={() => { setActionFilter(""); setFrom(""); setTo(""); setPage(1); }}>Clear</button>
          )}
          <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {response?.total ?? "…"} entries
          </span>
        </div>

        <DataTable data={response?.data ?? []} columns={columns} total={response?.total ?? 0} page={page} limit={50} onPageChange={setPage} isLoading={loading} emptyMessage="No audit log entries yet." />

        {expandedId && expandedEntry?.details && (
          <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Details for {expandedId.slice(0, 8)}
            </p>
            <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-primary)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {JSON.stringify(expandedEntry.details, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
