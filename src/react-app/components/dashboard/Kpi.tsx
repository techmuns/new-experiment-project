import type { ReactNode } from "react";

export type KpiTrend = "up" | "down" | "flat";

/**
 * A single KPI inside a WidgetCard body. KPIs must be meaningful: label,
 * value, optional trend/comparison, and scope. Status color is used only
 * when it adds meaning.
 */
export function Kpi({
  label,
  value,
  delta,
  trend = "flat",
  scope,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: KpiTrend;
  scope?: string;
}) {
  const trendColor =
    trend === "up" ? "#16a34a" : trend === "down" ? "#dc2626" : "#6b7280";
  return (
    <div style={{ padding: "14px 16px" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9ca3af",
        }}
      >
        {label}
      </div>
      <div
        className="tnum"
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "#111827",
          lineHeight: 1.1,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {(delta || scope) && (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {delta && (
            <span style={{ fontSize: 12, fontWeight: 600, color: trendColor }}>
              {delta}
            </span>
          )}
          {scope && (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{scope}</span>
          )}
        </div>
      )}
    </div>
  );
}
