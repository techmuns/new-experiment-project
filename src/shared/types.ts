export type MemoProjectStatus = "demo" | "draft" | "active" | "archived";

export type DocumentKind =
  | "initial_memo"
  | "financials"
  | "management_commentary"
  | "broker_notes"
  | "competitor_notes"
  | "macro_notes"
  | "market_data";

export interface UploadedDocument {
  id: string;
  projectId: string;
  kind: DocumentKind;
  filename: string;
  sizeBytes: number;
  isDemo: boolean;
  uploadedAt: string;
}

export interface MemoProject {
  id: string;
  ticker: string;
  companyName: string;
  sector: string;
  status: MemoProjectStatus;
  createdAt: string;
  updatedAt: string;
  uploads: UploadedDocument[];
}

export interface SourceReference {
  documentId: string;
  page?: number;
  quote?: string;
}

export interface ThesisCheckpoint {
  id: string;
  label: string;
  expectedDirection: "up" | "down" | "flat";
  rationale: string;
  sources: SourceReference[];
}

export interface MemoDNA {
  projectId: string;
  originalThesis: string;
  keyAssumptions: string[];
  styleTone: {
    adjectives: string[];
    sampleSentences: string[];
  };
  analyticalFramework: string[];
  valuationFramework: {
    method: string;
    targetMultiple: string;
    bridgeNotes: string[];
  };
  openQuestions: string[];
  riskChecklist: {
    category: string;
    risks: string[];
  }[];
  thesisCheckpoints: ThesisCheckpoint[];
  isDemo: boolean;
}

export interface UpdatePack {
  projectId: string;
  financials?: UploadedDocument;
  commentary?: UploadedDocument;
  brokerNotes?: UploadedDocument[];
  competitorNotes?: UploadedDocument[];
  macroNotes?: UploadedDocument[];
  marketData?: UploadedDocument[];
}

// Forward declaration so MemoSection.signal resolves textually as well as via TS hoisting.
export type MemoSectionSignal = "positive" | "neutral" | "negative" | "watch";

// Phase 5B: per-section confidence label. Drives the confidence pill in
// MemoReview and the inline "confidence: X" tag in the Markdown copy.
export type MemoConfidence = "high" | "medium" | "low";

// Phase 5B: compact bridge row for financial / EPS / valuation sections.
// All optional except `metric` so the model can leave a column blank
// rather than invent a value.
export interface FinancialBridgeRow {
  metric: string;
  original?: string;
  latest?: string;
  readThrough?: string;
}

export interface MemoSection {
  id: string;
  title: string;
  body: string;
  sources: SourceReference[];
  summary?: string;
  bullets?: string[];
  signal?: MemoSectionSignal;
  confidenceNote?: string;
  confidence?: MemoConfidence;
  bridge?: FinancialBridgeRow[];
}

export interface FollowUpMemo {
  projectId: string;
  title: string;
  generatedAt: string;
  sections: MemoSection[];
  isDemo: boolean;
  // Single sink for residual manual-check items, rendered once at the
  // foot of the memo. Replaces per-section "Needs manual verification."
  manualChecksRemaining?: string[];
  // Phase 5C: tag the build path. "llm" = OpenAI generation, "demo" =
  // fixture, "deterministic" = client-side fallback built from research
  // findings. UI uses this to render the fallback banner.
  sourceMode?: FollowUpMemoSourceMode;
}

export type GenerationStepStatus = "not_started" | "ready" | "demo_generated";

export interface GenerationStep {
  id: string;
  label: string;
  description: string;
  status: GenerationStepStatus;
}

export type GenerationRunStatus =
  | "not_started"
  | "ready"
  | "demo_generated"
  | "running"
  | "complete"
  | "failed";

export interface GenerationRun {
  id: string;
  projectId: string;
  status: GenerationRunStatus;
  steps: GenerationStep[];
  startedAt?: string;
  completedAt?: string;
}

export interface HealthResponse {
  status: "ok";
  phase: "1-demo";
  timestamp: string;
}

// ---------- Phase 2 additions ----------

export type MemoAnalysisMode = "demo" | "extracted";

export type ExtractionStatus =
  | "idle"
  | "extracting"
  | "success"
  | "partial"
  | "unsupported"
  | "error";

export interface ExtractionResult {
  status: ExtractionStatus;
  text: string;
  characterCount: number;
  wordCount: number;
  pageCount?: number;
  warnings: string[];
  errorMessage?: string;
  source: {
    filename: string;
    sizeBytes: number;
    mime: string;
    extension: string;
  };
  extractedAt: string;
}

export interface LocalUploadedFile {
  id: string;
  kind: DocumentKind;
  filename: string;
  sizeBytes: number;
  mime: string;
  extension: string;
  uploadedAt: string;
  extractionSupported: boolean;
}

