import { NavLink, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Plus,
  Cloud,
  CircleUser,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "../ui/Button";
import { useMemoProject } from "../../state/MemoProjectContext";
import { useHost } from "../../state/HostContext";
import { deriveCommandBarValues } from "./commandBarState";

export function CommandBar() {
  const navigate = useNavigate();
  const { state } = useMemoProject();
  const { context: host } = useHost();
  // Identify the signed-in user from the Munshot host when embedded; fall
  // back to the default account label when running outside the host.
  const userLabel =
    host.user?.email ?? host.user?.name ?? "tech@muns.io";
  const { projectLabel, trailingTicker, stageLabel, stageTone } =
    deriveCommandBarValues({
      detection: state.detection,
      periodOverride: state.periodOverride,
      extraction: state.extraction
        ? { source: { filename: state.extraction.source.filename } }
        : null,
      dna: state.dna,
      research: state.research,
      researchState: state.researchState,
      generatedMemo: state.generatedMemo,
      llm: state.llm,
    });

  const stageDot =
    stageTone === "success"
      ? "bg-[var(--color-success)]"
      : stageTone === "warning"
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--color-text-subtle)]";

  return (
    <header className="h-14 shrink-0 sticky top-0 z-30 bg-[var(--color-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80 border-b border-[var(--color-border)]">
      <div className="h-full px-5 flex items-center gap-3">
        <NavLink
          to="/workspace"
          className="flex items-center gap-2 pr-3 mr-1 border-r border-[var(--color-border)] h-8 rounded-[var(--radius-md)] hover:opacity-80 transition-opacity"
          aria-label="Memo Updater home"
        >
          <div className="w-7 h-7 rounded-[var(--radius-md)] bg-[var(--color-ink)] text-white grid place-items-center text-[11px] font-bold tracking-tight">
            M
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">
              Memo Updater
            </div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
              Buy-side cockpit
            </div>
          </div>
        </NavLink>

        <CommandChip
          label="Project"
          value={projectLabel}
          trailing={trailingTicker}
        />
        <ChevronRight className="w-3 h-3 text-[var(--color-text-subtle)]" />
        <CommandChip label="Stage" value={stageLabel} dot={stageDot} />
        <CommandChip
          label="Deploy"
          value="CF Workers"
          icon={<Cloud className="w-3 h-3" />}
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            leadingIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => navigate("/intake")}
          >
            New Memo Update
          </Button>
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-[var(--radius-md)] transition-colors ${
                isActive
                  ? "bg-[var(--color-ink-soft)] text-[var(--color-ink)] font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              }`
            }
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </NavLink>
          <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-[var(--color-border)] h-7 text-[12px] text-[var(--color-text-muted)]">
            <CircleUser className="w-4 h-4" />
            <span>{userLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function CommandChip({
  label,
  value,
  trailing,
  dot,
  icon,
}: {
  label: string;
  value: string;
  trailing?: string;
  dot?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 h-7 px-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {icon && <span className="text-[var(--color-text-subtle)]">{icon}</span>}
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
        {label}
      </span>
      <span className="text-[12px] font-medium text-[var(--color-text)] tracking-tight">
        {value}
      </span>
      {trailing && (
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] px-1 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
          {trailing}
        </span>
      )}
    </div>
  );
}
