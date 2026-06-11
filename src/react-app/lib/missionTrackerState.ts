import type {
  ExtractionStatus,
  FollowUpMemo,
  LlmGenerationState,
  MemoDNA,
  ResearchFindings,
  ResearchGenerationState,
} from "@shared/types";

// Phase 5I: pure helper. Derives the 5-step workflow-progress rail state
// from a minimal slice of MemoProjectContext. Mirrors the existing
// commandBarState.ts pattern so synthetic tests can import it under Node
// without pulling React. NO reducer changes, NO new context fields, NO
// new state.
//
// Naming note: the component file is named MemoMissionTracker.tsx for
// brevity, but ALL visible copy is professional ("Workflow progress",
// "Memo workflow", etc.). The "Mission" in the file name is purely an
// internal identifier — no rendered string says it.

export type MissionStepId =
  | "upload"
  | "detect"
  | "research"
  | "generate"
  | "review";

export type MissionStepStatus = "complete" | "active" | "pending";

export interface MissionStep {
  id: MissionStepId;
  index: 1 | 2 | 3 | 4 | 5;
  label: string;
  helper: string;
  status: MissionStepStatus;
}

export interface MissionTrackerStateSlice {
  initialFile: unknown | null;
  extractionStatus: ExtractionStatus;
  dna: MemoDNA | null;
  research: ResearchFindings | null;
  researchState: ResearchGenerationState;
  generatedMemo: FollowUpMemo | null;
  llm: LlmGenerationState;
}

const LABELS: Record<MissionStepId, { label: string; helper: string }> = {
  upload:   { label: "Upload memo",       helper: "Drop the original memo to begin" },
  detect:   { label: "Detect context",    helper: "Extract thesis and latest period" },
  research: { label: "Research changes",  helper: "Verified web sources across 6 passes" },
  generate: { label: "Generate memo",     helper: "Six client-priority sections, <3 pages" },
  review:   { label: "Review output",     helper: "Memo + supplementary valuation panels" },
};

export function deriveMissionTrackerSteps(
  state: MissionTrackerStateSlice,
): MissionStep[] {
  const uploaded = state.initialFile !== null;
  const dnaReady = state.dna !== null;
  const extracting = state.extractionStatus === "extracting";

  const researchKind = state.researchState.kind;
  const researchDone = researchKind === "success";
  const researchActive = researchKind === "loading" || researchKind === "error";

  const memoKind = state.llm.kind;
  const memoDone = state.generatedMemo !== null && memoKind === "success";
  const memoActive = memoKind === "loading" || memoKind === "error";

  // Step 1 — Upload
  const upload: MissionStep = {
    id: "upload", index: 1, ...LABELS.upload,
    status: uploaded ? "complete" : "active",
  };

  // Step 2 — Detect context
  let detectStatus: MissionStepStatus;
  if (dnaReady) detectStatus = "complete";
  else if (extracting || (uploaded && !dnaReady)) detectStatus = "active";
  else detectStatus = "pending";
  const detect: MissionStep = {
    id: "detect", index: 2, ...LABELS.detect, status: detectStatus,
  };

  // Step 3 — Research changes
  let researchStatus: MissionStepStatus;
  if (researchDone) researchStatus = "complete";
  else if (researchActive) researchStatus = "active";
  else if (dnaReady) researchStatus = "active";
  else researchStatus = "pending";
  const research: MissionStep = {
    id: "research", index: 3, ...LABELS.research, status: researchStatus,
  };

  // Step 4 — Generate memo
  let generateStatus: MissionStepStatus;
  if (memoDone) generateStatus = "complete";
  else if (memoActive) generateStatus = "active";
  else if (researchDone) generateStatus = "active";
  else generateStatus = "pending";
  const generate: MissionStep = {
    id: "generate", index: 4, ...LABELS.generate, status: generateStatus,
  };

  // Step 5 — Review output (no separate "reviewed" state — completes
  // when the memo lands; user is viewing it inline).
  const review: MissionStep = {
    id: "review", index: 5, ...LABELS.review,
    status: memoDone ? "complete" : "pending",
  };

  return [upload, detect, research, generate, review];
}
