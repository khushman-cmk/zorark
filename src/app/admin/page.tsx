"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatCard from "./_components/StatCard";

interface DashboardData {
  totalUsers: number;
  newUsersThisWeek: number;
  tripsByType: { type: string; count: number }[];
  topDestinations: { destination: string; count: number }[];
  fuelPricesLastUpdated: string | null;
}

const QUICK_LINKS = [
  { href: "/admin/users", icon: "👥", label: "Manage Users" },
  { href: "/admin/fuel-prices", icon: "⛽", label: "Fuel Prices" },
  { href: "/admin/providers", icon: "🚗", label: "Providers" },
  { href: "/admin/trips", icon: "📊", label: "Trip Analytics" },
  { href: "/admin/tolls", icon: "🛣️", label: "Toll Plazas" },
  { href: "/admin/logs", icon: "📋", label: "Audit Log" },
];

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function isStale(iso: string | null) {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > 7 * 24 * 60 * 60 * 1000;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const vehicleTrips = data?.tripsByType.find((t) => t.type === "vehicle")?.count ?? 0;
  const travelTrips = data?.tripsByType.find((t) => t.type === "travel")?.count ?? 0;
  const totalTrips = vehicleTrips + travelTrips;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Platform overview at a glance</p>
      </div>

      {/* Fuel prices freshness banner */}
      <div className="last-updated-banner">
        <span
          className={`last-updated-dot ${isStale(data?.fuelPricesLastUpdated ?? null) ? "last-updated-dot--stale" : ""}`}
        />
        <span>
          Fuel prices last updated:{" "}
          <strong>{loading ? "…" : formatDate(data?.fuelPricesLastUpdated ?? null)}</strong>
          {isStale(data?.fuelPricesLastUpdated ?? null) && !loading && (
            <span style={{ marginLeft: "0.5rem", color: "var(--accent-amber)" }}>
              ⚠️ Data may be stale — consider updating
            </span>
          )}
        </span>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="stat-grid">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card" style={{ minHeight: 96 }}>
              <div className="loading-shimmer" style={{ height: 60, margin: 0, flex: 1 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="stat-grid">
          <StatCard
            label="Total Users"
            value={data?.totalUsers ?? 0}
            sub={`+${data?.newUsersThisWeek ?? 0} this week`}
            icon="👥"
            accent="blue"
          />
          <StatCard
            label="Total Trips"
            value={totalTrips}
            sub={`${vehicleTrips} vehicle · ${travelTrips} travel`}
            icon="🗺️"
            accent="green"
          />
          <StatCard
            label="Vehicle Trips"
            value={vehicleTrips}
            icon="🚘"
            accent="amber"
          />
          <StatCard
            label="Travel Bookings"
            value={travelTrips}
            icon="🚆"
            accent="blue"
          />
        </div>
      )}

      {/* Top Destinations */}
      {!loading && (data?.topDestinations?.length ?? 0) > 0 && (
        <div className="table-container" style={{ marginBottom: "2rem" }}>
          <div className="table-toolbar">
            <h2 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
              Top 5 Destinations
            </h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Destination</th>
                <th>Trip Count</th>
              </tr>
            </thead>
            <tbody>
              {data!.topDestinations.map((row, i) => (
                <tr key={row.destination}>
                  <td style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {i + 1}
                  </td>
                  <td>{row.destination}</td>
                  <td>
                    <span className="badge badge--blue">{row.count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Links */}
      <div>
        <h2 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Quick Navigation
        </h2>
        <div className="quick-links-grid">
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="quick-link">
              <span className="quick-link-icon">{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