export interface KeywordSignal {
  phrase: string;
  category: string;
  weight: number;
  hits: number;
}

export interface StyleSignal {
  avgSentenceLength: number;
  firstPersonRatio: number;
  hedgeRatio: number;
  bulletDensity: number;
  numericalDensity: number;
}

// ---------- Phase 3 additions ----------

export type SignalPolarity = "positive" | "negative" | "neutral";

export type UpdateSignalCategory =
  | "financial_growth"
  | "margin"
  | "guidance"
  | "management"
  | "ma_integration"
  | "recurring_quality"
  | "valuation"
  | "ai_macro_competitive"
  | "unresolved_question";

export interface DocumentSourceSnippet {
  documentId: string;
  kind: DocumentKind;
  quote: string;
  page?: number;
}

export interface UpdateSignal {
  id: string;
  category: UpdateSignalCategory;
  polarity: SignalPolarity;
  phrase: string;
  weight: number;
  documentKind: DocumentKind;
  source: DocumentSourceSnippet;
}

export interface UpdatePackAnalysis {
  signals: UpdateSignal[];
  byCategory: Partial<Record<UpdateSignalCategory, UpdateSignal[]>>;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  netPolarityScore: number;
  documentsAnalyzed: DocumentKind[];
  unsupportedDocuments: DocumentKind[];
}

export type GeneratedMemoStatus =
  | "missing_initial_memo"
  | "missing_update_pack"
  | "ready"
  | "generated";

export interface FollowUpMemoGenerationInput {
  dna: MemoDNA;
  analysis: UpdatePackAnalysis;
  uploads: Partial<Record<DocumentKind, LocalUploadedFile>>;
  generatedAt: string;
}

export interface FollowUpMemoGenerationResult {
  memo: FollowUpMemo;
  analysis: UpdatePackAnalysis;
  overallSignal: MemoSectionSignal;
  warnings: string[];
}

// ---------- Phase 4A additions: LLM follow-up memo generation ----------

export type LlmProviderName = "anthropic" | "openai" | "none";

export interface LlmProviderMetadata {
  providerName: LlmProviderName;
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
}

export type ApiKeySource = "LLM_API_KEY" | "OPENAI_API_KEY" | "none";

export interface LlmStatusResponse {
  llmEnabled: boolean;
  providerConfigured: boolean;
  apiKeyConfigured: boolean;
  apiKeySource?: ApiKeySource;
  provider?: LlmProviderName;
  model?: string;
  gateEnabled: boolean;
  gateConfigured: boolean;
  llmReady: boolean;
  researchAvailable?: boolean;
  fallbackAvailable: true;
  warnings: string[];
}

export interface GenerateFollowUpMemoUpdateDoc {
  id: string;
  kind: DocumentKind;
  filename: string;
  text: string;
}

export interface GenerateFollowUpMemoRequest {
  project: {
    id: string;
    ticker: string;
    companyName: string;
    sector?: string;
  };
  initialMemo: {
    id?: string;
    text: string;
    sourceFilename: string;
    sizeBytes: number;
  };
  updateDocs?: GenerateFollowUpMemoUpdateDoc[];
  dna: MemoDNA;
  analysis?: UpdatePackAnalysis;
  research?: ResearchFindings | null;
  detection?: ResearchDetectionInput;
  generationOptions?: {
    maxTokens?: number;
    // Phase 5C: when true, the worker uses trimRequestBodyCompact (8k
    // initial memo, 12 findings, 4 sources/finding, etc.) and clamps the
    // max output tokens to a lower ceiling. The worker also auto-trips
    // this branch pre-call when the assembled default prompt exceeds the
    // safe size threshold — see worker/index.ts.
    compact?: boolean;
  };
}

// ---------- Phase 5 additions: period detection + OpenAI research ----------

export type DetectedPeriodKind =
  | "iso_date"
  | "month_year"
  | "quarter_fy"
  | "fiscal_year"
  | "phrase";

export interface DetectedPeriod {
  rawMatch: string;
  kind: DetectedPeriodKind;
  isoDate?: string;
  isoMonth?: string;
  monthLabel?: string;
  quarter?: "Q1" | "Q2" | "Q3" | "Q4";
  fiscalYearLabel?: string;
  fiscalYearNumber?: number;
}

export type DetectionConfidence = "high" | "medium" | "low";

export interface PeriodDetectionResult {
  detectedCompany?: string;
  candidates: DetectedPeriod[];
  best?: DetectedPeriod;
  researchStart?: string;
  researchCurrent: string;
  confidence: DetectionConfidence;
  assumptionNotes: string[];
  // Phase 5C: ticker pulled from "HAVL IN", "NSE: HAVELLS", "Ticker: …"
  // etc. — used as a trailing chip in the header + as a tiebreaker for
  // company detection. Confidence + reason are populated by the
  // company-detection heuristic so the PeriodPanel can prompt the user
  // to confirm when the detector isn't sure.
  detectedTicker?: string;
  companyDetectionConfidence?: DetectionConfidence;
  companyDetectionReason?: string;
}

