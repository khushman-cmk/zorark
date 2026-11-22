"use client";

import { useEffect, useState } from "react";
import StatCard from "./_components/StatCard";
import { Users, Calendar, Zap } from "lucide-react";

interface DashboardData {
  totalUsers: number;
  newUsersThisWeek: number;
  activeUsers: number;
  tripsInPeriod: number;
  totalTrips: number;
  tripsByType: { type: string; count: number }[];
  topDestinations: { destination: string; count: number }[];
  recentTrips: {
    id: string;
    userName: string;
    userEmail: string;
    type: string;
    origin: string;
    destination: string;
    createdAt: string;
  }[];
  recentSignups: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  }[];
  recentActivity: {
    id: string;
    action: string;
    details: unknown;
    targetTable: string | null;
    targetId: string | null;
    createdAt: string;
    adminName: string | null;
  }[];
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatDetails(details: unknown) {
  if (!details) return "Performed action";
  if (typeof details === "string") return details;
  if (typeof details !== "object") return String(details);
  if (details === null) return "Performed action";

  const entries = Object.entries(details);
  if (entries.length === 0) return "Performed action";

  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(", ");
}

function formatTripType(type: string) {
  return type === "vehicle" ? "Vehicle" : type === "travel" ? "Travel" : type;
}

function formatTripDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function tripTypeBadgeClass(type: string) {
  return type === "vehicle" ? "badge badge--blue" : "badge badge--green";
}

function formatRecentTripDetails(trip: DashboardData["recentTrips"][number]) {
  return {
    customer: trip.userName || trip.userEmail,
    route: `${trip.origin} → ${trip.destination}`,
    type: formatTripType(trip.type),
    date: formatTripDate(trip.createdAt),
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  // Default to a 1 week range
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState(weekAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);

  useEffect(() => {
    const query = new URLSearchParams();
    if (startDate) query.append("startDate", startDate);
    if (endDate) query.append("endDate", endDate);

    fetch(`/api/admin/dashboard?${query.toString()}`)
      .then((r) => r.json())
      .then(setData);
  }, [startDate, endDate]);

  const vehicleTrips = data?.tripsByType?.find((t) => t.type === "vehicle")?.count ?? 0;
  const travelTrips = data?.tripsByType?.find((t) => t.type === "travel")?.count ?? 0;
  const totalTrips = data?.totalTrips ?? vehicleTrips + travelTrips;
  const vehiclePct = totalTrips ? Math.round((vehicleTrips / totalTrips) * 100) : 0;
  const travelPct = totalTrips ? Math.round((travelTrips / totalTrips) * 100) : 0;

  return (
    <div className="admin-dashboard">
      {/* Page Controls */}
      <div className="dashboard-toolbar">
        <div className="dashboard-date-filter">
          <Calendar size={16} />
          <input
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            aria-label="Start date"
          />
          <span> - </span>
          <input
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            aria-label="End date"
          />
        </div>
      </div>

      {/* KPI Cards */}
      {data && <div className="stat-grid dashboard-kpis">
        <StatCard
          label="Total Users"
          value={data?.totalUsers ?? 0}
          sub="All customers"
          icon={<div style={{background: "var(--accent-pink-dim)", color: "var(--accent-pink)", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%"}}><Users size={20} /></div>}
          accent="blue"
        />
      </div>}

      {data && (totalTrips > 0 || data.topDestinations.length > 0) && (
        <div className="dashboard-analytics-grid">
        {/* Trips by Type Donut */}
        {totalTrips > 0 && (
          <div className="chart-card">
          <h2 className="chart-title">Trips by Type</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <div style={{ position: "relative", width: 140, height: 140, borderRadius: "50%", background: `conic-gradient(var(--accent-pink) ${vehiclePct}%, var(--surface-3) ${vehiclePct}% 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: "var(--surface-1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--text-primary)" }}>{totalTrips}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Trips</span>
              </div>
            </div>
            <div>
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span style={{ color: "#ff2a75" }}>●</span> Vehicle Trips</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginLeft: "1.25rem" }}>{vehicleTrips} ({vehiclePct}%)</div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span style={{ color: "#fbcfe8" }}>●</span> Travel Trips</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginLeft: "1.25rem" }}>{travelTrips} ({travelPct}%)</div>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Top Destinations */}
        {data.topDestinations.length > 0 && (
          <div className="chart-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h2 className="chart-title" style={{ margin: 0 }}>Top Destinations</h2>
            <select className="select" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
              <option>By Trips</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {(data?.topDestinations || []).map((row, i) => {
              const max = data?.topDestinations[0]?.count || 1;
              const pct = (row.count / max) * 100;
              return (
                <div key={row.destination} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ width: "20px", color: "var(--text-muted)", fontSize: "0.875rem" }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                      <span style={{ color: "var(--text-primary)" }}>{row.destination}</span>
                      <span style={{ fontWeight: 600 }}>{row.count}</span>
                    </div>
                    <div style={{ width: "100%", height: "4px", background: "var(--surface-2)", borderRadius: "2px" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#ff2a75", borderRadius: "2px" }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
        </div>
      )}

      {data && data.recentSignups.length > 0 && (
        <div className="table-container dashboard-section">
          <div className="table-toolbar">
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Recent Customer Signups</h2>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSignups.map((customer) => (
                  <tr key={customer.id}>
                    <td style={{ fontWeight: 600 }}>{customer.name}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{customer.email}</td>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatDate(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent customer rides */}
      {data && data.recentTrips.length > 0 && <div className="table-container dashboard-section">
        <div className="table-toolbar">
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Recent Customer Rides</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Route</th>
              <th>Type</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data?.recentTrips?.map((trip) => {
              const details = formatRecentTripDetails(trip);
              return (
                <tr key={trip.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 600 }}>{details.customer}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{trip.userEmail}</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{details.route}</td>
                  <td><span className={tripTypeBadgeClass(trip.type)}>{details.type}</span></td>
                  <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{details.date}</td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>}

      {data && (data.recentActivity.length > 0 || data.activeUsers > 0 || data.tripsInPeriod > 0) && <div className="dashboard-lower-grid">
        {/* Recent Activity */}
        {data && data.recentActivity.length > 0 && <div className="table-container">
          <div className="table-toolbar">
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Recent Activity</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Admin</th>
                <th>Details</th>
                <th>Target</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentActivity?.map((log) => (
                <tr key={log.id}>
                  <td style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "#ff2a75", display: "flex" }}><Zap size={16} /></span>
                    {log.action}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#ff2a75", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: "bold" }}>
                        {(log.adminName || "A").charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 500 }}>{log.adminName || "Unknown"}</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={typeof log.details === "string" ? log.details : JSON.stringify(log.details)}>
                    {formatDetails(log.details)}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {log.targetTable ? `${log.targetTable} (#${log.targetId?.slice(-4) || '???'})` : "System"}
                  </td>
                  <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {formatDate(log.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

        {/* Customer activity */}
        {data && (data.activeUsers > 0 || data.tripsInPeriod > 0) && <div className="table-container dashboard-activity">
          <div className="table-toolbar">
            <h2>Customer Activity</h2>
          </div>
          <div className="dashboard-activity-list">
            <div>
              <span>Active customers</span>
              <strong>{data?.activeUsers ?? 0}</strong>
            </div>
            <div>
              <span>Trips in selected period</span>
              <strong>{data?.tripsInPeriod ?? 0}</strong>
            </div>
          </div>
        </div>}
      </div>}

      <div className="dashboard-footer">
        © {new Date().getFullYear()} Zippi Admin Panel. All rights reserved.
      </div>
    </div>
  );
}
