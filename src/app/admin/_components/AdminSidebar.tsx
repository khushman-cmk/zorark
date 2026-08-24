"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Users, Fuel, Car, BarChart3, Navigation, ClipboardList, FileText, Settings, LogOut, Home, User } from "lucide-react";

const MANAGEMENT_ITEMS = [
  { href: "/admin/users", label: "Users", icon: <Users size={18} /> },
  { href: "/admin/fuel-prices", label: "Fuel Prices", icon: <Fuel size={18} /> },
  { href: "/admin/trips", label: "Trips", icon: <BarChart3 size={18} /> },
  { href: "/admin/tolls", label: "Tolls", icon: <Navigation size={18} /> },
];

const SYSTEM_ITEMS = [
  { href: "/admin/logs", label: "Audit Logs", icon: <ClipboardList size={18} /> },
  { href: "/admin/reports", label: "Reports", icon: <FileText size={18} /> },
  { href: "/admin/settings", label: "Settings", icon: <Settings size={18} /> },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();
  const adminName = session?.user?.name || "Admin";

  return (
    <aside
      className={`admin-sidebar ${collapsed ? "admin-sidebar--collapsed" : ""}`}
      style={{
        background: "var(--surface-1)",
        color: "var(--text-primary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div className="sidebar-header" style={{ borderBottom: "1px solid var(--border)", padding: "1.5rem 1rem" }}>
        {!collapsed && (
          <div className="sidebar-brand">
            <span style={{ color: "var(--accent-pink)", fontSize: "1.5rem", fontWeight: "bold" }}>Z</span>
            <span className="brand-text" style={{ color: "var(--text-primary)", fontSize: "1.25rem" }}>Zippi</span>
          </div>
        )}
        <button
          className="collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" style={{ padding: "1rem" }}>
        <Link
          href="/admin"
          className={`nav-item ${pathname === "/admin" ? "nav-item--active" : ""}`}
          title={collapsed ? "Dashboard" : undefined}
          style={pathname === "/admin" ? { background: "var(--accent-pink)", color: "#fff", boxShadow: "var(--neon-glow, none)" } : { color: "var(--text-secondary)" }}
        >
          <span className="nav-icon"><Home size={18} /></span>
          {!collapsed && <span className="nav-label">Dashboard</span>}
        </Link>

        <Link
          href="/admin/profile"
          className={`nav-item ${pathname.startsWith("/admin/profile") ? "nav-item--active" : ""}`}
          title={collapsed ? "Profile" : undefined}
          style={pathname.startsWith("/admin/profile") ? { background: "var(--accent-pink-dim)", color: "var(--accent-pink)", boxShadow: "var(--neon-glow, none)" } : { color: "var(--text-secondary)" }}
        >
          <span className="nav-icon"><User size={18} /></span>
          {!collapsed && <span className="nav-label">Profile</span>}
          {pathname.startsWith("/admin/profile") && !collapsed && <span className="nav-active-dot" style={{ background: "var(--accent-pink)" }} />}
        </Link>

        {!collapsed && <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "var(--text-muted)", marginTop: "1.5rem", marginBottom: "0.5rem", paddingLeft: "0.75rem", textTransform: "uppercase" }}>Management</div>}
        
        {MANAGEMENT_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? "nav-item--active" : ""}`}
              title={collapsed ? item.label : undefined}
              style={isActive ? { background: "var(--accent-pink-dim)", color: "var(--accent-pink)", boxShadow: "var(--neon-glow, none)" } : { color: "var(--text-secondary)" }}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {isActive && !collapsed && <span className="nav-active-dot" style={{ background: "var(--accent-pink)" }} />}
            </Link>
          );
        })}

        {!collapsed && <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "var(--text-muted)", marginTop: "1.5rem", marginBottom: "0.5rem", paddingLeft: "0.75rem", textTransform: "uppercase" }}>System</div>}
        
        {SYSTEM_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? "nav-item--active" : ""}`}
              title={collapsed ? item.label : undefined}
              style={isActive ? { background: "var(--accent-pink-dim)", color: "var(--accent-pink)", boxShadow: "var(--neon-glow, none)" } : { color: "var(--text-secondary)" }}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {isActive && !collapsed && <span className="nav-active-dot" style={{ background: "var(--accent-pink)" }} />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer" style={{ borderTop: "1px solid var(--border)", padding: "1rem" }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", padding: "0.75rem", background: "var(--surface-2)", borderRadius: "8px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--accent-pink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", textTransform: "uppercase" }}>
              {adminName.charAt(0)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis" }}>{adminName}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Super Admin</span>
            </div>
          </div>
        )}
        <button
          className="signout-btn"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Sign out" : undefined}
          style={{ color: "var(--text-secondary)" }}
        >
          <span className="nav-icon"><LogOut size={18} /></span>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
