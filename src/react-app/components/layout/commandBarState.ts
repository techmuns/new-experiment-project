import type {
  FollowUpMemo,
  LlmGenerationState,
  MemoDNA,
  PeriodDetectionResult,
  ResearchGenerationState,
} from "@shared/types";

// Phase 5C: pure helper for CommandBar's project/stage chips. Kept out
// of the component file so synthetic tests can import it under Node
// without pulling React. Receives a minimal slice of MemoProjectContext
// state; the consumer maps from useMemoProject() to this shape.
export interface CommandBarStateSlice {
  detection: PeriodDetectionResult | null;
  selectedCompany: string | null;
  periodOverride: { detectedCompany?: string };
  extraction: { source: { filename: string } } | null;
  dna: MemoDNA | null;
  research: unknown;
  researchState: ResearchGenerationState;
  generatedMemo: FollowUpMemo | null;
  llm: LlmGenerationState;
}

export interface CommandBarValues {
  projectLabel: string;
  trailingTicker?: string;
  stageLabel: string;
  stageTone: "neutral" | "warning" | "success";
}

export function deriveCommandBarValues(
  state: CommandBarStateSlice,
): CommandBarValues {
  const effectiveCompany = (
    state.selectedCompany?.trim() ||
    state.periodOverride.detectedCompany ||
    state.detection?.detectedCompany ||
    ""
  ).trim();
  const trailingTicker = state.detection?.detectedTicker?.trim() || undefined;
  const projectLabel = effectiveCompany || "Memo Workspace";

  let stageLabel = "Upload memo";
  let stageTone: "neutral" | "warning" | "success" = "neutral";

  if (state.llm.kind === "error") {
    stageLabel = "Generation error";
    stageTone = "warning";
  } else if (state.generatedMemo) {
    stageLabel = "Memo generated";
    stageTone = "success";
  } else if (state.llm.kind === "loading") {
    stageLabel = "Generating memo…";
  } else if (state.researchState.kind === "loading") {
    stageLabel = "Researching…";
  } else if (state.researchState.kind === "success") {
    stageLabel = "Research complete";
    stageTone = "success";
  } else if (state.researchState.kind === "error") {
    stageLabel = "Research error";
    stageTone = "warning";
  } else if (state.dna) {
    stageLabel = "Research workflow";
  } else if (state.extraction) {
    stageLabel = "Extracting memo";
  }

  return { projectLabel, trailingTicker, stageLabel, stageTone };
}
