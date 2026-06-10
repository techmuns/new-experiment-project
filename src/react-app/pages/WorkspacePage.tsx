import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Circle,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import type {
  ResearchPassRunState,
  SectionRunState,
} from "@shared/types";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { UploadSlot } from "../components/ui/UploadSlot";
import { ExtractionPreview } from "../components/ui/ExtractionPreview";
import { PrivacyDisclosure } from "../components/PrivacyDisclosure";
import { PeriodPanel } from "../components/PeriodPanel";
import { ResearchFindingsCard } from "../components/ResearchFindingsCard";
import { MemoReview } from "../components/MemoReview";
import { useMemoProject } from "../state/MemoProjectContext";

export function WorkspacePage() {
  const {
    state,
    extractInitialMemo,
    runResearch,
    retryFailedResearchPasses,
    retryAllResearch,
    generateMemo,
    retryFailedSection,
    retryFullMemo,
    startOver,
  } = useMemoProject();

  const status = state.llmProviderStatus;
  const llmReady = status?.llmReady === true;
  const researchAvailable = status?.researchAvailable === true;
  const gateEnabled = status?.gateEnabled === true;
  const gateBlocking = gateEnabled && !state.gateTokenSet;
  const canCall = llmReady && !gateBlocking;

  const headerChip = (() => {
    if (canCall && researchAvailable) {
      return (
        <Badge tone="success" dot>
          OpenAI ready
        </Badge>
      );
    }
    if (gateBlocking) {
      return (
        <Badge tone="warning" dot>
          Setup needed · gate locked
        </Badge>
      );
    }
    if (!llmReady) {
      return (
        <Badge tone="warning" dot>
          Setup needed
        </Badge>
      );
    }
    return (
      <Badge tone="neutral" dot>
        Demo only
      </Badge>
    );
  })();

  const onFile = async (file: File) => {
    await extractInitialMemo(file);
  };

  const dnaReady = state.dna !== null;
  const researchLoading = state.researchState.kind === "loading";
  const researchError =
    state.researchState.kind === "error" ? state.researchState : null;
  const researchSuccess =
    state.researchState.kind === "success" ? state.researchState : null;
  const memoLoading = state.llm.kind === "loading";
  const memoError = state.llm.kind === "error" ? state.llm : null;
  const memoSuccess = state.llm.kind === "success" ? state.llm : null;

  const researchWindowLabel = useMemo(() => {
    if (state.research) {
      return `Research ${state.research.researchWindow.startIsoMonth} → ${state.research.researchWindow.endIsoMonth}`;
    }
    return undefined;
  }, [state.research]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Memo workspace"
        title="Memo Updater"
        description="Upload an old investment memo. AI researches what changed and drafts a same-style follow-up memo."
        actions={headerChip}
      />

      {/* Step 1 — Upload */}
      <UploadSlot
        title="Upload the original investment memo"
        description="Supports .txt, .md, and .pdf. We extract the text locally to build memo DNA and detect the latest period covered."
        acceptedTypes=".txt,.md,.pdf"
        variant="primary"
        icon={UploadCloud}
        currentFile={state.initialFile}
        onFileSelected={onFile}
      />
      <PrivacyDisclosure variant="local" />
      <ExtractionPreview
        status={state.extractionStatus}
        result={state.extraction}
      />

      {/* Step 2 — Detected period */}
      {dnaReady && <PeriodPanel />}

      {/* Step 3 — Research */}
      {dnaReady && (
        <Panel
          eyebrow="Step 3"
          title="Research latest developments"
          actions={
            state.researchProgress.kind === "complete_with_warnings" ? (
              <Badge tone="warning" dot>
                Research complete with warnings
              </Badge>
            ) : researchSuccess ? (
              <Badge tone="success" dot>
                Research complete
              </Badge>
            ) : researchError ? (
              <Badge tone="warning" dot>
                Research failed
              </Badge>
            ) : null
          }
        >
          <PrivacyDisclosure variant="research" />

          {gateBlocking ? (
            <SetupRequiredPanel
              title="Internal access token required"
              message="The app-level gate is enabled. Open Settings → Advanced to enter the internal access token, or ask your operator to disable the gate after configuring Cloudflare Access / WAF / rate limiting."
            />
          ) : !canCall ? (
            <SetupRequiredPanel
              title="LLM not configured"
              message={
                status
                  ? "Configure LLM_API_KEY (or OPENAI_API_KEY) and provider settings in the deployed Worker, then refresh."
                  : "Could not read /api/llm/status. Refresh the page or check Settings."
              }
            />
          ) : !researchAvailable ? (
            <SetupRequiredPanel
              title="Research requires the OpenAI provider"
              message="Set LLM_PROVIDER=openai and a valid OpenAI key to enable web research."
            />
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <Button
                onClick={() => void runResearch()}
                disabled={researchLoading}
                leadingIcon={
                  researchLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )
                }
                trailingIcon={!researchLoading ? <ArrowRight className="w-4 h-4" /> : undefined}
              >
                {researchLoading
                  ? "Researching…"
                  : researchSuccess
                    ? "Re-run research"
                    : "Research latest developments"}
              </Button>
            </div>
          )}

          {(researchLoading ||
            state.researchProgress.kind === "complete_with_warnings" ||
            researchError) &&
            state.researchProgress.passes.some(
              (p) => p.status !== "pending",
            ) && (
              <ResearchProgressList passes={state.researchProgress.passes} />
            )}

          {state.researchProgress.kind === "complete_with_warnings" &&
            !researchError && (
              <ResearchWarningsBanner
                passes={state.researchProgress.passes}
                onRetryFailed={() => void retryFailedResearchPasses()}
                disabled={researchLoading}
              />
            )}

          {researchError && (
            <ResearchFailureBanner
              code={researchError.code}
              message={researchError.message}
              hasFailedPasses={
                state.researchProgress.failedPassIds.length > 0 &&
                state.researchProgress.failedPassIds.length <
                  state.researchProgress.passes.length
              }
              onRetryFailed={() => void retryFailedResearchPasses()}
              onRetryAll={() => void retryAllResearch()}
              disabled={researchLoading}
            />
          )}
        </Panel>
      )}

      {/* Pre-memo: research details live between Step 3 and Step 4. */}
      {researchSuccess && !memoSuccess && (
        <ResearchFindingsCard research={researchSuccess.research} />
      )}

      {/* Step 4 — Generate */}
      {dnaReady && (
        <Panel eyebrow="Step 4" title="Generate follow-up memo">
          {canCall ? (
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => void generateMemo(true)}
                disabled={memoLoading || !researchSuccess}
                leadingIcon={
                  memoLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )
                }
                trailingIcon={
                  !memoLoading ? <ArrowRight className="w-4 h-4" /> : undefined
                }
              >
                {memoLoading
                  ? "Generating…"
                  : memoSuccess
                    ? "Re-generate memo"
                    : "Generate follow-up memo"}
              </Button>
              {!researchSuccess && (
                <p className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
                  Run research first, or use "Generate without research" if
                  automated research is unavailable. The without-research memo
                  will explicitly state no external research was performed and
                  flag forward-looking claims for manual verification.
                </p>
              )}
              {!researchSuccess && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void generateMemo(false)}
                  disabled={memoLoading}
                >
                  Generate without research (explicit)
                </Button>
              )}
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--color-text-muted)]">
              Configure the LLM and (if needed) unlock the gate in Settings to
              enable generation.
            </p>
          )}

          {(memoLoading || memoError) && (
            <SectionProgressList sections={state.progress.sections} />
          )}

          {memoError && state.progress.failedSectionId && (
            <SectionFailureBanner
              sectionId={state.progress.failedSectionId}
              sections={state.progress.sections}
              detail={memoError.error}
              onRetryFailed={() => void retryFailedSection()}
              onRetryFull={() => void retryFullMemo()}
              disabled={memoLoading}
            />
          )}
        </Panel>
      )}

      {/* Step 5 — Review */}
      {memoSuccess && (
        <MemoReview
          memo={memoSuccess.memo}
          generationType="openai"
          researchWindowLabel={researchWindowLabel}
        />
      )}

      {/* Post-memo: the memo is the primary output. The research card moves
          below it and remounts (new key), which resets its expanded state to
          collapsed. The compact counts row stays visible; full details and
          warnings remain one click away. */}
      {researchSuccess && memoSuccess && (
        <ResearchFindingsCard
          key="post-memo"
          research={researchSuccess.research}
        />
      )}

      {/* Start over */}
      {(state.initialFile || state.dna || state.research || memoSuccess) && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={startOver}
            leadingIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Start over
          </Button>
        </div>
      )}
    </div>
  );
}

function SetupRequiredPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-3 flex items-start gap-3">
      <Lock className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-warning)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-[var(--color-text)]">
          {title}
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
          {message}
        </p>
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold text-[var(--color-ink)] hover:underline"
        >
          Open Settings <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

// Phase 5E: 6-row per-pass research progress list. Shown while research is
// running, after partial-success ("complete_with_warnings"), and after
// hard failure so the user can see exactly which passes completed, failed,
// or were skipped.
function ResearchProgressList({ passes }: { passes: ResearchPassRunState[] }) {
  const total = passes.length;
  const completed = passes.filter((p) => p.status === "success").length;
  const running = passes.find((p) => p.status === "running");
  const failed = passes.filter((p) => p.status === "failed");
  const headline = running
    ? `Researching pass ${passes.indexOf(running) + 1} of ${total} — ${running.title}`
    : failed.length > 0
      ? `${completed} of ${total} passes complete · ${failed.length} failed`
      : `${completed} of ${total} passes complete`;
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
      <div className="text-[12.5px] font-semibold text-[var(--color-text)] mb-2">
        {headline}
      </div>
      <ol className="space-y-1.5">
        {passes.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center gap-2 text-[12px] text-[var(--color-text)]"
          >
            <span className="w-4 inline-flex justify-center">
              {p.status === "success" ? (
                <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
              ) : p.status === "running" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-ink)]" />
              ) : p.status === "failed" ? (
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
              ) : (
                <Circle className="w-3 h-3 text-[var(--color-text-subtle)]" />
              )}
            </span>
            <span className="tnum w-5 text-right text-[var(--color-text-subtle)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={
                p.status === "pending"
                  ? "text-[var(--color-text-subtle)]"
                  : ""
              }
            >
              {p.title}
            </span>
            {p.status === "success" && typeof p.findingCount === "number" && (
              <span className="text-[10.5px] text-[var(--color-text-subtle)]">
                · {p.findingCount} finding{p.findingCount === 1 ? "" : "s"}
              </span>
            )}
            {p.status === "running" && p.attempt === 2 && (
              <span className="text-[10.5px] text-[var(--color-text-subtle)]">
                · retrying (compact)
              </span>
            )}
            {p.status === "failed" && p.errorCode && (
              <span className="text-[10.5px] text-[var(--color-warning)]">
                · {p.errorCode}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResearchWarningsBanner({
  passes,
  onRetryFailed,
  disabled,
}: {
  passes: ResearchPassRunState[];
  onRetryFailed: () => void;
  disabled: boolean;
}) {
  const failed = passes.filter((p) => p.status === "failed");
  if (failed.length === 0) return null;
  const titles = failed.map((p) => p.title).join(", ");
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warning)_22%,white)] bg-[var(--color-warning-soft)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-warning)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-[var(--color-warning)] leading-snug">
            Research complete with warnings — {failed.length} of {passes.length} passes failed.
          </div>
          <p className="text-[11.5px] text-[var(--color-warning)] mt-1 leading-snug">
            Failed: {titles}. Memo generation is enabled and will use the
            passes that succeeded. Retry the failed passes below to top up
            coverage.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onRetryFailed} disabled={disabled}>
          Retry failed research passes
        </Button>
      </div>
    </div>
  );
}

