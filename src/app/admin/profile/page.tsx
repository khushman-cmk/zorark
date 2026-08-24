"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { User, Shield, Activity, AlertTriangle, Key, LogOut, CheckCircle } from "lucide-react";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(true);
  
  // State
  const [profile, setProfile] = useState<any>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [message, setMessage] = useState("");

  // Form states
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });

  useEffect(() => {
    fetchProfile();
    fetchSessions();
  }, []);

  const fetchProfile = async () => {
    const res = await fetch("/api/admin/profile");
    if (res.ok) {
      const data = await res.json();
      setProfile(data.user);
      setHistory(data.history);
    }
    setLoading(false);
  };

  const fetchSessions = async () => {
    const res = await fetch("/api/admin/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
      setCurrentSessionId(data.currentSessionId);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/admin/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
      headers: { "Content-Type": "application/json" }
    });
    if (res.ok) setMessage("Profile saved successfully");
    else setMessage("Failed to save profile");
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (passwords.new !== passwords.confirm) return setMessage("Passwords do not match");
    const res = await fetch("/api/admin/profile/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.new }),
      headers: { "Content-Type": "application/json" }
    });
    if (res.ok) {
      setMessage("Password updated");
      setPasswords({ current: "", new: "", confirm: "" });
    } else {
      const { error } = await res.json();
      setMessage(error || "Failed to update password");
    }
  };

  const revokeSession = async (id?: string) => {
    const res = await fetch("/api/admin/sessions", {
      method: "DELETE",
      body: JSON.stringify(id ? { sessionId: id } : { all: true }),
      headers: { "Content-Type": "application/json" }
    });
    if (res.ok) {
      fetchSessions();
      if (!id || id === currentSessionId) signOut();
    }
  };

  const accountAction = async (action: "deactivate" | "delete") => {
    if (!confirm(`Are you sure you want to ${action} your account?`)) return;
    const res = await fetch("/api/admin/profile/deactivate", {
      method: "POST",
      body: JSON.stringify({ action }),
      headers: { "Content-Type": "application/json" }
    });
    if (res.ok) signOut();
    else {
      const { error } = await res.json();
      alert(error);
    }
  };

  if (loading) return <div>Loading profile...</div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "2rem" }}>Profile Settings</h1>
      
      {message && <div style={{ padding: "1rem", background: "var(--surface-2)", marginBottom: "1rem", borderRadius: 8, borderLeft: "4px solid var(--accent-blue)" }}>{message}</div>}

      <div style={{ display: "flex", gap: "2rem" }}>
        {/* Sidebar Nav */}
        <div style={{ width: 250, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[
            { id: "general", icon: <User size={18} />, label: "General Info" },
            { id: "security", icon: <Shield size={18} />, label: "Security" },
            { id: "sessions", icon: <Activity size={18} />, label: "Sessions & Activity" },
            { id: "danger", icon: <AlertTriangle size={18} />, label: "Danger Zone" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", borderRadius: 8,
                border: "none", background: activeTab === tab.id ? "rgba(255, 42, 117, 0.1)" : "transparent",
                color: activeTab === tab.id ? "#ff2a75" : "var(--text-secondary)", cursor: "pointer", fontWeight: activeTab === tab.id ? 600 : 500,
                textAlign: "left"
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, background: "var(--surface-1)", padding: "2rem", borderRadius: 12, border: "1px solid var(--border)" }}>
          
          {activeTab === "general" && (
            <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#ff2a75", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: "bold" }}>
                  {profile.name?.charAt(0)}
                </div>
                <div>
                  <button type="button" className="btn btn-secondary">Upload Photo</button>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>JPG, GIF or PNG. Max size of 800K</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div>
                  <label className="label">Name</label>
                  <input className="input" value={profile.name || ""} onChange={e => setProfile({...profile, name: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={profile.email || ""} onChange={e => setProfile({...profile, email: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Phone Number</label>
                  <input className="input" value={profile.mobile || ""} onChange={e => setProfile({...profile, mobile: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Job Title / Designation</label>
                  <input className="input" value={profile.jobTitle || ""} onChange={e => setProfile({...profile, jobTitle: e.target.value})} />
                </div>
                <div>
                  <label className="label">Employee / Admin ID</label>
                  <input className="input" value={profile.employeeId || ""} onChange={e => setProfile({...profile, employeeId: e.target.value})} />
                </div>
                <div>
                  <label className="label">Recovery Email</label>
                  <input className="input" type="email" value={profile.recoveryEmail || ""} onChange={e => setProfile({...profile, recoveryEmail: e.target.value})} />
                </div>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          )}

          {activeTab === "security" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <form onSubmit={changePassword} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}><Key size={18} /> Change Password</h3>
                <div>
                  <label className="label">Current Password</label>
                  <input className="input" type="password" value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})} required />
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input className="input" type="password" value={passwords.new} onChange={e => setPasswords({...passwords, new: e.target.value})} required minLength={6} />
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input className="input" type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} required minLength={6} />
                </div>
                <div><button type="submit" className="btn btn-primary">Update Password</button></div>
              </form>

              <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}><Shield size={18} /> Two-Factor Authentication (2FA)</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Authenticator App</div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{profile.twoFactorEnabled ? "2FA is enabled." : "Protect your account with an extra layer of security."}</div>
                  </div>
                  <button type="button" className="btn btn-secondary">{profile.twoFactorEnabled ? "Disable" : "Enable"}</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "sessions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}><Activity size={18} /> Active Sessions</h3>
                  <button onClick={() => revokeSession()} className="btn btn-secondary" style={{ color: "var(--accent-red)", borderColor: "var(--accent-red)" }}>Log out all devices</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {sessions.map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", border: "1px solid var(--border)", borderRadius: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {s.device || "Unknown Device"} 
                          {s.id === currentSessionId && <span style={{ fontSize: "0.75rem", color: "var(--accent-green)", background: "var(--accent-green-dim)", padding: "0.1rem 0.4rem", borderRadius: 4 }}>Current</span>}
                        </div>
                        <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                          IP: {s.ipAddress} � Last active: {new Date(s.lastActive).toLocaleString()}
                        </div>
                      </div>
                      {s.id !== currentSessionId && (
                        <button onClick={() => revokeSession(s.id)} className="btn btn-secondary" style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}><LogOut size={14} /> Log out</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Login History</h3>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead style={{ background: "var(--surface-2)", textAlign: "left" }}>
                      <tr>
                        <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>Date & Time</th>
                        <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>IP Address</th>
                        <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>Device</th>
                        <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(h => (
                        <tr key={h.id}>
                          <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>{new Date(h.timestamp).toLocaleString()}</td>
                          <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>{h.ipAddress}</td>
                          <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>{h.device}</td>
                          <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                            {h.status === "success" ? <span style={{ color: "var(--accent-green)", display: "flex", alignItems: "center", gap: "0.25rem" }}><CheckCircle size={14} /> Success</span> : <span style={{ color: "var(--accent-red)", display: "flex", alignItems: "center", gap: "0.25rem" }}><AlertTriangle size={14} /> Failed</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "danger" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--accent-red)", marginBottom: "0.5rem" }}>Deactivate Account</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  Deactivating your account will suspend your access until another super admin reactivates it.
                </p>
                <button onClick={() => accountAction("deactivate")} className="btn" style={{ background: "transparent", border: "1px solid var(--accent-red)", color: "var(--accent-red)" }}>Deactivate Account</button>
              </div>
              <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--accent-red)", marginBottom: "0.5rem" }}>Delete Account</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button onClick={() => accountAction("delete")} className="btn" style={{ background: "var(--accent-red)", color: "#fff", border: "none" }}>Delete Account</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

