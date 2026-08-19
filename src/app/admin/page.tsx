"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatCard from "./_components/StatCard";
import { Users, UserPlus, Car, CarFront, Plane, Droplet, Calendar, ClipboardList, FileText, Zap } from "lucide-react";

interface DashboardData {
  totalUsers: number;
  newUsersThisWeek: number;
  activeUsers: number;
  tripsToday: number;
  tripsByType: { type: string; count: number }[];
  topDestinations: { destination: string; count: number }[];
  fuelPricesLastUpdated: string | null;
  recentActivity: {
    id: string;
    action: string;
    details: any;
    targetTable: string | null;
    targetId: string | null;
    createdAt: string;
    adminName: string | null;
  }[];
}

const QUICK_ACTIONS = [
  { href: "/admin/users", icon: <Users size={18} />, label: "Manage Users" },
  { href: "/admin/fuel-prices", icon: <Droplet size={18} />, label: "Update Fuel Prices" },
  { href: "/admin/providers", icon: <Car size={18} />, label: "Manage Providers" },
  { href: "/admin/trips", icon: <ClipboardList size={18} />, label: "View Trips" },
  { href: "/admin/logs", icon: <FileText size={18} />, label: "Audit Logs" },
  { href: "/admin/reports", icon: <FileText size={18} />, label: "Reports" },
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

  // Default to a 1 week range
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState(weekAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams();
    if (startDate) query.append("startDate", startDate);
    if (endDate) query.append("endDate", endDate);

    fetch(`/api/admin/dashboard?${query.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const vehicleTrips = data?.tripsByType?.find((t) => t.type === "vehicle")?.count ?? 0;
  const travelTrips = data?.tripsByType?.find((t) => t.type === "travel")?.count ?? 0;
  const totalTrips = vehicleTrips + travelTrips;
  const vehiclePct = totalTrips ? Math.round((vehicleTrips / totalTrips) * 100) : 0;
  const travelPct = totalTrips ? Math.round((travelTrips / totalTrips) * 100) : 0;

  return (
    <div>
      {/* Page Controls */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", background: "#ffffff", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
          <Calendar size={16} />
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            style={{ border: "none", outline: "none", color: "inherit", background: "transparent", cursor: "pointer" }} 
          />
          <span> - </span>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            style={{ border: "none", outline: "none", color: "inherit", background: "transparent", cursor: "pointer" }} 
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <StatCard
          label="Total Users"
          value={data?.totalUsers ?? 0}
          sub={`+${data?.newUsersThisWeek ?? 0} this week ↗`}
          icon={<div style={{background: "#ffe4e6", color: "#ff2a75", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%"}}><Users size={20} /></div>}
          accent="blue"
        />
        <StatCard
          label="New Signups"
          value={data?.newUsersThisWeek ?? 0}
          sub={`+12.4% this week ↗`}
          icon={<div style={{background: "#e0e7ff", color: "#4f46e5", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%"}}><UserPlus size={20} /></div>}
          accent="blue"
        />
        <StatCard
          label="Total Trips"
          value={totalTrips}
          sub={`+10.6% this week ↗`}
          icon={<div style={{background: "#dbeafe", color: "#2563eb", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%"}}><Car size={20} /></div>}
          accent="blue"
        />
        <StatCard
          label="My Vehicle Trips"
          value={vehicleTrips}
          sub={`${vehiclePct}% of total`}
          icon={<div style={{background: "#ffedd5", color: "#ea580c", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%"}}><CarFront size={20} /></div>}
          accent="amber"
        />
        <StatCard
          label="Booked Travel Trips"
          value={travelTrips}
          sub={`${travelPct}% of total`}
          icon={<div style={{background: "#dcfce7", color: "#16a34a", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%"}}><Plane size={20} /></div>}
          accent="green"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
        {/* Trips by Type Donut */}
        <div className="chart-card">
          <h2 className="chart-title">Trips by Type</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <div style={{ position: "relative", width: 140, height: 140, borderRadius: "50%", background: `conic-gradient(#ff2a75 ${vehiclePct}%, #fbcfe8 ${vehiclePct}% 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--text-primary)" }}>{totalTrips}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Trips</span>
              </div>
            </div>
            <div>
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span style={{ color: "#ff2a75" }}>●</span> My Vehicle Trips</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginLeft: "1.25rem" }}>{vehicleTrips} ({vehiclePct}%)</div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span style={{ color: "#fbcfe8" }}>●</span> Booked Travel Trips</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginLeft: "1.25rem" }}>{travelTrips} ({travelPct}%)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Destinations */}
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
            {!data?.topDestinations?.length && !loading && <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No data</div>}
          </div>
        </div>

        {/* Fuel Prices */}
        <div className="chart-card" style={{ display: "flex", flexDirection: "column" }}>
          <h2 className="chart-title" style={{ margin: "0 0 0.5rem 0" }}>Fuel Prices</h2>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            Last updated <Calendar size={14} /> {loading ? "..." : formatDate(data?.fuelPricesLastUpdated ?? null)}
          </div>
          <div style={{ flex: 1, background: "rgba(255, 42, 117, 0.05)", borderRadius: "12px", padding: "1.5rem", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff", color: "#ff2a75", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <Droplet size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {isStale(data?.fuelPricesLastUpdated ?? null) ? "Fuel price data may be stale." : "Fuel price data is up to date."}
                </div>
              </div>
            </div>
            <Link href="/admin/fuel-prices" className="btn" style={{ background: "#fff", border: "1px solid #ff2a75", color: "#ff2a75", width: "100%", justifyContent: "center" }}>
              Manage Fuel Prices →
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Quick Actions</h2>
        <div style={{ display: "flex", gap: "1rem" }}>
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.href} href={action.href} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", background: "#ffffff", border: "1px solid var(--border)", padding: "1rem", borderRadius: "12px", textDecoration: "none", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.875rem", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              <span style={{ color: "#ff2a75", display: "flex" }}>{action.icon}</span> {action.label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
        {/* Recent Activity */}
        <div className="table-container">
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
                  <td style={{ color: "var(--text-secondary)" }}>
                    {typeof log.details === "string" ? log.details : JSON.stringify(log.details) || "Performed action"}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {log.targetTable ? `${log.targetTable} (#${log.targetId?.slice(-4) || '???'})` : "System"}
                  </td>
                  <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {formatDate(log.createdAt)}
                  </td>
                </tr>
              ))}
              {!data?.recentActivity?.length && !loading && (
                <tr>
                  <td colSpan={5} className="table-empty-cell">No recent activity</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* System Overview */}
        <div className="table-container" style={{ padding: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1.5rem 0", fontSize: "1rem", fontWeight: 700 }}>System Overview</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 600 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-green)" }}></div>
                Active Users
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{data?.activeUsers ?? 0}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--accent-green)", background: "var(--accent-green-dim)", padding: "0.1rem 0.4rem", borderRadius: "999px" }}>+6.8%</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 600 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-blue)" }}></div>
                Trips Today
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{data?.tripsToday ?? 0}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--accent-green)", background: "var(--accent-green-dim)", padding: "0.1rem 0.4rem", borderRadius: "999px" }}>+9.3%</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 600 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-amber)" }}></div>
                Avg. Trip Dist.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>14.2 km</span>
                <span style={{ fontSize: "0.75rem", color: "var(--accent-green)", background: "var(--accent-green-dim)", padding: "0.1rem 0.4rem", borderRadius: "999px" }}>+0.2</span>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 600 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7" }}></div>
                Server Status
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-green)", fontSize: "0.875rem", fontWeight: 600 }}>
                All Systems Operational
                <span style={{ background: "var(--accent-green-dim)", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
              </div>
            </div>

          </div>
        </div>

      </div>

      <div style={{ textAlign: "center", marginTop: "3rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        © {new Date().getFullYear()} Zippi Admin Panel. All rights reserved.
      </div>
    </div>
  );
}