function ResearchFailureBanner({
  code,
  message,
  hasFailedPasses,
  onRetryFailed,
  onRetryAll,
  disabled,
}: {
  code: string;
  message: string;
  hasFailedPasses: boolean;
  onRetryFailed: () => void;
  onRetryAll: () => void;
  disabled: boolean;
}) {
  const headline =
    code === "research_no_sources"
      ? "Research failed — no verified sources were returned across the run."
      : "Research failed.";
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warning)_22%,white)] bg-[var(--color-warning-soft)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-warning)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-[var(--color-warning)] leading-snug">
            {headline}
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-snug font-mono">
            {code} · {message}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {hasFailedPasses && (
          <Button size="sm" onClick={onRetryFailed} disabled={disabled}>
            Retry failed research passes
          </Button>
        )}
        <Button
          size="sm"
          variant={hasFailedPasses ? "outline" : "primary"}
          onClick={onRetryAll}
          disabled={disabled}
        >
          Retry all research
        </Button>
      </div>
    </div>
  );
}

// Phase 5D: 9-row per-section progress list shown while generation is
// running OR after a failure (so the user sees which sections completed,
// which one broke, and what's still pending).
function SectionProgressList({ sections }: { sections: SectionRunState[] }) {
  const total = sections.length;
  const completed = sections.filter((s) => s.status === "success").length;
  const running = sections.find((s) => s.status === "running");
  const failed = sections.find((s) => s.status === "failed");
  const headline = running
    ? `Generating section ${sections.indexOf(running) + 1} of ${total} — ${running.title}`
    : failed
      ? `Section ${sections.indexOf(failed) + 1} of ${total} failed — ${failed.title}`
      : `${completed} of ${total} sections complete`;
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
      <div className="text-[12.5px] font-semibold text-[var(--color-text)] mb-2">
        {headline}
      </div>
      <ol className="space-y-1.5">
        {sections.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-2 text-[12px] text-[var(--color-text)]"
          >
            <span className="w-4 inline-flex justify-center">
              {s.status === "success" ? (
                <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
              ) : s.status === "running" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-ink)]" />
              ) : s.status === "failed" ? (
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
              ) : (
                <Circle className="w-3 h-3 text-[var(--color-text-subtle)]" />
              )}
            </span>
            <span className="tnum w-5 text-right text-[var(--color-text-subtle)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={
                s.status === "pending"
                  ? "text-[var(--color-text-subtle)]"
                  : ""
              }
            >
              {s.title}
            </span>
            {s.status === "running" && s.attempt === 2 && (
              <span className="text-[10.5px] text-[var(--color-text-subtle)]">
                · retrying (compact)
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Phase 5D: section-failure banner. Replaces the Phase 5C MemoErrorBanner.
// No fallback button — failure offers only "Retry failed section" (resumes
// from the failed section, preserving completed ones) or "Retry full memo"
// (re-runs all 9 sections).
function SectionFailureBanner({
  sectionId,
  sections,
  detail,
  onRetryFailed,
  onRetryFull,
  disabled,
}: {
  sectionId: string;
  sections: SectionRunState[];
  detail: string;
  onRetryFailed: () => void;
  onRetryFull: () => void;
  disabled: boolean;
}) {
  const idx = sections.findIndex((s) => s.id === sectionId);
  const failed = idx >= 0 ? sections[idx] : null;
  const sectionNumber = idx >= 0 ? idx + 1 : 0;
  const sectionTitle = failed?.title ?? "unknown section";
  const headline = `Memo generation failed while drafting Section ${sectionNumber}: ${sectionTitle}.`;
  const lower = detail.toLowerCase();
  const hint = lower.includes("rate_limited") || lower.includes("rate limit")
    ? "OpenAI rate-limited the request; wait ~10 s before retrying."
    : lower.includes("timeout")
      ? "The section call exceeded the 60 s limit. Retrying with a tighter prompt is automatic; if it failed twice, the network may be slow."
      : lower.includes("parse")
        ? "OpenAI returned a section that didn't match the schema. Retrying with a tighter prompt usually fixes this."
        : null;
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warning)_22%,white)] bg-[var(--color-warning-soft)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-warning)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-[var(--color-warning)] leading-snug">
            {headline}
          </div>
          {hint && (
            <p className="text-[11.5px] text-[var(--color-warning)] mt-1 leading-snug">
              {hint}
            </p>
          )}
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-snug font-mono">
            {detail}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onRetryFailed} disabled={disabled}>
          Retry failed section
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetryFull}
          disabled={disabled}
        >
          Retry full memo
        </Button>
      </div>
    </div>
  );
}
