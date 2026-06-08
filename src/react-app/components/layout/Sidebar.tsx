import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import { cn } from "../../lib/cn";

const WORKFLOW = [
  { to: "/workspace", label: "Memo Workspace", icon: LayoutGrid, end: false },
];

const SYSTEM = [
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
];

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
      <nav className="flex-1 px-3 pt-5 pb-3 flex flex-col gap-6 overflow-y-auto">
        <NavGroup title="Workflow" items={WORKFLOW} />
        <NavGroup title="System" items={SYSTEM} />
      </nav>

      <div className="mx-3 mb-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)]">
          <ShieldCheck className="w-3 h-3" />
          Phase 5
        </div>
        <div className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-snug">
          Upload an old memo → AI researches what changed → generate a same-style follow-up.
        </div>
      </div>
    </aside>
  );
}

function NavGroup({
  title,
  items,
}: {
  title: string;
  items: typeof WORKFLOW;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">
        {title}
      </div>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-[var(--radius-md)] text-[13px] transition-colors",
              isActive
                ? "bg-[var(--color-ink-soft)] text-[var(--color-ink)] font-semibold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full transition-colors",
                  isActive ? "bg-[var(--color-ink)]" : "bg-transparent",
                )}
              />
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-text-subtle)] group-hover:text-[var(--color-text-muted)]",
                )}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
