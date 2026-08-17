"use client";

import { useCallback, useEffect, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import DataTable from "../_components/DataTable";
import { AdminBarChart, AdminLineChart, AdminDonutChart } from "../_components/Charts";

interface Trip {
  id: string;
  userId: string;
  type: string;
  origin: string;
  destination: string;
  distanceKm: string | null;
  fuelCost: string | null;
  tollCost: string | null;
  routePreference: string | null;
  createdAt: string;
}

interface AnalyticsData {
  topDestinations: { destination: string; count: number }[];
  fuelTrend: { day: string; avg_cost: string; trip_count: string }[];
  tollSplit: { preference: string | null; count: number }[];
}

interface TripsResponse {
  data: Trip[];
  total: number;
  page: number;
  limit: number;
}

export default function TripsPage() {
  const [response, setResponse] = useState<TripsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (typeFilter) params.set("type", typeFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/admin/trips?${params}`);
    setResponse(await res.json());
    setLoading(false);
  }, [page, typeFilter, from, to]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const res = await fetch("/api/admin/trips?analytics=true");
    setAnalytics(await res.json());
    setAnalyticsLoading(false);
  }, []);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const barData = (analytics?.topDestinations ?? []).map((d) => ({
    name: d.destination.length > 14 ? d.destination.slice(0, 14) + "…" : d.destination,
    value: Number(d.count),
  }));

  const lineData = (analytics?.fuelTrend ?? []).map((d) => ({
    date: new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(new Date(d.day)),
    value: parseFloat(d.avg_cost ?? "0"),
  }));

  const donutData = (analytics?.tollSplit ?? [])
    .filter((d) => d.preference !== null)
    .map((d) => ({ name: d.preference === "toll" ? "With Toll" : "No Toll", value: Number(d.count) }));

  const columns: ColumnDef<Trip, unknown>[] = [
    {
      accessorKey: "type",
      header: "Type",
      cell: (i) => (
        <span className={`badge ${i.getValue() === "vehicle" ? "badge--blue" : "badge--green"}`}>
          {i.getValue() as string}
        </span>
      ),
    },
    { accessorKey: "origin", header: "Origin" },
    { accessorKey: "destination", header: "Destination" },
    {
      accessorKey: "distanceKm",
      header: "Distance",
      cell: (i) => (i.getValue() ? `${parseFloat(i.getValue() as string).toFixed(1)} km` : "—"),
    },
    {
      accessorKey: "fuelCost",
      header: "Fuel Cost",
      cell: (i) => (i.getValue() ? `₹${parseFloat(i.getValue() as string).toFixed(2)}` : "—"),
    },
    {
      accessorKey: "routePreference",
      header: "Route",
      cell: (i) => (
        <span className={`badge ${i.getValue() === "toll" ? "badge--amber" : "badge--gray"}`}>
          {(i.getValue() as string) ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: (i) =>
        new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(i.getValue() as string)),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Trip Analytics</h1>
        <p className="page-subtitle">Read-only insight into all trips across all users</p>
      </div>

      {/* Charts */}
      {analyticsLoading ? (
        <div className="loading-shimmer" style={{ height: 240, borderRadius: 12, marginBottom: "1rem" }} />
      ) : (
        <div className="charts-grid">
          <AdminBarChart
            data={barData}
            title="Top 10 Destinations by Trip Count"
            color="var(--accent-blue)"
          />
          <AdminLineChart
            data={lineData}
            title="Avg Fuel Cost per Trip (Last 30 Days)"
            valueLabel="Avg Cost (₹)"
            color="var(--accent-green)"
          />
          {donutData.length > 0 && (
            <AdminDonutChart data={donutData} title="Toll vs No-Toll Route Preference" />
          )}
        </div>
      )}

      {/* Trip List */}
      <div className="table-container">
        <div className="table-toolbar">
          <select className="select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            <option value="vehicle">Vehicle</option>
            <option value="travel">Travel</option>
          </select>
          <div className="form-field" style={{ flexDirection: "row", gap: "0.5rem", alignItems: "center" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap" }}>From</label>
            <input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: "auto" }} />
          </div>
          <div className="form-field" style={{ flexDirection: "row", gap: "0.5rem", alignItems: "center" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap" }}>To</label>
            <input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: "auto" }} />
          </div>
          {(typeFilter || from || to) && (
            <button className="btn btn--ghost btn--sm" onClick={() => { setTypeFilter(""); setFrom(""); setTo(""); setPage(1); }}>
              Clear
            </button>
          )}
        </div>
        <DataTable
          data={response?.data ?? []}
          columns={columns}
          total={response?.total ?? 0}
          page={page}
          limit={20}
          onPageChange={setPage}
          isLoading={loading}
          emptyMessage="No trips recorded yet."
        />
      </div>
    </div>
  );
}
