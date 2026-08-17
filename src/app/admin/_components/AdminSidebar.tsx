"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "⬛" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/fuel-prices", label: "Fuel Prices", icon: "⛽" },
  { href: "/admin/providers", label: "Providers", icon: "🚗" },
  { href: "/admin/trips", label: "Trip Analytics", icon: "📊" },
  { href: "/admin/tolls", label: "Toll Plazas", icon: "🛣️" },
  { href: "/admin/logs", label: "Audit Log", icon: "📋" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`admin-sidebar ${collapsed ? "admin-sidebar--collapsed" : ""}`}
    >
      {/* Header */}
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand">
            <span className="brand-icon">Z</span>
            <span className="brand-text">Zorark Admin</span>
          </div>
        )}
        <button
          className="collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? "nav-item--active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {isActive && !collapsed && <span className="nav-active-dot" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          className="signout-btn"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Sign out" : undefined}
        >
          <span className="nav-icon">🚪</span>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
