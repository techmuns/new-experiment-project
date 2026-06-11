import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Anchor,
  ChevronDown,
  ChevronRight,
  FileSearch,
  GitMerge,
  Layers,
  Loader2,
  MessageSquareQuote,
  RefreshCw,
  Scale,
  Settings as SettingsIcon,
  ShieldQuestion,
  Sparkles,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  MemoUnderstanding,
  MemoUnderstandingFlagCategory,
  MemoUnderstandingFlaggedDetail,
  MemoUnderstandingState,
} from "@shared/types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";
import {
  summarizeUnderstanding,
  topFlagged,
} from "../lib/memoUnderstandingSummary";

// Phase 6A: Memo Intelligence Snapshot card.
// States: idle (provider not ready), loading (auto-run in progress),
// success (full snapshot, collapsible — expanded on first show), error
// (Rerun memo analysis primary, Open Settings if readiness-related;
// emergency "Research with basic extraction only" hidden under a
// <details> disclosure).

interface MemoUnderstandingCardProps {
  state: MemoUnderstandingState;
  providerNotReady: boolean;
  gateBlocking: boolean;
  onRerun: () => void;
  onEmergencySkip: () => void;
  skipUnderstanding: boolean;
}

const CATEGORY_ICON: Record<MemoUnderstandingFlagCategory, LucideIcon> = {
  valuation_anchor: Anchor,
  financial_claim: TrendingUp,
  segment_driver: Layers,
  margin_driver: Activity,
  earnings_quality: Scale,
  management_claim: MessageSquareQuote,
  catalyst: Zap,
  risk: AlertTriangle,
  source_gap: FileSearch,
  contradiction: GitMerge,
  must_verify: ShieldQuestion,
};

const CATEGORY_LABEL: Record<MemoUnderstandingFlagCategory, string> = {
  valuation_anchor: "Valuation anchor",
  financial_claim: "Financial claim",
  segment_driver: "Segment driver",
  margin_driver: "Margin driver",
  earnings_quality: "Earnings quality",
  management_claim: "Management claim",
  catalyst: "Catalyst",
  risk: "Risk",
  source_gap: "Source gap",
  contradiction: "Contradiction",
  must_verify: "Must verify",
};

export function MemoUnderstandingCard({
  state,
  providerNotReady,
  gateBlocking,
  onRerun,
  onEmergencySkip,
  skipUnderstanding,
}: MemoUnderstandingCardProps) {
  const [expanded, setExpanded] = useState(true);

  if (state.kind === "idle" && providerNotReady) {
    return (
      <Frame title="Memo intelligence">
        <p className="text-[12.5px] text-[var(--color-text-muted)] leading-relaxed">
          Memo understanding will run once OpenAI is configured.{" "}
          <Link
            to="/settings"
            className="text-[var(--color-ink)] font-semibold hover:underline"
          >
            Open Settings
          </Link>{" "}
          to set <code className="font-mono">OPENAI_API_KEY</code>.
        </p>
      </Frame>
    );
  }

  if (state.kind === "loading") {
    return (
      <Frame title="Memo intelligence · Analyzing memo…">
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--color-ink)]" />
          Reading the uploaded memo and extracting thesis, flagged details, and a memo-specific research plan.
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] animate-pulse"
            />
          ))}
        </div>
      </Frame>
    );
  }

  if (state.kind === "error") {
    // Phase 6A.1 added timeout-specific copy. Phase 6A.2 adds parse_error
    // copy distinct from the generic error branch. Both retry paths use
    // the "Rerun compact memo analysis" label so the user understands
    // the retry is the compact-first path.
    const isTimeout = state.code === "timeout";
    const isParseError = state.code === "parse_error";
    const headline = isTimeout
      ? "Memo analysis timed out. Try compact rerun."
      : isParseError
        ? "Memo analysis returned malformed JSON."
        : "We couldn't extract a structured understanding of this memo.";
    const subtitle = isTimeout
      ? "We couldn't finish the memo analysis in time. Rerun keeps it compact and is usually faster."
      : isParseError
        ? "The model response was not valid structured data. Rerun compact memo analysis to repair the output."
        : null;
    const rerunLabel =
      isTimeout || isParseError ? "Rerun compact memo analysis" : "Rerun memo analysis";
    return (
      <Frame title="Memo intelligence · Understanding failed">
        <div className="flex items-start gap-2 text-[12.5px] text-[var(--color-warning)] leading-snug">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{headline}</div>
            {subtitle && (
              <div className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 leading-snug">
                {subtitle}
              </div>
            )}
            <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
              {state.code} · {state.message}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onRerun}
            leadingIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            {rerunLabel}
          </Button>
          {(providerNotReady || gateBlocking) && (
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] transition-colors"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Open Settings
            </Link>
          )}
        </div>
        <details className="mt-4 group">
          <summary className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)] cursor-pointer hover:text-[var(--color-text-muted)] inline-flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
            Developer / emergency
          </summary>
          <div className="mt-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warning)_22%,white)] bg-[var(--color-warning-soft)] px-3 py-2.5">
            <p className="text-[11.5px] text-[var(--color-warning)] leading-snug">
              Research will fall back to generic company prompts; results will be less memo-specific. Use only if memo understanding keeps failing for this memo.
            </p>
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onEmergencySkip}
                disabled={skipUnderstanding}
              >
                {skipUnderstanding ? "Skipped" : "Research with basic extraction only"}
              </Button>
            </div>
          </div>
        </details>
      </Frame>
    );
  }

  if (state.kind === "success") {
    return (
      <SuccessSnapshot
        understanding={state.understanding}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        onRerun={onRerun}
      />
    );
  }

  return null;
}

