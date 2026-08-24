"use client";

import { useState } from "react";
import { Globe } from "lucide-react";

export default function SettingsPage() {
  const [language, setLanguage] = useState("en");

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "2rem" }}>Settings</h1>
      
      <div style={{ background: "var(--surface-1)", padding: "2rem", borderRadius: 12, border: "1px solid var(--accent-pink)" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <Globe size={18} /> Language Preferences
        </h3>
        
        <div style={{ maxWidth: 300 }}>
          <label className="label" style={{ display: "block", marginBottom: "0.5rem" }}>Select Language</label>
          <select 
            className="select" 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            style={{ width: "100%", padding: "0.75rem", borderRadius: "8px" }}
          >
            <option value="en">English (US)</option>
            <option value="es">Español (ES)</option>
            <option value="fr">Français (FR)</option>
            <option value="de">Deutsch (DE)</option>
            <option value="hi">हिन्दी (IN)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
