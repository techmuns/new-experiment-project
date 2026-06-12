import type { ReactNode } from "react";

/**
 * CSS-grid container for dashboard widgets. Cards collapse to one column on
 * narrow screens automatically; `wide` switches to the 480px min-width
 * variant for chart/table-heavy rows.
 */
export function WidgetGrid({
  children,
  wide,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 20,
        gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 480 : 340}px, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