export interface ResearchDetectionInput {
  detectedCompany?: string;
  periodLabel: string;
  researchStart?: string;
  researchCurrent: string;
  assumptionNotes?: string[];
}

export type ResearchFindingCategory =
  | "financials"
  | "management"
  | "filings"
  | "guidance"
  | "broker_consensus"
  | "valuation"
  | "peers"
  | "macro"
  | "ai_tech_risk"
  | "other";

export type ResearchFindingImpact = "positive" | "negative" | "neutral" | "watch";

// Phase 5B: source-priority tier. The research prompt instructs the
// model to label each source; the worker validator then runs a
// conservative URL/title-based override that only ever DOWNGRADES the
// model's tier (server never upgrades a press source to official). The
// memo prompt and the UI consume this single normalized value.
export type SourceTier =
  | "official"
  | "company"
  | "exchange"
  | "transcript"
  | "press"
  | "market_data"
  | "other";

export interface ResearchSource {
  title: string;
  url: string;
  date?: string;
  note?: string;
  verifiedByWebSearch?: boolean;
  tier?: SourceTier;
}

export interface ResearchFinding {
  id: string;
  category: ResearchFindingCategory;
  title: string;
  summary: string;
  impact: ResearchFindingImpact;
  relevance: string;
  sources: ResearchSource[];
  thesisCheckpointId?: string;
}

export interface ResearchThesisCheckpointImpact {
  checkpointId: string;
  impact: "supported" | "challenged" | "no_update";
  note: string;
  findingIds: string[];
}

export interface ResearchFindings {
  generatedAt: string;
  company: string;
  researchWindow: { startIsoMonth: string; endIsoMonth: string };
  findings: ResearchFinding[];
  positiveDevelopments: string[];
  negativeDevelopments: string[];
  neutralOrWatch: string[];
  thesisCheckpointImpact: ResearchThesisCheckpointImpact[];
  unresolvedQuestions: string[];
  warnings: string[];
}

export interface ResearchUpdatesRequest {
  project: {
    id: string;
    ticker?: string;
    companyName: string;
    sector?: string;
  };
  initialMemo: {
    id?: string;
    text: string;
    sourceFilename: string;
    sizeBytes: number;
  };
  dna: MemoDNA;
  detection: ResearchDetectionInput;
  thesisCheckpoints?: ThesisCheckpoint[];
  scope?: { maxFindings?: number };
}

export type ResearchErrorCode =
  | "not_configured"
  | "provider_missing"
  | "api_key_missing"
  | "gate_misconfigured"
  | "llm_access_denied"
  | "research_unavailable"
  | "research_no_sources"
  | "provider_error"
  | "parse_error"
  | "timeout"
  | "rate_limited";

export type ResearchUpdatesResponse =
  | {
      ok: true;
      research: ResearchFindings;
      providerMetadata: LlmProviderMetadata;
      warnings: LlmGenerationWarning[];
    }
  | {
      ok: false;
      code: ResearchErrorCode;
      message: string;
      providerName?: LlmProviderName;
      modelUsed?: string;
      fallbackAvailable: true;
    };

export type ResearchGenerationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      research: ResearchFindings;
      providerMetadata: LlmProviderMetadata;
      warnings: LlmGenerationWarning[];
    }
  | { kind: "error"; code: ResearchErrorCode; message: string };

export type LlmGenerationErrorCode =
  | "not_configured"
  | "provider_missing"
  | "api_key_missing"
  | "gate_misconfigured"
  | "llm_access_denied"
  | "provider_error"
  | "parse_error"
  | "timeout"
  | "rate_limited";

export interface LlmGenerationWarning {
  code: LlmGenerationErrorCode | "schema_warning";
  message: string;
}

export type GenerateFollowUpMemoResponse =
  | {
      ok: true;
      memo: FollowUpMemo;
      providerMetadata: LlmProviderMetadata;
      warnings: LlmGenerationWarning[];
    }
  | {
      ok: false;
      code: LlmGenerationErrorCode;
      message: string;
      providerName?: LlmProviderName;
      modelUsed?: string;
      fallbackAvailable: true;
    };

export type FollowUpMemoSourceMode = "demo" | "deterministic" | "llm";

export type LlmGenerationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      memo: FollowUpMemo;
      providerMetadata: LlmProviderMetadata;
      usedFallback: boolean;
      warnings: LlmGenerationWarning[];
    }
  | { kind: "error"; error: string };

