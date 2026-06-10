import {
  Cloud,
  FileText,
  Loader2,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type {
  FollowUpMemo,
  LlmGenerationState,
  LlmStatusResponse,
  ResearchFindings,
  ResearchGenerationState,
  ResearchProgress,
  MemoGenerationProgress,
  ExtractionResult,
} from "@shared/types";
import { cn } from "../lib/cn";

// Phase 5I: "Workbench readiness" strip. Four compact status cards derived
// entirely from existing context state — no new fields, no new reducer
// actions. Professional, restrained copy.

type Tone = "neutral" | "active" | "success" | "warning";

interface ReadinessStripProps {
  llmProviderStatus: LlmStatusResponse | null;
  gateBlocking: boolean;
  extraction: ExtractionResult | null;
  research: ResearchFindings | null;
  researchState: ResearchGenerationState;
  researchProgress: ResearchProgress;
  generatedMemo: FollowUpMemo | null;
  llm: LlmGenerationState;
  memoProgress: MemoGenerationProgress;
}

export function ReadinessStrip(props: ReadinessStripProps) {
  return (
    <section
      className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-5 py-4"
      aria-label="Workbench readiness"
    >
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]">
          Workbench readiness
        </div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <OpenAICard {...props} />
        <MemoLoadedCard extraction={props.extraction} />
        <ResearchCard
          research={props.research}
          researchState={props.researchState}
          researchProgress={props.researchProgress}
        />
        <DraftCard
          generatedMemo={props.generatedMemo}
          llm={props.llm}
          memoProgress={props.memoProgress}
        />
      </div>
    </section>
  );
}

function OpenAICard({
  llmProviderStatus,
  gateBlocking,
}: Pick<ReadinessStripProps, "llmProviderStatus" | "gateBlocking">) {
  const status = llmProviderStatus;
  const ready =
    status?.llmReady === true &&
    status?.researchAvailable === true &&
    !gateBlocking;
  let value: string;
  let subnote: string;
  let tone: Tone;
  if (ready) {
    value = "Connected";
    subnote = `${status?.provider ?? "openai"} · ${status?.model ?? "gpt"}`;
    tone = "success";
  } else if (gateBlocking) {
    value = "Gate locked";
    subnote = "Enter the access token in Settings";
    tone = "warning";
  } else if (status?.llmReady === false) {
    value = "Setup needed";
    subnote = "Configure OPENAI_API_KEY in the Worker";
    tone = "warning";
  } else {
    value = "Checking…";
    subnote = "Reading provider status";
    tone = "neutral";
  }
  return (
    <Card icon={Cloud} label="OpenAI" value={value} subnote={subnote} tone={tone} />
  );
}

function MemoLoadedCard({ extraction }: { extraction: ExtractionResult | null }) {
  if (!extraction) {
    return (
      <Card
        icon={FileText}
        label="Memo loaded"
        value="Awaiting upload"
        subnote="Drop the original memo to begin"
        tone="neutral"
      />
    );
  }
  if (extraction.status === "extracting") {
    return (
      <Card
        icon={Loader2}
        spin
        label="Memo loaded"
        value="Extracting…"
        subnote={extraction.source.filename}
        tone="active"
      />
    );
  }
  if (extraction.status === "error" || extraction.status === "unsupported") {
    return (
      <Card
        icon={FileText}
        label="Memo loaded"
        value="Extraction failed"
        subnote={extraction.errorMessage || "Try a different file format"}
        tone="warning"
      />
    );
  }
  const words = extraction.wordCount
    ? extraction.wordCount.toLocaleString()
    : "—";
  return (
    <Card
      icon={FileText}
      label="Memo loaded"
      value={`${words} words`}
      subnote={extraction.source.filename}
      tone="success"
    />
  );
}

