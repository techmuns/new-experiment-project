import type { CSSProperties, ReactNode } from "react";
import { CategoryBadge, type Category } from "./CategoryBadge";

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  category?: Category;
  /** Optional controls rendered on the right of the header (after badge). */
  headerActions?: ReactNode;
  /** Span two grid columns on wide layouts (primary analysis / detail). */
  wide?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * The single card shell every data widget uses (skill UI Standards).
 * Do not nest cards. The body hosts charts, tables, KPIs, source trails,
 * and the loading/empty/error states.
 */
export function WidgetCard({
  title,
  subtitle,
  category,
  headerActions,
  wide,
  children,
  style,
}: WidgetCardProps) {
  return (
    <div
      className="widget-card"
      style={{
        background: "rgba(255, 255, 255, 0.9)",
        border: "1px solid rgba(229, 231, 235, 0.8)",
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(8px)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        gridColumn: wide ? "span 2" : undefined,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid rgba(229, 231, 235, 0.8)",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(8px)",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 11,
                color: "#9ca3af",
                lineHeight: 1.3,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {headerActions}
          {category && <CategoryBadge category={category} />}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "rgba(249,250,251,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
