import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type {
  CanonicalSectionId,
  ExtractionResult,
  ExtractionStatus,
  FollowUpMemo,
  LlmGenerationErrorCode,
  LlmGenerationState,
  LlmGenerationWarning,
  LlmStatusResponse,
  LocalUploadedFile,
  MemoDNA,
  MemoGenerationProgress,
  MemoSection,
  MemoUnderstanding,
  MemoUnderstandErrorCode,
  MemoUnderstandingState,
  PeriodDetectionResult,
  ResearchErrorCode,
  ResearchFindings,
  ResearchGenerationState,
  ResearchPassId,
  ResearchPassResponse,
  ResearchPassRunState,
  ResearchProgress,
  SectionRunState,
} from "@shared/types";
import { api } from "../lib/api";
import { extractText } from "../lib/extract";
import {
  extractionSupported,
  getExtension,
  mimeForFile,
} from "../lib/fileMeta";
import { buildMemoDnaFromText } from "../lib/memoDna";
import { detectPeriodFromMemoText } from "../lib/periodDetect";
import {
  CANONICAL_SECTION_IDS,
  SECTION_TITLES,
  runSectionGeneration,
} from "../lib/sectionGeneration";
import {
  RESEARCH_PASS_IDS,
  RESEARCH_PASS_TITLES,
  buildCompactPassDna,
  buildCompanyAliases,
  detectionToResearchDetectionInput,
  runResearchPasses,
} from "../lib/researchPasses";
import { buildMemoUnderstandingDigest } from "../lib/memoUnderstandingSummary";
import { getLlmGateToken } from "../lib/llmGateToken";

const GATE_TOKEN_POLL_KEY = "memo.llm.gate";

export interface PeriodOverride {
  detectedCompany?: string;
  periodLabel?: string;
  researchStart?: string;
}

interface State {
  initialFile: LocalUploadedFile | null;
  extraction: ExtractionResult | null;
  extractionStatus: ExtractionStatus;
  dna: MemoDNA | null;
  detection: PeriodDetectionResult | null;
  periodOverride: PeriodOverride;
  research: ResearchFindings | null;
  researchState: ResearchGenerationState;
  researchProgress: ResearchProgress;
  generatedMemo: FollowUpMemo | null;
  llm: LlmGenerationState;
  progress: MemoGenerationProgress;
  completedSections: Partial<Record<CanonicalSectionId, MemoSection>>;
  llmProviderStatus: LlmStatusResponse | null;
  demoFollowUpMemo: FollowUpMemo | null;
  gateTokenSet: boolean;
  // Phase 6A: Memo Understanding Engine state.
  understanding: MemoUnderstandingState;
  // Emergency / developer-only escape: when true, the Research button
  // skips the requirement that memoUnderstanding succeed first. Surfaced
  // only inside a <details> disclosure in MemoUnderstandingCard.
  skipUnderstanding: boolean;
  // Phase 6C: free-text the user typed into the "What else should we
  // test?" priorities textbox. Threaded into every research pass and
  // every memo section so the memo addresses what the user asked.
  userResearchPriorities: string;
  // Company the user explicitly selected at the top of the workspace as
  // the subject of the memo. When set it overrides the company auto-
  // detected from the memo and survives a new upload.
  selectedCompany: string | null;
}

