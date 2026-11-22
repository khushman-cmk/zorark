"use client";

import { useCallback, useEffect, useState } from "react";
import ConfirmModal from "../_components/ConfirmModal";
import RemoteLogin from "./RemoteLogin";

type Connection = {
  provider: string;
  label: string;
  requiresSession: boolean;
  status: "connected" | "degraded" | "expired" | "disconnected" | "open";
  needsAttention: boolean;
  failStreak: number;
  capturedAt: string | null;
  refreshedAt: string | null;
  lastOkAt: string | null;
  lastFailAt: string | null;
  deviceProfileId: string | null;
  profileMismatch: boolean;
  breaker: { open: boolean; retryAfterSec: number; reason: string | null; trips: number };
  queueDepth: number;
  budgetUsed: number;
  dailyBudget: number;
};

const STATUS_BADGE: Record<Connection["status"], string> = {
  connected: "badge--green",
  degraded: "badge--amber",
  expired: "badge--red",
  disconnected: "badge--gray",
  open: "badge--blue",
};

const STATUS_TEXT: Record<Connection["status"], string> = {
  connected: "Connected",
  degraded: "Degraded",
  expired: "Expired",
  disconnected: "Not connected",
  open: "Anonymous",
};

function when(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default function ConnectionsClient() {
  const [rows, setRows] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Connection | null>(null);
  const [remoteTarget, setRemoteTarget] = useState<Connection | null>(null);

  const [tick, setTick] = useState(0);
  /** Re-runs the effect below. Safe to call from event handlers. */
  const load = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Fetched inline rather than through a helper so no state is written
    // synchronously during the effect, and so an unmount aborts in flight.
    (async () => {
      try {
        const res = await fetch("/api/admin/connections", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Could not load connections");
        const json = (await res.json()) as { data: Connection[] };
        if (!controller.signal.aborted) setRows(json.data ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setMessage("Could not load connection status.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [tick]);

  const probe = async (row: Connection) => {
    setProbing(row.provider);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/connections/${row.provider}`, { method: "POST" });
      const json = (await res.json()) as { alive: boolean | null; note?: string };
      setMessage(
        json.alive === null
          ? `${row.label}: ${json.note ?? "no cheap probe available"}`
          : json.alive
            ? `${row.label} session is alive.`
            : `${row.label} session is not alive.`,
      );
      load();
    } catch {
      setMessage(`Could not probe ${row.label}.`);
    } finally {
      setProbing(null);
    }
  };

  const disconnect = async (row: Connection) => {
    try {
      await fetch(`/api/admin/connections/${row.provider}`, { method: "DELETE" });
      setMessage(`${row.label} disconnected.`);
      load();
    } catch {
      setMessage(`Could not disconnect ${row.label}.`);
    }
  };

  const attention = rows.filter((r) => r.needsAttention);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Provider connections</h1>
        <p className="page-subtitle">
          The shared Uber and Ola accounts that answer every visitor&apos;s fare query.
          Rapido is anonymous and needs no connection.
        </p>
      </div>

      {attention.length > 0 && (
        <div className="alert alert--error" style={{ marginBottom: "1.5rem" }}>
          {attention.map((r) => r.label).join(" and ")}{" "}
          {attention.length === 1 ? "needs" : "need"} reconnecting. Visitors are being
          served cached prices, clearly marked as stale, in the meantime.
        </div>
      )}

      {message && (
        <div className="alert alert--info" style={{ marginBottom: "1.5rem" }}>
          {message}
        </div>
      )}

      <div className="stat-grid">
        {rows.map((row) => (
          <div key={row.provider} className="stat-card" data-testid={`conn-${row.provider}`}>
            <div className="stat-body">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                <h3 className="stat-value" style={{ fontSize: "1.1rem" }}>
                  {row.label}
                </h3>
                <span className={`badge ${STATUS_BADGE[row.status]}`}>
                  {STATUS_TEXT[row.status]}
                </span>
              </div>

              <dl style={{ display: "grid", gap: "0.4rem", fontSize: "0.8rem", margin: 0 }}>
                <Row label="Last success" value={when(row.lastOkAt)} />
                <Row label="Last failure" value={when(row.lastFailAt)} />
                {row.requiresSession && (
                  <>
                    <Row label="Captured" value={when(row.capturedAt)} />
                    <Row label="Refreshed" value={when(row.refreshedAt)} />
                    <Row label="Fail streak" value={String(row.failStreak)} />
                  </>
                )}
                <Row
                  label="Today's usage"
                  value={`${row.budgetUsed} / ${row.dailyBudget}`}
                />
                <Row label="Queue depth" value={String(row.queueDepth)} />
                {row.breaker.open && (
                  <Row
                    label="Breaker"
                    value={`open, retry in ${row.breaker.retryAfterSec}s`}
                  />
                )}
                {row.profileMismatch && (
                  <Row label="Device profile" value="mismatched — reconnect" />
                )}
              </dl>

              {row.requiresSession && (
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginTop: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => setRemoteTarget(row)}
                    data-testid={`connect-${row.provider}`}
                  >
                    Connect here
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => probe(row)}
                    disabled={probing === row.provider}
                  >
                    {probing === row.provider ? "Probing…" : "Probe"}
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={() => setConfirmTarget(row)}
                    disabled={row.status === "disconnected"}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {loading && rows.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>Loading connection status…</p>
      )}

      <div className="chart-card" style={{ marginTop: "2rem" }}>
        <h2 className="chart-title">Two ways to connect</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.7 }}>
          <strong>Connect here</strong> drives a browser that lives on this server, so
          the session is minted and replayed from the same address. That avoids the
          residential-to-server address switch that fraud systems watch for.
        </p>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.7 }}>
          The CLI helper is the fallback. It opens a browser on your own machine with
          the same device profile, waits while you finish the phone and OTP login, then
          sends the captured session here.
        </p>
        <pre
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "0.9rem 1rem",
            fontSize: "0.8rem",
            overflowX: "auto",
            color: "var(--text-primary)",
          }}
        >
          npx tsx scripts/connect-helper.ts uber{"\n"}
          npx tsx scripts/connect-helper.ts ola
        </pre>
      </div>

      {remoteTarget && (
        <RemoteLogin
          provider={remoteTarget.provider}
          label={remoteTarget.label}
          onSaved={() => void load()}
          onClose={() => setRemoteTarget(null)}
        />
      )}

      <ConfirmModal
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={`Disconnect ${confirmTarget?.label ?? ""}?`}
        description="The stored session is deleted. Fare requests for this provider will serve cached prices, marked stale, until it is reconnected."
        confirmLabel="Disconnect"
        danger
        onConfirm={() => {
          if (confirmTarget) void disconnect(confirmTarget);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ margin: 0, color: "var(--text-primary)", fontWeight: 500 }}>{value}</dd>
    </div>
  );
}
