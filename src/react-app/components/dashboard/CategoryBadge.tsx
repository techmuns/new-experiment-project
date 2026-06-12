/** Category badge for widget headers — colors from the skill's table. */
export type Category =
  | "markets"
  | "crypto"
  | "analytics"
  | "tools"
  | "india"
  | "heatmaps"
  | "sector";

const CATEGORY_COLORS: Record<
  Category,
  { background: string; color: string; border: string }
> = {
  markets: { background: "#eff6ff", color: "#2563eb", border: "#dbeafe" },
  crypto: { background: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
  analytics: { background: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" },
  tools: { background: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  india: { background: "#fffbeb", color: "#d97706", border: "#fde68a" },
  heatmaps: { background: "#fff1f2", color: "#e11d48", border: "#fecdd3" },
  sector: { background: "#f0fdfa", color: "#0d9488", border: "#99f6e4" },
};

export function CategoryBadge({
  category,
  label,
}: {
  category: Category;
  label?: string;
}) {
  const c = CATEGORY_COLORS[category];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        padding: "2px 8px",
        borderRadius: 6,
        border: `1px solid ${c.border}`,
        background: c.background,
        color: c.color,
      }}
    >
      {label ?? category}
    </span>
  );
}
