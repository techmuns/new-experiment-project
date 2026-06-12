import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

/** Single shimmer bar. Compose several to skeleton a widget's final shape. */
export function ShimmerBar({
  height = 12,
  width = "100%",
  style,
}: {
  height?: number;
  width?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="shimmer" style={{ height, width, ...style }} aria-hidden />
  );
}

/** Loading state — shimmer skeleton, never a blank card or raw spinner. */
export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <ShimmerBar key={i} width={i === 0 ? "55%" : "100%"} />
      ))}
    </div>
  );
}

/** Empty state — centered, with a message and a next-step hint. */
export function EmptyState({
  icon,
  message,
  hint,
}: {
  icon?: ReactNode;
  message: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        minHeight: 160,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 8,
        padding: 24,
      }}
    >
      <div style={{ color: "#9ca3af" }}>
        {icon ?? <Inbox size={28} strokeWidth={1.5} />}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {message}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "#9ca3af", maxWidth: 320 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/** Error state — friendly, centered, never a raw stack trace. */
export function ErrorState({
  message = "Something went wrong loading this widget.",
  hint = "Please try again later.",
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        minHeight: 160,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 8,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "#fef2f2",
          display: "grid",
          placeItems: "center",
          color: "#ef4444",
        }}
      >
        <AlertTriangle size={20} strokeWidth={2} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {message}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>{hint}</div>
    </div>
  );
}
