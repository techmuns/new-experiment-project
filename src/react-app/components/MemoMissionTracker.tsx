import {
  Check,
  Crosshair,
  FileCheck2,
  Search,
  Sparkles,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn";
import type { MissionStep, MissionStepId } from "../lib/missionTrackerState";

// Phase 5I: workflow-progress rail. Five small step nodes with a thin
// connector that fills as steps complete. Professional copy only —
// rendered eyebrow is "Workflow progress" (NOT "mission").
const ICONS: Record<MissionStepId, LucideIcon> = {
  upload: UploadCloud,
  detect: Crosshair,
  research: Search,
  generate: Sparkles,
  review: FileCheck2,
};

interface MemoMissionTrackerProps {
  steps: MissionStep[];
}

export function MemoMissionTracker({ steps }: MemoMissionTrackerProps) {
  const completedCount = steps.filter((s) => s.status === "complete").length;
  return (
    <section
      className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-5 py-4"
      aria-label="Workflow progress"
    >
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]">
          Workflow progress
        </div>
        <div className="text-[11px] tnum text-[var(--color-text-muted)]">
          {completedCount} of {steps.length} complete
        </div>
      </header>
      <ol className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-0 relative">
        {steps.map((step, i) => (
          <li key={step.id} className="relative">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "hidden md:block absolute top-5 left-1/2 right-0 h-[2px] -translate-y-1/2 transition-colors",
                  step.status === "complete"
                    ? "bg-[var(--color-ink)]"
                    : "bg-[var(--color-border)]",
                )}
                style={{ width: "calc(100% - 2.5rem)" }}
              />
            )}
            <StepNode step={step} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepNode({ step }: { step: MissionStep }) {
  const Icon = ICONS[step.id];
  const isComplete = step.status === "complete";
  const isActive = step.status === "active";
  return (
    <div className="flex flex-col items-start md:items-center text-left md:text-center gap-2 px-2 relative">
      <div
        className={cn(
          "relative w-10 h-10 rounded-full border-2 grid place-items-center shrink-0 transition-colors",
          isComplete &&
            "bg-[var(--color-ink)] border-[var(--color-ink)] text-white shadow-[var(--shadow-sm)]",
          isActive &&
            "bg-[var(--color-surface)] border-[var(--color-ink)] text-[var(--color-ink)]",
          !isComplete &&
            !isActive &&
            "bg-[var(--color-surface)] border-[var(--color-border-strong)] text-[var(--color-text-subtle)]",
        )}
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute inset-[-4px] rounded-full ring-2 ring-[var(--color-ink)]/15 animate-pulse"
          />
        )}
        {isComplete ? (
          <Check className="w-4 h-4" strokeWidth={2.5} />
        ) : (
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        )}
        <span
          className={cn(
            "absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold grid place-items-center border",
            isComplete || isActive
              ? "bg-[var(--color-surface)] border-[var(--color-ink)] text-[var(--color-ink)]"
              : "bg-[var(--color-surface)] border-[var(--color-border-strong)] text-[var(--color-text-subtle)]",
          )}
        >
          {step.index}
        </span>
      </div>
      <div className="space-y-0.5 md:max-w-[160px]">
        <div
          className={cn(
            "text-[12px] font-semibold tracking-tight transition-colors",
            isComplete || isActive
              ? "text-[var(--color-text)]"
              : "text-[var(--color-text-subtle)]",
          )}
        >
          {step.label}
        </div>
        <div className="text-[10.5px] text-[var(--color-text-muted)] leading-snug">
          {step.helper}
        </div>
      </div>
    </div>
  );
}