type Action =
  | { type: "SET_INITIAL_FILE"; file: LocalUploadedFile | null }
  | { type: "SET_EXTRACTION_STATUS"; status: ExtractionStatus }
  | { type: "SET_EXTRACTION"; result: ExtractionResult }
  | {
      type: "SET_DNA_AND_DETECTION";
      dna: MemoDNA;
      detection: PeriodDetectionResult;
    }
  | { type: "SET_PERIOD_OVERRIDE"; override: PeriodOverride }
  | { type: "SET_RESEARCH_STATE"; state: ResearchGenerationState }
  | { type: "SET_RESEARCH"; research: ResearchFindings | null }
  | {
      type: "START_RESEARCH_RUN";
      startedAt: string;
      runPassIds: ResearchPassId[];
      preserveExistingSuccesses: boolean;
    }
  | { type: "RESEARCH_PASS_STARTED"; passId: ResearchPassId; attempt: 1 | 2 }
  | {
      type: "RESEARCH_PASS_SUCCESS";
      passId: ResearchPassId;
      findingCount: number;
    }
  | {
      type: "RESEARCH_PASS_FAILED";
      passId: ResearchPassId;
      code: ResearchErrorCode;
      message: string;
    }
  | {
      type: "RESEARCH_RUN_TERMINAL";
      kind: ResearchProgress["kind"];
      failedPassIds: ResearchPassId[];
    }
  | { type: "SET_LLM_STATE"; state: LlmGenerationState }
  | { type: "SET_GENERATED_MEMO"; memo: FollowUpMemo | null }
  | { type: "START_GENERATION"; startedAt: string; resumeFromIdx: number }
  | { type: "SECTION_STARTED"; sectionId: CanonicalSectionId; attempt: 1 | 2 }
  | { type: "SECTION_SUCCESS"; sectionId: CanonicalSectionId; section: MemoSection }
  | {
      type: "SECTION_FAILED";
      sectionId: CanonicalSectionId;
      code: LlmGenerationErrorCode;
      message: string;
    }
  | { type: "RESET_PROGRESS" }
  | { type: "SET_LLM_PROVIDER_STATUS"; status: LlmStatusResponse | null }
  | { type: "SET_DEMO_MEMO"; memo: FollowUpMemo | null }
  | { type: "SET_GATE_TOKEN_SET"; value: boolean }
  | { type: "START_UNDERSTAND" }
  | {
      type: "SET_UNDERSTANDING";
      understanding: MemoUnderstanding;
      providerMetadata: { providerName: "openai"; modelUsed: string };
      // Phase 6A.3: thread provider warnings (baseline_recovery /
      // baseline_after_timeout / schema_warning) so MemoUnderstandingCard
      // can render the "Recovered from memo text" ribbon.
      warnings?: LlmGenerationWarning[];
    }
  | {
      type: "SET_UNDERSTANDING_ERROR";
      code: MemoUnderstandErrorCode;
      message: string;
    }
  | { type: "SET_SKIP_UNDERSTANDING"; value: boolean }
  | { type: "SET_USER_RESEARCH_PRIORITIES"; value: string }
  | { type: "SET_SELECTED_COMPANY"; company: string | null }
  | { type: "RESET" };

function buildInitialProgress(): MemoGenerationProgress {
  return {
    kind: "idle",
    sections: CANONICAL_SECTION_IDS.map<SectionRunState>((id) => ({
      id,
      title: SECTION_TITLES[id],
      status: "pending",
      attempt: 0,
    })),
    completedCount: 0,
  };
}

function buildInitialResearchProgress(): ResearchProgress {
  return {
    kind: "idle",
    passes: RESEARCH_PASS_IDS.map<ResearchPassRunState>((id) => ({
      id,
      title: RESEARCH_PASS_TITLES[id],
      status: "pending",
      attempt: 0,
    })),
    failedPassIds: [],
  };
}

