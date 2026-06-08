import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type {
  ResearchFinding,
  ResearchFindingImpact,
  ResearchFindings,
} from "@shared/types";
import { Badge } from "./ui/Badge";
import { Panel } from "./ui/Panel";

const IMPACT_TONE: Record<ResearchFindingImpact, "success" | "warning" | "neutral" | "accent"> = {
  positive: "success",
  negative: "warning",
  neutral: "neutral",
  watch: "accent",
};

const IMPACT_LABEL: Record<ResearchFindingImpact, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
  watch: "Watch",
};

interface ResearchFindingsCardProps {
  research: ResearchFindings;
}

export function ResearchFindingsCard({ research }: ResearchFindingsCardProps) {
  return (
    <Panel
      eyebrow="Research findings"
      title={`${research.company} · ${research.researchWindow.startIsoMonth} → ${research.researchWindow.endIsoMonth}`}
      actions={
        <Badge tone="ink" dot>
          {research.findings.length} finding{research.findings.length === 1 ? "" : "s"}
        </Badge>
      }
    >
      {research.thesisCheckpointImpact.length > 0 && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2.5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)] mb-1">
            Thesis checkpoint impact
          </div>
          <ul className="space-y-1">
            {research.thesisCheckpointImpact.map((c) => (
              <li
                key={c.checkpointId}
                className="text-[12px] text-[var(--color-text)] leading-snug"
              >
                <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                  {c.checkpointId}
                </span>{" "}
                <CheckpointImpactBadge impact={c.impact} /> {c.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {research.findings.length === 0 ? (
        <p className="text-[12.5px] italic text-[var(--color-text-muted)]">
          No findings emitted by the model.
        </p>
      ) : (
        <ul className="space-y-3">
          {research.findings.map((f) => (
            <FindingRow key={f.id} finding={f} />
          ))}
        </ul>
      )}

      {research.unresolvedQuestions.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)] mb-1">
            Unresolved questions
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {research.unresolvedQuestions.map((q, i) => (
              <li key={i} className="text-[12px] text-[var(--color-text)]">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {research.warnings.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {research.warnings.map((w, i) => (
            <li
              key={i}
              className="text-[11.5px] text-[var(--color-warning)] inline-flex items-start gap-1.5 leading-snug"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FindingRow({ finding }: { finding: ResearchFinding }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="px-3 py-2.5 flex items-start gap-3">
        <Badge tone={IMPACT_TONE[finding.impact]} dot>
          {IMPACT_LABEL[finding.impact]}
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[var(--color-text)] leading-tight">
            {finding.title}
          </div>
          <div className="text-[11px] text-[var(--color-text-subtle)] mt-0.5 font-mono">
            {finding.id} · {finding.category}
          </div>
          <p className="text-[12.5px] text-[var(--color-text)] mt-1.5 leading-relaxed">
            {finding.summary}
          </p>
          <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1 leading-relaxed italic">
            {finding.relevance}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-1.5 border-t border-[var(--color-border)] text-[11.5px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] inline-flex items-center gap-1.5"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        Sources ({finding.sources.length})
      </button>
      {open && (
        <ul className="px-3 py-2.5 space-y-1.5 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)]">
          {finding.sources.length === 0 ? (
            <li className="text-[11.5px] italic text-[var(--color-text-muted)]">
              No source attached — needs manual verification.
            </li>
          ) : (
            finding.sources.map((s, i) => (
              <li
                key={`${s.url}-${i}`}
                className="text-[12px] leading-snug flex items-start gap-1.5"
              >
                {s.verifiedByWebSearch && (
                  <CheckCircle2
                    className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--color-success)]"
                    aria-label="Verified by web_search"
                  />
                )}
                <div className="min-w-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[var(--color-ink)] hover:underline inline-flex items-center gap-1"
                  >
                    {s.title || s.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                    {s.date ? `${s.date} · ` : ""}
                    {s.url}
                  </div>
                  {s.note && (
                    <div className="text-[11px] text-[var(--color-text-muted)] italic mt-0.5">
                      {s.note}
                    </div>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

function CheckpointImpactBadge({
  impact,
}: {
  impact: "supported" | "challenged" | "no_update";
}) {
  const tone =
    impact === "supported"
      ? "success"
      : impact === "challenged"
        ? "warning"
        : "neutral";
  const label =
    impact === "supported"
      ? "supported"
      : impact === "challenged"
        ? "challenged"
        : "no update";
  return <Badge tone={tone}>{label}</Badge>;
}
