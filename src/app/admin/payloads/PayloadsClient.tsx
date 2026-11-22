"use client";

import { useEffect, useState } from "react";
import DataTable, { type Column } from "../_components/DataTable";

type PayloadRow = {
  id: number;
  provider: string;
  capturedAt: string;
  routeKey: string | null;
  status: string | null;
  parsedCount: number | null;
  parseError: string | null;
  bodyBytes: number;
};

type PathSummary = { shape: string; count: number; sample: string | number };

type Detail = {
  id: number;
  provider: string;
  capturedAt: string;
  routeKey: string | null;
  status: string | null;
  parsedCount: number | null;
  parseError: string | null;
  bodyBytes: number;
  bodyKind: string;
  raw: string;
  pretty: string | null;
  paths: PathSummary[];
  replay: { name: string; price: number; currency: string; priceNote?: string | null }[];
  replayError: string | null;
  replayDiffers: boolean;
  rides: { id: number; rideName: string; price: string; etaMin: number | null }[];
};

const PROVIDERS = ["uber", "ola", "rapido"] as const;

export default function PayloadsClient() {
  const [rows, setRows] = useState<PayloadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<string>("");
  const [outcome, setOutcome] = useState("all");
  const [range, setRange] = useState("day");
  const [routeKey, setRouteKey] = useState("");

  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"pretty" | "raw" | "normalized">("pretty");

  useEffect(() => {
    const controller = new AbortController();
    // Fetched inline rather than through a helper so no state is written
    // synchronously during the effect, and so a filter change aborts the
    // request it supersedes.
    (async () => {
      try {
        const params = new URLSearchParams({
          outcome,
          range,
          page: String(page),
          limit: "25",
        });
        if (provider) params.set("provider", provider);
        if (routeKey) params.set("routeKey", routeKey);

        const res = await fetch(`/api/admin/payloads?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("failed");
        const json = (await res.json()) as { data: PayloadRow[]; total: number };
        if (controller.signal.aborted) return;
        setRows(json.data ?? []);
        setTotal(json.total ?? 0);
      } catch {
        if (!controller.signal.aborted) setRows([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [provider, outcome, range, routeKey, page]);

  const open = async (id: number) => {
    setDetail(null);
    setTab("pretty");
    const res = await fetch(`/api/admin/payloads/${id}`);
    if (!res.ok) return;
    const json = (await res.json()) as { data: Detail };
    setDetail(json.data);
  };

  const columns: Column<PayloadRow>[] = [
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <span className="badge badge--blue">{row.provider}</span>,
    },
    {
      key: "capturedAt",
      header: "Captured",
      cell: (row) => new Date(row.capturedAt).toLocaleTimeString(),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => row.status ?? "—",
    },
    {
      key: "parsedCount",
      header: "Rides",
      cell: (row) => (
        <span
          className={`badge ${
            row.parseError
              ? "badge--red"
              : row.parsedCount === 0
                ? "badge--amber"
                : "badge--green"
          }`}
        >
          {row.parsedCount ?? 0}
        </span>
      ),
    },
    {
      key: "bodyBytes",
      header: "Size",
      cell: (row) => `${(row.bodyBytes / 1024).toFixed(1)} KB`,
    },
    {
      key: "routeKey",
      header: "Route",
      cell: (row) =>
        row.routeKey ? (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setRouteKey(row.routeKey!);
              setPage(1);
            }}
            title="Filter to this route"
          >
            {row.routeKey.slice(0, 18)}…
          </button>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <button className="btn btn--ghost btn--sm" onClick={() => open(row.id)}>
          Inspect
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payload console</h1>
        <p className="page-subtitle">
          Every provider response, success and failure. These are undocumented APIs
          that change without notice, so this is what turns a breakage into a
          five-minute fix.
        </p>
      </div>

      <div className="table-toolbar" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
        <select
          className="select"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All providers</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={outcome}
          onChange={(e) => {
            setOutcome(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All outcomes</option>
          <option value="parsed">Parsed cleanly</option>
          <option value="failed">Parse failed</option>
          <option value="empty">Parsed to nothing</option>
        </select>

        <select
          className="select"
          value={range}
          onChange={(e) => {
            setRange(e.target.value);
            setPage(1);
          }}
        >
          <option value="hour">Last hour</option>
          <option value="day">Last 24 hours</option>
          <option value="week">Last 7 days</option>
          <option value="all">All time</option>
        </select>

        {routeKey && (
          <button className="btn btn--ghost btn--sm" onClick={() => setRouteKey("")}>
            Clear route filter
          </button>
        )}
      </div>

      <DataTable
        data={rows}
        columns={columns}
        total={total}
        page={page}
        limit={25}
        onPageChange={setPage}
        isLoading={loading}
        emptyMessage="No payloads recorded yet. Run a fare search to populate this."
      />

      {detail && (
        <div className="chart-card" style={{ marginTop: "2rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <h2 className="chart-title" style={{ margin: 0 }}>
              Payload #{detail.id} · {detail.provider} · {detail.bodyKind}
            </h2>
            <button className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>

          {detail.parseError && (
            <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
              {detail.parseError}
            </div>
          )}

          {detail.replayDiffers && (
            <div className="alert alert--info" style={{ marginBottom: "1rem" }}>
              Today&apos;s parser produces {detail.replay.length} rides from this body,
              but {detail.parsedCount ?? 0} were recorded at capture time. That gap is
              usually the parser change you are looking for.
            </div>
          )}

          {detail.paths.length > 0 && (
            <div style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                Likely fare fields
              </h3>
              <div style={{ display: "grid", gap: "0.3rem" }}>
                {detail.paths.slice(0, 8).map((p) => (
                  <div
                    key={p.shape}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      fontSize: "0.78rem",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span style={{ color: "var(--text-primary)" }}>{p.shape}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      ×{p.count} · e.g. {String(p.sample)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {(["pretty", "raw", "normalized"] as const).map((t) => (
              <button
                key={t}
                className={`btn btn--sm ${tab === t ? "btn--primary" : "btn--ghost"}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "normalized" ? (
            detail.replay.length > 0 ? (
              <ul style={{ display: "grid", gap: "0.35rem", fontSize: "0.82rem" }}>
                {detail.replay.map((o) => (
                  <li
                    key={o.name}
                    style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}
                  >
                    <span style={{ color: "var(--text-primary)" }}>{o.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      ₹{o.price}
                      {o.priceNote ? ` · ${o.priceNote}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {detail.replayError ?? "The current parser produces nothing from this body."}
              </p>
            )
          ) : (
            <pre
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "1rem",
                fontSize: "0.75rem",
                maxHeight: "460px",
                overflow: "auto",
                color: "var(--text-primary)",
              }}
            >
              {tab === "pretty" ? (detail.pretty ?? detail.raw) : detail.raw}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