const initialState: State = {
  initialFile: null,
  extraction: null,
  extractionStatus: "idle",
  dna: null,
  detection: null,
  periodOverride: {},
  research: null,
  researchState: { kind: "idle" },
  researchProgress: buildInitialResearchProgress(),
  generatedMemo: null,
  llm: { kind: "idle" },
  progress: buildInitialProgress(),
  completedSections: {},
  llmProviderStatus: null,
  demoFollowUpMemo: null,
  gateTokenSet: false,
  understanding: { kind: "idle" },
  skipUnderstanding: false,
  userResearchPriorities: "",
  selectedCompany: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_INITIAL_FILE":
      return { ...state, initialFile: action.file };
    case "SET_EXTRACTION_STATUS":
      return { ...state, extractionStatus: action.status };
    case "SET_EXTRACTION":
      return {
        ...state,
        extraction: action.result,
        extractionStatus: action.result.status,
      };
    case "SET_DNA_AND_DETECTION":
      return {
        ...state,
        dna: action.dna,
        detection: action.detection,
        periodOverride: {
          detectedCompany: action.detection.detectedCompany,
          periodLabel: action.detection.best
            ? renderPeriodLabel(action.detection.best)
            : undefined,
          researchStart: action.detection.researchStart,
        },
        research: null,
        researchState: { kind: "idle" },
        researchProgress: buildInitialResearchProgress(),
        generatedMemo: null,
        llm: { kind: "idle" },
        progress: buildInitialProgress(),
        completedSections: {},
        // Phase 6A: a new memo invalidates any prior understanding +
        // resets the escape-hatch flag.
        understanding: { kind: "idle" },
        skipUnderstanding: false,
      };
    case "SET_PERIOD_OVERRIDE":
      return {
        ...state,
        periodOverride: { ...state.periodOverride, ...action.override },
      };
    case "SET_RESEARCH_STATE":
      return { ...state, researchState: action.state };
    case "SET_RESEARCH":
      return { ...state, research: action.research };
    case "START_RESEARCH_RUN": {
      const fresh = buildInitialResearchProgress();
      const passes = fresh.passes.map<ResearchPassRunState>((row) => {
        const prev = state.researchProgress.passes.find((p) => p.id === row.id);
        if (
          action.preserveExistingSuccesses &&
          prev &&
          prev.status === "success" &&
          !action.runPassIds.includes(row.id)
        ) {
          return { ...prev, attempt: 0, errorCode: undefined, errorMessage: undefined };
        }
        return row;
      });
      return {
        ...state,
        researchProgress: {
          kind: "running",
          startedAt: action.startedAt,
          passes,
          failedPassIds: [],
        },
      };
    }
    case "RESEARCH_PASS_STARTED": {
      const passes = state.researchProgress.passes.map<ResearchPassRunState>(
        (row) =>
          row.id === action.passId
            ? {
                ...row,
                status: "running",
                attempt: action.attempt,
                errorCode: undefined,
                errorMessage: undefined,
              }
            : row,
      );
      return {
        ...state,
        researchProgress: { ...state.researchProgress, passes },
      };
    }
    case "RESEARCH_PASS_SUCCESS": {
      const passes = state.researchProgress.passes.map<ResearchPassRunState>(
        (row) =>
          row.id === action.passId
            ? { ...row, status: "success", findingCount: action.findingCount }
            : row,
      );
      return {
        ...state,
        researchProgress: { ...state.researchProgress, passes },
      };
    }
    case "RESEARCH_PASS_FAILED": {
      const passes = state.researchProgress.passes.map<ResearchPassRunState>(
        (row) =>
          row.id === action.passId
            ? {
                ...row,
                status: "failed",
                errorCode: action.code,
                errorMessage: action.message,
              }
            : row,
      );
      const failedPassIds = passes
        .filter((p) => p.status === "failed")
        .map((p) => p.id);
      return {
        ...state,
        researchProgress: {
          ...state.researchProgress,
          passes,
          failedPassIds,
        },
      };
    }
    case "RESEARCH_RUN_TERMINAL":
      return {
        ...state,
        researchProgress: {
          ...state.researchProgress,
          kind: action.kind,
          failedPassIds: action.failedPassIds,
        },
      };
    case "SET_LLM_STATE":
      return { ...state, llm: action.state };
    case "SET_GENERATED_MEMO":
      return { ...state, generatedMemo: action.memo };
    case "START_GENERATION": {
      const fresh = buildInitialProgress();
      const sections = fresh.sections.map<SectionRunState>((row, i) => {
        const prev =
          i < action.resumeFromIdx ? state.progress.sections[i] : undefined;
        if (prev && prev.status === "success") {
          return { ...prev, attempt: 0, errorCode: undefined, errorMessage: undefined };
        }
        return row;
      });
      const completedCount = sections.filter((s) => s.status === "success").length;
      return {
        ...state,
        progress: {
          kind: "running",
          startedAt: action.startedAt,
          sections,
          completedCount,
        },
      };
    }
    case "SECTION_STARTED": {
      const sections = state.progress.sections.map<SectionRunState>((row) =>
        row.id === action.sectionId
          ? {
              ...row,
              status: "running",
              attempt: action.attempt,
              errorCode: undefined,
              errorMessage: undefined,
            }
          : row,
      );
      return { ...state, progress: { ...state.progress, sections } };
    }
    case "SECTION_SUCCESS": {
      const sections = state.progress.sections.map<SectionRunState>((row) =>
        row.id === action.sectionId
          ? { ...row, status: "success" }
          : row,
      );
      const completedCount = sections.filter((s) => s.status === "success").length;
      return {
        ...state,
        completedSections: {
          ...state.completedSections,
          [action.sectionId]: action.section,
        },
        progress: {
          ...state.progress,
          sections,
          completedCount,
        },
      };
    }
    case "SECTION_FAILED": {
      const sections = state.progress.sections.map<SectionRunState>((row) =>
        row.id === action.sectionId
          ? {
              ...row,
              status: "failed",
              errorCode: action.code,
              errorMessage: action.message,
            }
          : row,
      );
      return {
        ...state,
        progress: {
          ...state.progress,
          kind: "failed",
          sections,
          failedSectionId: action.sectionId,
        },
      };
    }
    case "RESET_PROGRESS":
      return {
        ...state,
        progress: buildInitialProgress(),
        completedSections: {},
        generatedMemo: null,
        llm: { kind: "idle" },
      };
    case "SET_LLM_PROVIDER_STATUS":
      return { ...state, llmProviderStatus: action.status };
    case "SET_DEMO_MEMO":
      return { ...state, demoFollowUpMemo: action.memo };
    case "SET_GATE_TOKEN_SET":
      return { ...state, gateTokenSet: action.value };
    case "START_UNDERSTAND":
      return { ...state, understanding: { kind: "loading" } };
    case "SET_UNDERSTANDING":
      return {
        ...state,
        understanding: {
          kind: "success",
          understanding: action.understanding,
          providerMetadata: action.providerMetadata,
          warnings: action.warnings ?? [],
        },
        // Successful understanding implicitly clears any prior
        // emergency-skip flag — memo-specific research is the
        // expected path again.
        skipUnderstanding: false,
      };
    case "SET_UNDERSTANDING_ERROR":
      return {
        ...state,
        understanding: {
          kind: "error",
          code: action.code,
          message: action.message,
        },
      };
    case "SET_SKIP_UNDERSTANDING":
      return { ...state, skipUnderstanding: action.value };
    case "SET_USER_RESEARCH_PRIORITIES":
      return { ...state, userResearchPriorities: action.value };
    case "SET_SELECTED_COMPANY":
      return { ...state, selectedCompany: action.company };
    case "RESET":
      return {
        ...initialState,
        progress: buildInitialProgress(),
        researchProgress: buildInitialResearchProgress(),
        llmProviderStatus: state.llmProviderStatus,
        demoFollowUpMemo: state.demoFollowUpMemo,
        gateTokenSet: state.gateTokenSet,
        understanding: { kind: "idle" },
        skipUnderstanding: false,
        userResearchPriorities: "",
      };
  }
}

