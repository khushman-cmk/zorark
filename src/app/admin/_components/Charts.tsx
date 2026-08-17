"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

// ── Bar Chart ─────────────────────────────────────────────────────────────────

interface BarData {
  name: string;
  value: number;
}

interface AdminBarChartProps {
  data: BarData[];
  title: string;
  color?: string;
}

export function AdminBarChart({ data, title, color = "#3b82f6" }: AdminBarChartProps) {
  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: -10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Line Chart ────────────────────────────────────────────────────────────────

interface LineData {
  date: string;
  value: number;
}

interface AdminLineChartProps {
  data: LineData[];
  title: string;
  color?: string;
  valueLabel?: string;
}

export function AdminLineChart({
  data,
  title,
  color = "#10b981",
  valueLabel = "Value",
}: AdminLineChartProps) {
  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
          <Tooltip
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            name={valueLabel}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

interface DonutData {
  name: string;
  value: number;
}

interface AdminDonutChartProps {
  data: DonutData[];
  title: string;
}

export function AdminDonutChart({ data, title }: AdminDonutChartProps) {
  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            iconType="circle"
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
