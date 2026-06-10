import { CheckCircle2 } from "lucide-react";
import type { FollowUpMemo, ResearchFindings } from "@shared/types";
import { buildResearchSummary } from "../lib/researchSummary";

// Phase 5I: slim ribbon shown above MemoReview once a memo lands. Clean
// and restrained — no confetti, no loud colors, no emoji.

interface MemoCompletionBannerProps {
  memo: FollowUpMemo;
  research: ResearchFindings | null;
}

export function MemoCompletionBanner({ memo, research }: MemoCompletionBannerProps) {
  const relativeTime = formatRelative(memo.generatedAt);
  const sectionCount = memo.sections.length;
  const summary = research ? buildResearchSummary(research) : null;
  return (
    <section
      className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] border-l-4 border-l-[var(--color-success)] px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
      aria-label="Memo generated"
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <CheckCircle2
          className="w-5 h-5 text-[var(--color-success)]"
          strokeWidth={2}
        />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-[var(--color-text)]">
            Memo generated
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)]">
            Generated {relativeTime}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--color-text-muted)] sm:ml-auto">
        {research && (
          <span>
            Research {research.researchWindow.startIsoMonth} →{" "}
            {research.researchWindow.endIsoMonth}
          </span>
        )}
        {summary && (
          <span>
            <span className="font-semibold text-[var(--color-text)]">
              {summary.verifiedSourceFindings}/{summary.findings}
            </span>{" "}
            web-verified
          </span>
        )}
        <span>
          <span className="font-semibold text-[var(--color-text)]">
            {sectionCount}
          </span>{" "}
          {sectionCount === 1 ? "section" : "sections"}
        </span>
      </div>
    </section>
  );
}

function formatRelative(iso: string): string {
  const generated = Date.parse(iso);
  if (Number.isNaN(generated)) return "just now";
  const diffMs = Date.now() - generated;
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(generated).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
