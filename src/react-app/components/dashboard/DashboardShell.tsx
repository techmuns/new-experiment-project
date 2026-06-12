import type { ReactNode } from "react";
import { TickerPill } from "./TickerPill";

interface DashboardShellProps {
  title: string;
  ticker?: string;
  company?: string;
  /** Header controls (view toggle, filter, refresh, export). */
  headerActions?: ReactNode;
  /** Optional Zone 3 sticky footer (~40px). Omit if not needed. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Mandatory 3-zone iframe shell (skill UI Standards):
 *   Zone 1 — sticky 48px header
 *   Zone 2 — scrollable content (the ONLY scroll area)
 *   Zone 3 — optional sticky footer (~40px)
 * Fills the iframe with height:100vh; the page itself never scrolls.
 */
export function DashboardShell({
  title,
  ticker,
  company,
  headerActions,
  footer,
  children,
}: DashboardShellProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background:
          "linear-gradient(to bottom, rgba(249, 250, 251, 0.8), #ffffff)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      {/* Zone 1 — Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 48,
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #e5e7eb",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            {title}
          </h1>
          {ticker && <TickerPill ticker={ticker} company={company} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {headerActions}
        </div>
      </header>

      {/* Zone 2 — Scrollable content (only scroll area) */}
      <main style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        {children}
      </main>

      {/* Zone 3 — Optional sticky footer */}
      {footer && (
        <footer
          style={{
            flexShrink: 0,
            height: 40,
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(8px)",
            borderTop: "1px solid #e5e7eb",
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          {footer}
        </footer>
      )}
    </div>
  );
}