function ResearchCard({
  research,
  researchState,
  researchProgress,
}: Pick<ReadinessStripProps, "research" | "researchState" | "researchProgress">) {
  const totalPasses = researchProgress.passes.length || 6;
  const completedPasses = researchProgress.passes.filter(
    (p) => p.status === "success",
  ).length;
  const failedPasses = researchProgress.passes.filter(
    (p) => p.status === "failed",
  ).length;

  if (researchState.kind === "loading" || researchProgress.kind === "running") {
    return (
      <Card
        icon={Loader2}
        spin
        label="Research readiness"
        value={`In progress · ${completedPasses} of ${totalPasses}`}
        subnote="Running web-search passes"
        tone="active"
      />
    );
  }
  if (researchState.kind === "success" && research) {
    const findings = research.findings.length;
    const verified = research.findings.filter((f) =>
      f.sources.some((s) => s.verifiedByWebSearch === true),
    ).length;
    const value =
      researchProgress.kind === "complete_with_warnings"
        ? `Complete · ${findings} findings`
        : `Complete · ${findings} findings`;
    const subnote =
      researchProgress.kind === "complete_with_warnings"
        ? `${verified}/${findings} web-verified · ${failedPasses} pass failed`
        : `${verified}/${findings} web-verified`;
    return (
      <Card
        icon={Search}
        label="Research readiness"
        value={value}
        subnote={subnote}
        tone={researchProgress.kind === "complete_with_warnings" ? "warning" : "success"}
      />
    );
  }
  if (researchState.kind === "error") {
    return (
      <Card
        icon={Search}
        label="Research readiness"
        value="Failed"
        subnote="Retry from the research panel"
        tone="warning"
      />
    );
  }
  return (
    <Card
      icon={Search}
      label="Research readiness"
      value="Pending"
      subnote="Six focused web-search passes"
      tone="neutral"
    />
  );
}

function DraftCard({
  generatedMemo,
  llm,
  memoProgress,
}: Pick<ReadinessStripProps, "generatedMemo" | "llm" | "memoProgress">) {
  const totalSections = memoProgress.sections.length || 9;

  if (llm.kind === "loading" || memoProgress.kind === "running") {
    return (
      <Card
        icon={Loader2}
        spin
        label="Draft status"
        value={`In progress · ${memoProgress.completedCount} of ${totalSections}`}
        subnote="Drafting same-style sections"
        tone="active"
      />
    );
  }
  if (llm.kind === "success" && generatedMemo) {
    return (
      <Card
        icon={Sparkles}
        label="Draft status"
        value={`Generated · ${generatedMemo.sections.length} sections`}
        subnote="Review below"
        tone="success"
      />
    );
  }
  if (llm.kind === "error" || memoProgress.kind === "failed") {
    return (
      <Card
        icon={Sparkles}
        label="Draft status"
        value="Failed"
        subnote="Retry from the generate panel"
        tone="warning"
      />
    );
  }
  return (
    <Card
      icon={Sparkles}
      label="Draft status"
      value="Pending"
      subnote="Nine sections, sourced per finding"
      tone="neutral"
    />
  );
}

function Card({
  icon: Icon,
  spin,
  label,
  value,
  subnote,
  tone,
}: {
  icon: LucideIcon;
  spin?: boolean;
  label: string;
  value: string;
  subnote: string;
  tone: Tone;
}) {
  const toneRing = {
    neutral: "ring-transparent",
    active: "ring-[var(--color-ink)]/15",
    success: "ring-[var(--color-success)]/20",
    warning: "ring-[var(--color-warning)]/25",
  }[tone];
  const dotColor = {
    neutral: "bg-[var(--color-text-subtle)]",
    active: "bg-[var(--color-ink)]",
    success: "bg-[var(--color-success)]",
    warning: "bg-[var(--color-warning)]",
  }[tone];
  const iconColor = {
    neutral: "text-[var(--color-text-subtle)]",
    active: "text-[var(--color-ink)]",
    success: "text-[var(--color-success)]",
    warning: "text-[var(--color-warning)]",
  }[tone];

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 hover:shadow-md transition-shadow ring-1",
        toneRing,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">
        <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Icon
          className={cn("w-4 h-4 shrink-0", iconColor, spin && "animate-spin")}
          strokeWidth={1.75}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">
            {value}
          </div>
          <div className="text-[10.5px] text-[var(--color-text-muted)] truncate">
            {subnote}
          </div>
        </div>
      </div>
    </div>
  );
}
