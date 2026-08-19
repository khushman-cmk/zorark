"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type Column } from "../_components/DataTable";
import ConfirmModal from "../_components/ConfirmModal";
import CsvUpload from "../_components/CsvUpload";

interface FuelPrice {
  id: string;
  state: string;
  city: string;
  fuelType: string;
  pricePerLitre: string;
  updatedAt: string;
}

function FuelTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = { petrol: "badge--blue", e20: "badge--green", diesel: "badge--amber" };
  return <span className={`badge ${map[type] ?? "badge--gray"}`}>{type.toUpperCase()}</span>;
}

function staleDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default function FuelPricesPage() {
  const [data, setData] = useState<FuelPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [fuelTypeFilter, setFuelTypeFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FuelPrice | null>(null);
  const [editTarget, setEditTarget] = useState<FuelPrice | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [alert, setAlert] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [addForm, setAddForm] = useState({ state: "", city: "", fuelType: "petrol", pricePerLitre: "" });
  const [addOpen, setAddOpen] = useState(false);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stateFilter) params.set("state", stateFilter);
    if (cityFilter) params.set("city", cityFilter);
    if (fuelTypeFilter) params.set("fuelType", fuelTypeFilter);
    const res = await fetch(`/api/admin/fuel-prices?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setLoading(false);
  }, [stateFilter, cityFilter, fuelTypeFilter]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  async function handleUpdate() {
    if (!editTarget || !editPrice) return;
    const res = await fetch(`/api/admin/fuel-prices/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePerLitre: parseFloat(editPrice) }),
    });
    if (res.ok) { setAlert({ type: "success", msg: "Price updated." }); fetchPrices(); }
    else setAlert({ type: "error", msg: "Update failed." });
    setEditTarget(null);
  }

  async function handleAdd() {
    const res = await fetch("/api/admin/fuel-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, pricePerLitre: parseFloat(addForm.pricePerLitre) }),
    });
    if (res.ok) {
      setAlert({ type: "success", msg: "Entry added." });
      setAddForm({ state: "", city: "", fuelType: "petrol", pricePerLitre: "" });
      setAddOpen(false);
      fetchPrices();
    } else {
      setAlert({ type: "error", msg: "Failed to add entry." });
    }
  }

  const columns: Column<FuelPrice>[] = [
    { key: "state", header: "State" },
    { key: "city", header: "City" },
    { key: "fuelType", header: "Fuel Type", cell: (fp) => <FuelTypeBadge type={fp.fuelType} /> },
    {
      key: "pricePerLitre",
      header: "Price/L (₹)",
      cell: (fp) => (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
          ₹{parseFloat(fp.pricePerLitre).toFixed(2)}
        </span>
      ),
    },
    {
      key: "updatedAt",
      header: "Last Updated",
      cell: (fp) => {
        const days = staleDays(fp.updatedAt);
        return (
          <span style={{ color: days > 7 ? "var(--accent-amber)" : "var(--text-muted)", fontSize: "0.75rem" }}>
            {days === 0 ? "Today" : `${days}d ago`}
          </span>
        );
      },
    },
    {
      key: "id",
      header: "Actions",
      cell: (fp) => (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button className="btn btn--sm btn--ghost" onClick={() => { setEditTarget(fp); setEditPrice(fp.pricePerLitre); }}>
            Edit
          </button>
          <button className="btn btn--sm btn--danger" onClick={() => setDeleteTarget(fp)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Price Dataset</h1>
        <p className="page-subtitle">Manage petrol, E20 and diesel prices across India</p>
      </div>

      {alert && (
        <div className={`alert alert--${alert.type}`}>
          {alert.type === "success" ? "✅" : "❌"} {alert.msg}
          <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }} onClick={() => setAlert(null)}>✕</button>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Bulk Update via CSV
        </h2>
        <CsvUpload
          endpoint="/api/admin/fuel-prices/csv"
          templateHint="state, city, fuel_type, price_per_litre"
          onSuccess={({ upserted, errors, total }) => {
            setAlert({ type: "success", msg: `CSV uploaded: ${upserted}/${total} upserted, ${errors.length} errors.` });
            fetchPrices();
          }}
          onError={(msg) => setAlert({ type: "error", msg })}
        />
      </div>

      <div className="section-divider" />

      <div className="table-container">
        <div className="table-toolbar">
          <input className="input" style={{ maxWidth: 160 }} placeholder="Filter by state…" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} />
          <input className="input" style={{ maxWidth: 160 }} placeholder="Filter by city…" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
          <select className="select" value={fuelTypeFilter} onChange={(e) => setFuelTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="petrol">Petrol</option>
            <option value="e20">E20</option>
            <option value="diesel">Diesel</option>
          </select>
          <button className="btn btn--primary btn--sm" style={{ marginLeft: "auto" }} onClick={() => setAddOpen(true)}>
            + Add Entry
          </button>
        </div>

        <DataTable
          data={data}
          columns={columns}
          total={data.length}
          page={1}
          limit={data.length || 1}
          onPageChange={() => {}}
          isLoading={loading}
          emptyMessage="No fuel price entries. Add one or upload a CSV."
        />
      </div>

      <ConfirmModal
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title={`Edit Price — ${editTarget?.city}, ${editTarget?.state}`}
        description={`Current: ₹${editTarget ? parseFloat(editTarget.pricePerLitre).toFixed(2) : ""}/L (${editTarget?.fuelType?.toUpperCase()})`}
        confirmLabel="Update"
        onConfirm={handleUpdate}
      >
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          value={editPrice}
          onChange={(e) => setEditPrice(e.target.value)}
          placeholder="New price per litre"
          style={{ marginTop: "0.75rem" }}
        />
      </ConfirmModal>

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Fuel Price"
        description={`Remove ${deleteTarget?.fuelType?.toUpperCase()} price for ${deleteTarget?.city}, ${deleteTarget?.state}?`}
        confirmLabel="Delete"
        danger
        onConfirm={() => deleteTarget && fetch(`/api/admin/fuel-prices/${deleteTarget.id}`, { method: "DELETE" }).then(() => fetchPrices())}
      />

      <ConfirmModal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Fuel Price Entry"
        description="Fill in all fields to add a new price entry."
        confirmLabel="Add Entry"
        onConfirm={handleAdd}
      >
        <div className="form-grid" style={{ marginTop: "0.75rem" }}>
          <div className="form-field">
            <label className="form-label">State</label>
            <input className="input" value={addForm.state} onChange={(e) => setAddForm((f) => ({ ...f, state: e.target.value }))} placeholder="e.g. Maharashtra" />
          </div>
          <div className="form-field">
            <label className="form-label">City</label>
            <input className="input" value={addForm.city} onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))} placeholder="e.g. Mumbai" />
          </div>
          <div className="form-field">
            <label className="form-label">Fuel Type</label>
            <select className="select" value={addForm.fuelType} onChange={(e) => setAddForm((f) => ({ ...f, fuelType: e.target.value }))}>
              <option value="petrol">Petrol</option>
              <option value="e20">E20</option>
              <option value="diesel">Diesel</option>
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Price/Litre (₹)</label>
            <input className="input" type="number" step="0.01" value={addForm.pricePerLitre} onChange={(e) => setAddForm((f) => ({ ...f, pricePerLitre: e.target.value }))} placeholder="e.g. 94.50" />
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
}