function SuccessSnapshot({
  understanding,
  expanded,
  onToggle,
  onRerun,
}: {
  understanding: MemoUnderstanding;
  expanded: boolean;
  onToggle: () => void;
  onRerun: () => void;
}) {
  const summary = summarizeUnderstanding(understanding);
  const visibleFlags = topFlagged(understanding, 5);
  const allFlags = understanding.flaggedDetails;
  const extraFlagCount = Math.max(0, allFlags.length - visibleFlags.length);

  const confidenceTone =
    summary.confidence === "high"
      ? "success"
      : summary.confidence === "medium"
        ? "neutral"
        : "warning";

  const headerChips: Array<{ label: string; value: string; tone?: "success" | "neutral" | "warning" }> = [];
  if (understanding.memo.recommendation) {
    headerChips.push({
      label: "Recommendation",
      value: understanding.memo.recommendation,
    });
  }
  if (understanding.memo.targetPrice) {
    headerChips.push({ label: "Target", value: understanding.memo.targetPrice });
  }
  if (understanding.memo.publishedDate) {
    headerChips.push({
      label: "Dated",
      value: understanding.memo.publishedDate,
    });
  }
  if (understanding.memo.upsideAtMemo) {
    headerChips.push({
      label: "Upside",
      value: understanding.memo.upsideAtMemo,
    });
  }

  const top3Tasks = understanding.researchPlan.researchTasks.slice(0, 3);

  return (
    <section
      className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-5 py-4"
      aria-label="Memo intelligence"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]">
            Memo intelligence
          </div>
          <div className="mt-0.5 text-[13.5px] font-semibold tracking-tight text-[var(--color-text)]">
            {understanding.company.detectedName || "Memo analyzed"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone={confidenceTone} dot>
            Confidence: {summary.confidence}
          </Badge>
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {headerChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {headerChips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 h-6 px-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[11.5px]"
            >
              <span className="font-mono uppercase tracking-[0.08em] text-[9px] text-[var(--color-text-subtle)]">
                {c.label}
              </span>
              <span className="font-semibold text-[var(--color-text)]">
                {c.value}
              </span>
            </span>
          ))}
        </div>
      )}

      {understanding.summary.oneLineSummary && (
        <p
          className="text-[14px] font-medium text-[var(--color-text)] leading-relaxed"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {understanding.summary.oneLineSummary}
        </p>
      )}
      {expanded && understanding.summary.shortSummary && (
        <p
          className="mt-2 text-[12.5px] text-[var(--color-text-muted)] leading-relaxed"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {understanding.summary.shortSummary}
        </p>
      )}

      {expanded && visibleFlags.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)] mb-2">
            Critical flags
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {visibleFlags.map((flag) => (
              <FlagRow key={flag.id} flag={flag} />
            ))}
          </div>
          {extraFlagCount > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer">
                Show all {allFlags.length} flags
              </summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {allFlags
                  .filter((f) => !visibleFlags.some((v) => v.id === f.id))
                  .map((flag) => (
                    <FlagRow key={flag.id} flag={flag} />
                  ))}
              </div>
            </details>
          )}
        </div>
      )}

      {expanded && understanding.thesis.thesisPillars.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)] mb-2">
            Thesis pillars
          </div>
          <ul className="space-y-1.5">
            {understanding.thesis.thesisPillars.slice(0, 6).map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 text-[12px] text-[var(--color-text)]"
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    p.researchPriority === "must_check"
                      ? "bg-[var(--color-warning)]"
                      : p.researchPriority === "important"
                        ? "bg-[var(--color-ink)]"
                        : "bg-[var(--color-text-subtle)]",
                  )}
                />
                <span className="truncate">{p.label}</span>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-subtle)] shrink-0">
                  {p.researchPriority.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && top3Tasks.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)] mb-1.5">
            <Sparkles className="w-3 h-3" />
            Research plan preview
          </div>
          <p className="text-[12px] text-[var(--color-text)] leading-relaxed">
            <span className="font-semibold">
              {summary.researchQuestionCount}
            </span>{" "}
            memo-specific question{summary.researchQuestionCount === 1 ? "" : "s"} queued — focused on{" "}
            {top3Tasks.map((t, i) => (
              <span key={t.id}>
                {i > 0 && (i === top3Tasks.length - 1 ? ", and " : ", ")}
                <span className="italic">{t.memoAnchor || t.question.slice(0, 80)}</span>
              </span>
            ))}
            .
          </p>
        </div>
      )}

      {expanded && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onRerun}
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Rerun memo analysis
          </button>
        </div>
      )}
    </section>
  );
}

function FlagRow({ flag }: { flag: MemoUnderstandingFlaggedDetail }) {
  const Icon = CATEGORY_ICON[flag.category];
  const importanceTone =
    flag.importance === "critical"
      ? "warning"
      : flag.importance === "high"
        ? "accent"
        : "neutral";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-ink)]" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] font-semibold text-[var(--color-text)] truncate">
              {flag.label}
            </span>
            <Badge tone={importanceTone}>{flag.importance}</Badge>
          </div>
          <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--color-text-subtle)] mt-0.5">
            {CATEGORY_LABEL[flag.category]}
          </div>
          <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1 leading-snug">
            {flag.whyItMatters}
          </p>
        </div>
      </div>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-5 py-4"
      aria-label="Memo intelligence"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)] mb-2">
        {title}
      </div>
      {children}
    </section>
  );
}