// ---------- Phase 5D additions: section-by-section memo generation ----------

export type CanonicalSectionId =
  | "sec_thesis_snapshot"
  | "sec_q4_retest"
  | "sec_mgmt_retest"
  | "sec_ai_macro_risk"
  | "sec_memo_held"
  | "sec_memo_broke"
  | "sec_eps_bridge"
  | "sec_valuation_peer_gap"
  | "sec_final_action";

export interface MemoSectionDigestEntry {
  id: CanonicalSectionId;
  signal: MemoSectionSignal;
  confidence?: MemoConfidence;
  summary: string;
  topBullets: string[];
}

export interface GenerateMemoSectionRequest {
  sectionId: CanonicalSectionId;
  project: {
    id: string;
    ticker: string;
    companyName: string;
    sector?: string;
  };
  dna: MemoDNA;
  detection?: ResearchDetectionInput;
  relevantFindings: ResearchFinding[];
  relevantCheckpointImpacts?: ResearchThesisCheckpointImpact[];
  positiveDevelopmentIds?: string[];
  negativeDevelopmentIds?: string[];
  watchDevelopmentIds?: string[];
  styleSample?: string[];
  initialMemoId?: string;
  priorSectionsDigest?: MemoSectionDigestEntry[];
  retryCompact?: boolean;
}

export type GenerateMemoSectionResponse =
  | {
      ok: true;
      section: MemoSection;
      providerMetadata: LlmProviderMetadata;
      warnings: LlmGenerationWarning[];
    }
  | {
      ok: false;
      code: LlmGenerationErrorCode;
      message: string;
      providerName?: LlmProviderName;
      modelUsed?: string;
      sectionId: CanonicalSectionId;
    };

export type SectionRunStatus = "pending" | "running" | "success" | "failed";

export interface SectionRunState {
  id: CanonicalSectionId;
  title: string;
  status: SectionRunStatus;
  attempt: 0 | 1 | 2;
  errorCode?: LlmGenerationErrorCode;
  errorMessage?: string;
}

export interface MemoGenerationProgress {
  kind: "idle" | "running" | "complete" | "failed";
  startedAt?: string;
  sections: SectionRunState[];
  completedCount: number;
  failedSectionId?: CanonicalSectionId;
}

// ---------- Phase 5E additions: multi-pass research ----------

export type ResearchPassId =
  | "official_results"
  | "management_call"
  | "investor_presentation"
  | "press_and_results"
  | "valuation_market"
  | "risks_competition";

export interface ResearchPassCompanyAliases {
  longName: string;
  shortName?: string;
  informalName?: string;
  ticker?: string;
  exchangeTicker?: string;
  exchangeTickerAlt?: string;
  ric?: string;
}

export interface ResearchPassCompactDna {
  projectId: string;
  originalThesisHead: string;
  keyAssumptions: string[];
  toneAdjectives: string[];
  analyticalFramework: string[];
  valuationFramework: {
    method: string;
    targetMultiple: string;
    bridgeNotes: string[];
  };
  thesisCheckpoints: Array<{
    id: string;
    label: string;
    expectedDirection: "up" | "down" | "flat";
  }>;
}

export interface ResearchPassRequest {
  passId: ResearchPassId;
  project: {
    id: string;
    ticker?: string;
    companyName: string;
    sector?: string;
  };
  companyAliases: ResearchPassCompanyAliases;
  dna: ResearchPassCompactDna;
  detection: ResearchDetectionInput;
  thesisCheckpoints?: ThesisCheckpoint[];
  retryCompact?: boolean;
}

export interface ResearchPassHarvestedUrl {
  url: string;
  title?: string;
  date?: string;
}

export type ResearchPassResponse =
  | {
      ok: true;
      passId: ResearchPassId;
      findings: ResearchFinding[];
      harvestedUrls: ResearchPassHarvestedUrl[];
      unresolvedQuestions: string[];
      warnings: LlmGenerationWarning[];
      providerMetadata: LlmProviderMetadata;
    }
  | {
      ok: false;
      passId: ResearchPassId;
      code: ResearchErrorCode;
      message: string;
      providerName?: LlmProviderName;
      modelUsed?: string;
    };

export type ResearchPassStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export interface ResearchPassRunState {
  id: ResearchPassId;
  title: string;
  status: ResearchPassStatus;
  attempt: 0 | 1 | 2;
  errorCode?: ResearchErrorCode;
  errorMessage?: string;
  findingCount?: number;
}

export interface ResearchProgress {
  kind:
    | "idle"
    | "running"
    | "complete"
    | "complete_with_warnings"
    | "failed";
  startedAt?: string;
  passes: ResearchPassRunState[];
  failedPassIds: ResearchPassId[];
}
