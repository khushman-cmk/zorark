"use client";

import React, { useEffect, useState } from "react";
import { Search, Bell, Menu, Sun, Moon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";

export default function AdminHeader() {
  const { data: session } = useSession();
  const adminName = session?.user?.name || "Admin";
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "1rem 2rem",
      background: "var(--surface-1, #ffffff)",
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
              color: "var(--text-primary)",
              fontSize: "0.875rem",
              outline: "none",
              width: "250px"
            }}
          />
          <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "flex" }}>
            <Search size={16} />
          </span>
        </div>
        
        {mounted && (
          <button 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex" }}
            title="Toggle theme"
          >
            {theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        )}

        <div style={{ position: "relative" }}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex" }}
          >
            <Bell size={20} />
            <span style={{ position: "absolute", top: -2, right: -2, width: "8px", height: "8px", background: "var(--accent-pink, #ff2a75)", borderRadius: "50%", boxShadow: "var(--neon-glow, none)" }}></span>
          </button>
          
          {showNotifications && (
            <div style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "0.5rem",
              width: "300px",
              background: "var(--surface-1)",
              border: "1px solid var(--accent-pink)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
              zIndex: 50,
              overflow: "hidden"
            }}>
              <div style={{ padding: "1rem", borderBottom: "1px solid var(--border)", fontWeight: 600, color: "var(--text-primary)" }}>
                Notifications
              </div>
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {[
                  { id: 1, title: "New App Complaint", desc: "User reported crash on booking screen.", time: "10 min ago" },
                  { id: 2, title: "Driver Feedback", desc: "Driver #4295 reported navigation issue.", time: "1 hour ago" },
                  { id: 3, title: "New App Complaint", desc: "Payment failed for User #992.", time: "3 hours ago" }
                ].map(n => (
                  <div key={n.id} style={{ padding: "1rem", borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.2s" }} className="hover:bg-[var(--surface-2)]">
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>{n.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0" }}>{n.desc}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--accent-pink)" }}>{n.time}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "0.75rem", textAlign: "center", borderTop: "1px solid var(--border)", fontSize: "0.875rem", color: "var(--accent-pink)", cursor: "pointer" }}>
                View all reports
              </div>
            </div>
          )}
        </div>
        
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
