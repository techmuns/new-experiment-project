import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Lock,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
  UploadCloud,
} from "lucide-react";
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
    generateMemo,
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
        actions={
          <>
            {headerChip}
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
              Settings
            </Link>
          </>
        }
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
            researchSuccess ? (
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

          {researchError && (
            <ErrorBanner
              code={researchError.code}
              message={researchError.message}
            />
          )}
        </Panel>
      )}

      {researchSuccess && (
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

          {memoError && (
            <ErrorBanner code="provider_error" message={memoError.error} />
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

function ErrorBanner({ code, message }: { code: string; message: string }) {
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warning)_22%,white)] bg-[var(--color-warning-soft)] px-3 py-2.5 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-warning)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-[var(--color-warning)]">
          {code}
        </div>
        <p className="text-[12px] text-[var(--color-warning)] mt-0.5 leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}
