"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type Column } from "../_components/DataTable";
import ConfirmModal from "../_components/ConfirmModal";

interface TollPlaza {
  id: string;
  highwayName: string;
  plazaName: string;
  state: string;
  rateLight: string;
  rateMedium: string | null;
  rateHeavy: string | null;
}

const BLANK = { highwayName: "", plazaName: "", state: "", rateLight: "", rateMedium: "", rateHeavy: "" };

export default function TollsPage() {
  const [data, setData] = useState<TollPlaza[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<TollPlaza | null>(null);
  const [editTarget, setEditTarget] = useState<TollPlaza | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [alert, setAlert] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchTolls = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/tolls");
    const json = await res.json();
    setData(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTolls(); }, [fetchTolls]);

  async function handleSave() {
    const url = editTarget ? `/api/admin/tolls/${editTarget.id}` : "/api/admin/tolls";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        highwayName: form.highwayName,
        plazaName: form.plazaName,
        state: form.state,
        rateLight: parseFloat(form.rateLight),
        rateMedium: form.rateMedium ? parseFloat(form.rateMedium) : undefined,
        rateHeavy: form.rateHeavy ? parseFloat(form.rateHeavy) : undefined,
      }),
    });
    if (res.ok) {
      setAlert({ type: "success", msg: editTarget ? "Toll updated." : "Toll added." });
      setEditTarget(null);
      setAddOpen(false);
      setForm(BLANK);
      fetchTolls();
    } else {
      setAlert({ type: "error", msg: "Save failed." });
    }
  }

  const formFields = (
    <div className="form-grid" style={{ marginTop: "0.75rem" }}>
      {[
        { key: "highwayName", label: "Highway Name", placeholder: "NH-48" },
        { key: "plazaName", label: "Plaza Name", placeholder: "Sohna Toll" },
        { key: "state", label: "State", placeholder: "Haryana" },
        { key: "rateLight", label: "Light Vehicle (₹)", placeholder: "65" },
        { key: "rateMedium", label: "Medium (₹) (optional)", placeholder: "120" },
        { key: "rateHeavy", label: "Heavy (₹) (optional)", placeholder: "250" },
      ].map(({ key, label, placeholder }) => (
        <div key={key} className="form-field">
          <label className="form-label">{label}</label>
          <input
            className="input"
            value={form[key as keyof typeof form] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            type={key.includes("rate") || key.includes("Rate") ? "number" : "text"}
            step="0.01"
          />
        </div>
      ))}
    </div>
  );

  const columns: Column<TollPlaza>[] = [
    { key: "highwayName", header: "Highway" },
    { key: "plazaName", header: "Plaza Name" },
    { key: "state", header: "State" },
    { key: "rateLight", header: "Light (₹)", cell: (t) => `₹${parseFloat(t.rateLight).toFixed(0)}` },
    { key: "rateMedium", header: "Medium (₹)", cell: (t) => (t.rateMedium ? `₹${parseFloat(t.rateMedium).toFixed(0)}` : "—") },
    { key: "rateHeavy", header: "Heavy (₹)", cell: (t) => (t.rateHeavy ? `₹${parseFloat(t.rateHeavy).toFixed(0)}` : "—") },
    {
      key: "id",
      header: "Actions",
      cell: (t) => (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button className="btn btn--sm btn--ghost" onClick={() => { setEditTarget(t); setForm({ highwayName: t.highwayName, plazaName: t.plazaName, state: t.state, rateLight: t.rateLight, rateMedium: t.rateMedium ?? "", rateHeavy: t.rateHeavy ?? "" }); }}>
            Edit
          </button>
          <button className="btn btn--sm btn--danger" onClick={() => setDeleteTarget(t)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Toll Plazas</h1>
        <p className="page-subtitle">Curated toll rate reference data (NHAI)</p>
      </div>

      {alert && (
        <div className={`alert alert--${alert.type}`}>
          {alert.type === "success" ? "✅" : "❌"} {alert.msg}
          <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }} onClick={() => setAlert(null)}>✕</button>
        </div>
      )}

      <div className="table-container">
        <div className="table-toolbar">
          <button className="btn btn--primary btn--sm" style={{ marginLeft: "auto" }} onClick={() => { setAddOpen(true); setForm(BLANK); }}>
            + Add Plaza
          </button>
        </div>
        <DataTable data={data} columns={columns} total={data.length} page={1} limit={data.length || 1} onPageChange={() => {}} isLoading={loading} emptyMessage="No toll plazas yet." />
      </div>

      <ConfirmModal open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setForm(BLANK); } }} title="Add Toll Plaza" description="Enter toll plaza details." confirmLabel="Add" onConfirm={handleSave}>
        {formFields}
      </ConfirmModal>

      <ConfirmModal open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} title="Edit Toll Plaza" description="Update toll rates." confirmLabel="Save" onConfirm={handleSave}>
        {formFields}
      </ConfirmModal>

      <ConfirmModal open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="Delete Toll Plaza" description={`Remove ${deleteTarget?.plazaName}?`} confirmLabel="Delete" danger onConfirm={async () => { if (deleteTarget) { await fetch(`/api/admin/tolls/${deleteTarget.id}`, { method: "DELETE" }); fetchTolls(); } }} />
    </div>
  );
}
