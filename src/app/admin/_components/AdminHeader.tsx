"use client";

import React from "react";
import { Search, Bell, Menu } from "lucide-react";
import { useSession } from "next-auth/react";

export default function AdminHeader() {
  const { data: session } = useSession();
  const adminName = session?.user?.name || "Admin";

  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "1rem 2rem",
      background: "#ffffff",
      borderBottom: "1px solid var(--border)",
      marginBottom: "2rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button className="collapse-btn" style={{ fontSize: "1.25rem", border: "none", background: "none", cursor: "pointer", display: "none" /* for future use */ }}>
          <Menu size={20} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>Dashboard</h1>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>Welcome back, {adminName}!</p>
        </div>
      </div>
      
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <div style={{ position: "relative" }}>
          <input 
            type="text" 
            placeholder="Search anything..." 
            style={{
              padding: "0.6rem 1rem 0.6rem 2.5rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              fontSize: "0.875rem",
              outline: "none",
              width: "250px"
            }}
          />
          <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "flex" }}>
            <Search size={16} />
          </span>
        </div>
        
        <button style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex" }}>
          <Bell size={20} />
          <span style={{ position: "absolute", top: -2, right: -2, width: "8px", height: "8px", background: "var(--accent-pink, #ff2a75)", borderRadius: "50%" }}></span>
        </button>
        
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--accent-pink, #ff2a75)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", textTransform: "uppercase" }}>
            {adminName.charAt(0)}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>{adminName}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Super Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
