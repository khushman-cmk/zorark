"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type Column } from "../_components/DataTable";
import ConfirmModal from "../_components/ConfirmModal";

interface Provider {
  id: string;
  name: string;
  vehicleType: string;
  baseFare: string;
  perKmRate: string;
  deepLinkTemplate: string;
  isActive: boolean;
}

const BLANK_FORM = { name: "", vehicleType: "", baseFare: "", perKmRate: "", deepLinkTemplate: "" };

export default function ProvidersPage() {
  const [data, setData] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [editTarget, setEditTarget] = useState<Provider | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [alert, setAlert] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/providers");
    const json = await res.json();
    setData(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  function testDeepLink(p: Provider) {
    const url = p.deepLinkTemplate
      .replace("{lat}", "28.6139").replace("{lng}", "77.2090")
      .replace("{dest_lat}", "19.0760").replace("{dest_lng}", "72.8777");
    window.open(url, "_blank");
  }

  async function toggleActive(p: Provider) {
    await fetch(`/api/admin/providers/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    fetchProviders();
  }

  async function handleSave() {
    const url = editTarget ? `/api/admin/providers/${editTarget.id}` : "/api/admin/providers";
    const method = editTarget ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, baseFare: parseFloat(form.baseFare), perKmRate: parseFloat(form.perKmRate) }),
    });
    if (res.ok) {
      setAlert({ type: "success", msg: editTarget ? "Provider updated." : "Provider added." });
      setEditTarget(null);
      setAddOpen(false);
      setForm(BLANK_FORM);
      fetchProviders();
    } else {
      setAlert({ type: "error", msg: "Save failed." });
    }
  }

  const columns: Column<Provider>[] = [
    { key: "name", header: "Provider Name", cell: (p) => <strong>{p.name}</strong> },
    { key: "vehicleType", header: "Vehicle Type" },
    { key: "baseFare", header: "Base Fare (₹)", cell: (p) => `₹${parseFloat(p.baseFare).toFixed(2)}` },
    { key: "perKmRate", header: "Per Km (₹)", cell: (p) => `₹${parseFloat(p.perKmRate).toFixed(2)}` },
    {
      key: "isActive",
      header: "Status",
      cell: (p) => (
        <label className="toggle-switch">
          <input type="checkbox" checked={p.isActive} onChange={() => toggleActive(p)} />
          <span className="toggle-track" />
        </label>
      ),
    },
    {
      key: "id",
      header: "Actions",
      cell: (p) => (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button className="btn btn--sm btn--ghost" onClick={() => { setEditTarget(p); setForm({ name: p.name, vehicleType: p.vehicleType, baseFare: p.baseFare, perKmRate: p.perKmRate, deepLinkTemplate: p.deepLinkTemplate }); }}>
            Edit
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => testDeepLink(p)} title="Test with Delhi→Mumbai dummy coords">
            🔗 Test
          </button>
          <button className="btn btn--sm btn--danger" onClick={() => setDeleteTarget(p)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  const formFields = (
    <div className="form-grid" style={{ marginTop: "0.75rem" }}>
      {[
        { key: "name", label: "Provider Name", placeholder: "e.g. Ola" },
        { key: "vehicleType", label: "Vehicle Type", placeholder: "e.g. Sedan" },
        { key: "baseFare", label: "Base Fare (₹)", placeholder: "50.00" },
        { key: "perKmRate", label: "Per Km Rate (₹)", placeholder: "12.00" },
      ].map(({ key, label, placeholder }) => (
        <div key={key} className="form-field">
          <label className="form-label">{label}</label>
          <input className="input" value={form[key as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} type={key.includes("Fare") || key.includes("Rate") ? "number" : "text"} step="0.01" />
        </div>
      ))}
      <div className="form-field" style={{ gridColumn: "1 / -1" }}>
        <label className="form-label">Deep Link Template</label>
        <input className="input" value={form.deepLinkTemplate} onChange={(e) => setForm((f) => ({ ...f, deepLinkTemplate: e.target.value }))} placeholder="https://provider.app/ride?lat={lat}&lng={lng}" />
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Travel Providers</h1>
        <p className="page-subtitle">Manage cab/travel providers shown in the booking screen</p>
      </div>

      {alert && (
        <div className={`alert alert--${alert.type}`}>
          {alert.type === "success" ? "✅" : "❌"} {alert.msg}
          <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }} onClick={() => setAlert(null)}>✕</button>
        </div>
      )}

      <div className="table-container">
        <div className="table-toolbar">
          <button className="btn btn--primary btn--sm" style={{ marginLeft: "auto" }} onClick={() => { setAddOpen(true); setForm(BLANK_FORM); }}>
            + Add Provider
          </button>
        </div>
        <DataTable data={data} columns={columns} total={data.length} page={1} limit={data.length || 1} onPageChange={() => {}} isLoading={loading} emptyMessage="No providers yet." />
      </div>

      <ConfirmModal open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setForm(BLANK_FORM); } }} title="Add Travel Provider" description="Fill in provider details." confirmLabel="Add" onConfirm={handleSave}>
        {formFields}
      </ConfirmModal>

      <ConfirmModal open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} title="Edit Provider" description="Update provider details." confirmLabel="Save" onConfirm={handleSave}>
        {formFields}
      </ConfirmModal>

      <ConfirmModal open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="Delete Provider" description={`Remove ${deleteTarget?.name}?`} confirmLabel="Delete" danger onConfirm={async () => { if (deleteTarget) { await fetch(`/api/admin/providers/${deleteTarget.id}`, { method: "DELETE" }); fetchProviders(); } }} />
    </div>
  );
}