interface MemoProjectContextValue {
  state: State;
  effectiveDetection: {
    detectedCompany: string;
    periodLabel: string;
    researchStart?: string;
    researchCurrent: string;
    assumptionNotes: string[];
  } | null;
  extractInitialMemo: (file: File) => Promise<ExtractionResult>;
  setPeriodOverride: (override: PeriodOverride) => void;
  runResearch: () => Promise<void>;
  retryFailedResearchPasses: () => Promise<void>;
  retryAllResearch: () => Promise<void>;
  generateMemo: (withResearch: boolean) => Promise<void>;
  retryFailedSection: () => Promise<void>;
  retryFullMemo: () => Promise<void>;
  refreshLlmProviderStatus: () => Promise<void>;
  syncGateTokenSet: () => void;
  startOver: () => void;
  // Phase 6A
  runMemoUnderstanding: () => Promise<void>;
  rerunMemoUnderstanding: () => Promise<void>;
  skipMemoUnderstanding: () => void;
  // Phase 6C
  setUserResearchPriorities: (value: string) => void;
  // Company selector (top-of-workspace filter)
  setSelectedCompany: (company: string | null) => void;
}

const Ctx = createContext<MemoProjectContextValue | null>(null);

export function MemoProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const researchAbort = useRef<AbortController | null>(null);
  const generateAbort = useRef<AbortController | null>(null);
  const understandAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    api
      .demoFollowUpMemo()
      .then((memo) => dispatch({ type: "SET_DEMO_MEMO", memo }))
      .catch(() => {});
    api
      .llmStatus()
      .then((status) =>
        dispatch({ type: "SET_LLM_PROVIDER_STATUS", status }),
      )
      .catch(() =>
        dispatch({ type: "SET_LLM_PROVIDER_STATUS", status: null }),
      );
    dispatch({
      type: "SET_GATE_TOKEN_SET",
      value: Boolean(getLlmGateToken()),
    });
    // Cross-tab gate-token changes:
    const onStorage = (e: StorageEvent): void => {
      if (e.key === GATE_TOKEN_POLL_KEY) {
        dispatch({
          type: "SET_GATE_TOKEN_SET",
          value: Boolean(getLlmGateToken()),
        });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const extractInitialMemo = useCallback(
    async (file: File): Promise<ExtractionResult> => {
      const ext = getExtension(file.name);
      const local: LocalUploadedFile = {
        id: `local_initial_${Date.now()}`,
        kind: "initial_memo",
        filename: file.name,
        sizeBytes: file.size,
        mime: mimeForFile(file),
        extension: ext,
        uploadedAt: new Date().toISOString(),
        extractionSupported: extractionSupported(ext),
      };
      dispatch({ type: "SET_INITIAL_FILE", file: local });
      dispatch({ type: "SET_EXTRACTION_STATUS", status: "extracting" });
      const result = await extractText(file);
      dispatch({ type: "SET_EXTRACTION", result });
      if (result.status === "success" || result.status === "partial") {
        const dna = buildMemoDnaFromText({
          text: result.text,
          filename: result.source.filename,
        });
        const detection = detectPeriodFromMemoText(result.text);
        dispatch({ type: "SET_DNA_AND_DETECTION", dna, detection });
      }
      return result;
    },
    [],
  );

  const setPeriodOverride = useCallback((override: PeriodOverride) => {
    dispatch({ type: "SET_PERIOD_OVERRIDE", override });
  }, []);

  const refreshLlmProviderStatus = useCallback(async (): Promise<void> => {
    try {
      const status = await api.llmStatus();
      dispatch({ type: "SET_LLM_PROVIDER_STATUS", status });
    } catch {
      dispatch({ type: "SET_LLM_PROVIDER_STATUS", status: null });
    }
  }, []);

  const syncGateTokenSet = useCallback((): void => {
    dispatch({
      type: "SET_GATE_TOKEN_SET",
      value: Boolean(getLlmGateToken()),
    });
  }, []);

  const perPassResultsRef = useRef<
    Map<ResearchPassId, ResearchPassResponse & { ok: true }>
  >(new Map());

  // Phase 6A: Memo Understanding Engine.
  const runMemoUnderstandingOrchestrated = useCallback(async (): Promise<void> => {
    if (!state.dna || !state.extraction || !state.initialFile) return;
    const companyName =
      state.selectedCompany?.trim() ||
      state.periodOverride.detectedCompany ||
      state.detection?.detectedCompany ||
      state.initialFile.filename.replace(/\.[^.]+$/, "");
    const ticker = state.detection?.detectedTicker;
    const detection = state.detection
      ? detectionToResearchDetectionInput(state.detection, companyName)
      : undefined;

    understandAbort.current?.abort();
    const controller = new AbortController();
    understandAbort.current = controller;
    dispatch({ type: "START_UNDERSTAND" });

    let response: Awaited<ReturnType<typeof api.memoUnderstand>> | null = null;
    let networkMessage = "";
    try {
      response = await api.memoUnderstand(
        {
          project: {
            id: state.dna.projectId,
            ticker,
            companyName,
          },
          detection,
          memo: {
            id: state.initialFile.id,
            text: state.extraction.text,
            sourceFilename: state.extraction.source.filename,
            sizeBytes: state.extraction.source.sizeBytes,
          },
          dna: state.dna,
        },
        controller.signal,
      );
    } catch (err) {
      networkMessage = err instanceof Error ? err.message : "Network error";
    }
    if (understandAbort.current !== controller) return;
    understandAbort.current = null;

    if (response && response.ok) {
      dispatch({
        type: "SET_UNDERSTANDING",
        understanding: response.understanding,
        providerMetadata: {
          providerName: "openai",
          modelUsed: response.providerMetadata.modelUsed,
        },
        warnings: response.warnings,
      });
      return;
    }
    if (response) {
      dispatch({
        type: "SET_UNDERSTANDING_ERROR",
        code: response.code,
        message: response.message,
      });
      return;
    }
    dispatch({
      type: "SET_UNDERSTANDING_ERROR",
      code: "provider_error",
      message: networkMessage || "Network error",
    });
  }, [
    state.dna,
    state.extraction,
    state.initialFile,
    state.detection,
    state.periodOverride.detectedCompany,
    state.selectedCompany,
  ]);

  const runMemoUnderstanding = useCallback(
    (): Promise<void> => runMemoUnderstandingOrchestrated(),
    [runMemoUnderstandingOrchestrated],
  );
  const rerunMemoUnderstanding = useCallback(
    (): Promise<void> => runMemoUnderstandingOrchestrated(),
    [runMemoUnderstandingOrchestrated],
  );
  const skipMemoUnderstanding = useCallback((): void => {
    dispatch({ type: "SET_SKIP_UNDERSTANDING", value: true });
  }, []);

  const setUserResearchPriorities = useCallback((value: string): void => {
    dispatch({ type: "SET_USER_RESEARCH_PRIORITIES", value });
  }, []);

  const setSelectedCompany = useCallback((company: string | null): void => {
    dispatch({ type: "SET_SELECTED_COMPANY", company });
  }, []);

  // Auto-run memo understanding once DNA + extraction are ready and the
  // provider is configured. Only fires on the idle→loading transition
  // (the dependency check) so subsequent re-renders don't re-trigger.
  const understandKind = state.understanding.kind;
  const llmReadyForUnderstand =
    state.llmProviderStatus?.llmReady === true &&
    state.llmProviderStatus?.researchAvailable === true;
  const understandGateBlocking =
    state.llmProviderStatus?.gateEnabled === true && !state.gateTokenSet;
  useEffect(() => {
    if (understandKind !== "idle") return;
    if (!state.dna || !state.extraction) return;
    if (!llmReadyForUnderstand || understandGateBlocking) return;
    void runMemoUnderstandingOrchestrated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    understandKind,
    state.dna,
    state.extraction,
    llmReadyForUnderstand,
    understandGateBlocking,
  ]);

  const runResearchOrchestrated = useCallback(
    async (mode: "fresh" | "retry_failed"): Promise<void> => {
      if (!state.dna || !state.extraction || !state.initialFile) return;
      const periodLabel =
        state.periodOverride.periodLabel ??
        (state.detection?.best ? renderPeriodLabel(state.detection.best) : "");
      if (!periodLabel) return;

      const companyName =
        state.selectedCompany?.trim() ||
        state.periodOverride.detectedCompany ||
        state.detection?.detectedCompany ||
        state.initialFile.filename.replace(/\.[^.]+$/, "");
      const aliases = buildCompanyAliases(
        state.detection,
        { ticker: state.dna.projectId, companyName },
        state.dna,
      );
      const compactDna = buildCompactPassDna(state.dna);
      const baseDetection = detectionToResearchDetectionInput(
        state.detection,
        companyName,
      );
      baseDetection.detectedCompany = companyName;
      baseDetection.periodLabel = periodLabel;
      baseDetection.researchStart = state.periodOverride.researchStart;

      const understanding =
        state.understanding.kind === "success"
          ? state.understanding.understanding
          : null;
      const memoUnderstandingDigest = understanding
        ? buildMemoUnderstandingDigest(understanding)
        : undefined;
      const userPriorities = state.userResearchPriorities.trim()
        ? state.userResearchPriorities
        : undefined;
      const baseRequest = {
        project: {
          id: state.dna.projectId,
          ticker: aliases.ticker,
          companyName,
        },
        companyAliases: aliases,
        dna: compactDna,
        detection: baseDetection,
        memoUnderstandingDigest,
        userPriorities,
      };

      const passesToRun =
        mode === "retry_failed"
          ? [...state.researchProgress.failedPassIds]
          : [...RESEARCH_PASS_IDS];

      if (mode === "fresh") {
        perPassResultsRef.current = new Map();
      }

      researchAbort.current?.abort();
      const controller = new AbortController();
      researchAbort.current = controller;
      dispatch({
        type: "START_RESEARCH_RUN",
        startedAt: new Date().toISOString(),
        runPassIds: passesToRun,
        preserveExistingSuccesses: mode === "retry_failed",
      });
      dispatch({ type: "SET_RESEARCH_STATE", state: { kind: "loading" } });

      const result = await runResearchPasses({
        baseRequest,
        thesisCheckpoints: state.dna.thesisCheckpoints,
        apiCall: (req, signal) => api.researchPass(req, signal),
        signal: controller.signal,
        passesToRun,
        existing: perPassResultsRef.current,
        onPassStart: (passId, attempt) => {
          dispatch({ type: "RESEARCH_PASS_STARTED", passId, attempt });
        },
        onPassDone: (passId, value) => {
          perPassResultsRef.current.set(passId, value);
          dispatch({
            type: "RESEARCH_PASS_SUCCESS",
            passId,
            findingCount: value.findings.length,
          });
        },
        onPassFail: (passId, code, message) => {
          dispatch({ type: "RESEARCH_PASS_FAILED", passId, code, message });
        },
      });

      if (researchAbort.current !== controller) return;
      researchAbort.current = null;

      if (result.outcome === "aborted") {
        return;
      }

      if (result.outcome === "failed") {
        dispatch({
          type: "RESEARCH_RUN_TERMINAL",
          kind: "failed",
          failedPassIds: result.failedPassIds,
        });
        dispatch({
          type: "SET_RESEARCH_STATE",
          state: {
            kind: "error",
            code: result.code,
            message: result.message,
          },
        });
        dispatch({ type: "SET_RESEARCH", research: null });
        return;
      }

      // complete OR complete_with_warnings — both enable Step 4.
      dispatch({
        type: "RESEARCH_RUN_TERMINAL",
        kind: result.outcome,
        failedPassIds: result.failedPassIds,
      });
      dispatch({ type: "SET_RESEARCH", research: result.research });
      dispatch({
        type: "SET_RESEARCH_STATE",
        state: {
          kind: "success",
          research: result.research,
          providerMetadata: {
            providerName: "openai",
            modelUsed: "gpt-research-pass",
          },
          warnings: [],
        },
      });
    },
    [
      state.dna,
      state.extraction,
      state.initialFile,
      state.detection,
      state.periodOverride,
      state.researchProgress.failedPassIds,
      state.understanding,
      state.userResearchPriorities,
      state.selectedCompany,
    ],
  );

  const runResearch = useCallback(
    (): Promise<void> => runResearchOrchestrated("fresh"),
    [runResearchOrchestrated],
  );

  const retryFailedResearchPasses = useCallback(
    (): Promise<void> => runResearchOrchestrated("retry_failed"),
    [runResearchOrchestrated],
  );

  const retryAllResearch = useCallback(
    (): Promise<void> => runResearchOrchestrated("fresh"),
    [runResearchOrchestrated],
  );

  const runOrchestratedGeneration = useCallback(
    async (
      withResearch: boolean,
      mode: "fresh" | "resume",
    ): Promise<void> => {
      if (!state.dna || !state.extraction || !state.initialFile) return;
      const companyName =
        state.selectedCompany?.trim() ||
        state.periodOverride.detectedCompany ||
        state.detection?.detectedCompany ||
        state.initialFile.filename.replace(/\.[^.]+$/, "");
      const periodLabel =
        state.periodOverride.periodLabel ??
        (state.detection?.best ? renderPeriodLabel(state.detection.best) : "");
      const research = withResearch ? state.research : null;

      const failedId =
        mode === "resume" ? state.progress.failedSectionId : undefined;
      const resumeFromIdx =
        mode === "resume" && failedId
          ? Math.max(0, CANONICAL_SECTION_IDS.indexOf(failedId))
          : 0;
      const existingSections =
        mode === "resume" ? state.completedSections : {};

      generateAbort.current?.abort();
      const controller = new AbortController();
      generateAbort.current = controller;
      dispatch({
        type: "START_GENERATION",
        startedAt: new Date().toISOString(),
        resumeFromIdx,
      });
      dispatch({ type: "SET_LLM_STATE", state: { kind: "loading" } });

      const understandingForGen =
        state.understanding.kind === "success"
          ? state.understanding.understanding
          : null;
      const memoUnderstandingDigestForGen = understandingForGen
        ? buildMemoUnderstandingDigest(understandingForGen)
        : undefined;
      const userPrioritiesForGen = state.userResearchPriorities.trim()
        ? state.userResearchPriorities
        : undefined;
      const result = await runSectionGeneration({
        project: {
          id: state.dna.projectId,
          ticker: companyName,
          companyName,
        },
        dna: state.dna,
        detection: periodLabel
          ? {
              detectedCompany: companyName,
              periodLabel,
              researchStart: state.periodOverride.researchStart,
              researchCurrent:
                state.detection?.researchCurrent ??
                new Date().toISOString().slice(0, 7),
              assumptionNotes: state.detection?.assumptionNotes ?? [],
            }
          : undefined,
        research,
        initialMemoId: state.initialFile.id,
        memoUnderstandingDigest: memoUnderstandingDigestForGen,
        userPriorities: userPrioritiesForGen,
        apiCall: (req, signal) => api.generateMemoSection(req, signal),
        signal: controller.signal,
        onSectionStart: (sectionId, attempt) => {
          dispatch({ type: "SECTION_STARTED", sectionId, attempt });
        },
        onSectionDone: (sectionId, section) => {
          dispatch({ type: "SECTION_SUCCESS", sectionId, section });
        },
        onSectionFail: () => {
          // SECTION_FAILED dispatch happens after the result resolves so we
          // can also set the LLM error state in lockstep.
        },
        startFromSectionId: failedId,
        existingSections,
      });

      if (generateAbort.current !== controller) return;
      generateAbort.current = null;

      if (result.ok) {
        dispatch({ type: "SET_GENERATED_MEMO", memo: result.memo });
        dispatch({
          type: "SET_LLM_STATE",
          state: {
            kind: "success",
            memo: result.memo,
            providerMetadata: {
              providerName: "openai",
              modelUsed: "gpt-section",
            },
            usedFallback: false,
            warnings: [],
          },
        });
        return;
      }

      if (result.code === "aborted") {
        return;
      }

      if (result.failedSectionId) {
        dispatch({
          type: "SECTION_FAILED",
          sectionId: result.failedSectionId,
          code: result.code,
          message: result.message,
        });
      }
      dispatch({
        type: "SET_LLM_STATE",
        state: {
          kind: "error",
          error: `${result.code} · ${result.message}`,
        },
      });
    },
    [
      state.dna,
      state.extraction,
      state.initialFile,
      state.research,
      state.detection,
      state.periodOverride,
      state.progress.failedSectionId,
      state.completedSections,
      state.understanding,
      state.userResearchPriorities,
      state.selectedCompany,
    ],
  );

  const generateMemo = useCallback(
    (withResearch: boolean): Promise<void> => {
      dispatch({ type: "RESET_PROGRESS" });
      return runOrchestratedGeneration(withResearch, "fresh");
    },
    [runOrchestratedGeneration],
  );

  const retryFailedSection = useCallback(
    (): Promise<void> =>
      runOrchestratedGeneration(Boolean(state.research), "resume"),
    [runOrchestratedGeneration, state.research],
  );

  const retryFullMemo = useCallback((): Promise<void> => {
    dispatch({ type: "RESET_PROGRESS" });
    return runOrchestratedGeneration(Boolean(state.research), "fresh");
  }, [runOrchestratedGeneration, state.research]);

  const startOver = useCallback(() => {
    researchAbort.current?.abort();
    generateAbort.current?.abort();
    researchAbort.current = null;
    generateAbort.current = null;
    dispatch({ type: "RESET" });
  }, []);

  const value = useMemo<MemoProjectContextValue>(() => {
    const effectiveDetection = state.detection
      ? {
          detectedCompany:
            state.selectedCompany?.trim() ||
            state.periodOverride.detectedCompany ||
            state.detection.detectedCompany ||
            "",
          periodLabel:
            state.periodOverride.periodLabel ??
            (state.detection.best
              ? renderPeriodLabel(state.detection.best)
              : ""),
          researchStart: state.periodOverride.researchStart,
          researchCurrent: state.detection.researchCurrent,
          assumptionNotes: state.detection.assumptionNotes,
        }
      : null;

    return {
      state,
      effectiveDetection,
      extractInitialMemo,
      setPeriodOverride,
      runResearch,
      retryFailedResearchPasses,
      retryAllResearch,
      generateMemo,
      retryFailedSection,
      retryFullMemo,
      refreshLlmProviderStatus,
      syncGateTokenSet,
      startOver,
      runMemoUnderstanding,
      rerunMemoUnderstanding,
      skipMemoUnderstanding,
      setUserResearchPriorities,
      setSelectedCompany,
    };
  }, [
    state,
    extractInitialMemo,
    setPeriodOverride,
    runResearch,
    retryFailedResearchPasses,
    retryAllResearch,
    generateMemo,
    retryFailedSection,
    retryFullMemo,
    refreshLlmProviderStatus,
    syncGateTokenSet,
    startOver,
    runMemoUnderstanding,
    rerunMemoUnderstanding,
    skipMemoUnderstanding,
    setUserResearchPriorities,
    setSelectedCompany,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMemoProject(): MemoProjectContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useMemoProject must be used inside <MemoProjectProvider>");
  }
  return ctx;
}

function renderPeriodLabel(p: {
  kind: string;
  isoDate?: string;
  isoMonth?: string;
  monthLabel?: string;
  quarter?: string;
  fiscalYearLabel?: string;
  rawMatch: string;
}): string {
  switch (p.kind) {
    case "iso_date":
      return p.isoDate ?? p.rawMatch;
    case "month_year":
      return p.monthLabel ?? p.isoMonth ?? p.rawMatch;
    case "quarter_fy":
      return `${p.quarter ?? ""} ${p.fiscalYearLabel ?? ""}`.trim();
    case "fiscal_year":
      return p.fiscalYearLabel ?? p.rawMatch;
    default:
      return p.rawMatch;
  }
}
