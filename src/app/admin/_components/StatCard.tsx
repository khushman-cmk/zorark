interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode | string;
  accent?: "blue" | "green" | "amber" | "red";
}

export default function StatCard({ label, value, sub, icon, accent = "blue" }: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${accent}`}>
      {icon && <span className="stat-icon">{icon}</span>}
      <div className="stat-body">
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {sub && <p className="stat-sub">{sub}</p>}
      </div>
    </div>
  );
}
