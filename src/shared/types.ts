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
  // Phase 6B: the CORE memo body — six sec_* sections printed in the
  // <3-page memo. The renderer (MemoReview) shows these as the memo.
  sections: MemoSection[];
  // Phase 6B: supplementary sup_* panels (Valuation Detail, EPS Bridge,
  // Memo-vs-Actual Financials). Rendered as collapsible drawers BELOW
  // the memo so the printed memo body stays under three pages.
  supplementaryPanels?: MemoSection[];
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
  // Phase 6A: optional links to MemoUnderstanding ids so research findings
  // can be threaded back to specific memo flags / research tasks.
  linkedFlagId?: string;
  linkedResearchTaskId?: string;
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
  // Phase 6A.3: "baseline_recovery" + "baseline_after_timeout" added —
  // emitted by the deterministic memo-baseline tier so the dashboard can
  // render the "Recovered from memo text" ribbon.
  code:
    | LlmGenerationErrorCode
    | "schema_warning"
    | "baseline_recovery"
    | "baseline_after_timeout";
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

// Phase 6B: memo restructured for client feedback (June 2026).
// The follow-up memo is now SIX core "sec_" sections (printed as the
// <3-page memo) plus THREE "sup_" supplementary panels (rendered as
// collapsible drawers BELOW the memo for the deep valuation/EPS/peer
// math that would push the memo over three pages).
// Worker schemas continue to expect nine canonical entries — the renderer
// (MemoReview) splits on the id prefix.
export type CanonicalSectionId =
  // Core memo sections (rendered in the <3-page memo body)
  | "sec_thesis_scorecard"
  | "sec_what_changed"
  | "sec_shareholding"
  | "sec_industry_regulatory"
  | "sec_corporate_events"
  | "sec_investment_action"
  // Supplementary panels (rendered as collapsible drawers below the memo)
  | "sup_valuation_detail"
  | "sup_eps_bridge"
  | "sup_financials_actuals";

// Helper: true if the section id belongs to the core <3-page memo body
// (vs a supplementary drawer). Used by MemoReview to split rendering.
export const CORE_MEMO_SECTION_PREFIX = "sec_";
export const SUPPLEMENTARY_PANEL_PREFIX = "sup_";

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
  // Phase 6A/6B: optional MemoUnderstanding digest. When present, section
  // prompts add memo-specific anchors (thesis pillars, flagged details,
  // valuation framework) — used by every core sec_* section + the three
  // supplementary sup_* panels.
  memoUnderstandingDigest?: MemoUnderstandingDigest;
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
  // Phase 6A: optional MemoUnderstanding digest + per-pass task list.
  // When the digest is present, the pass prompt renders the
  // "Memo-specific anchor for this pass" block listing thesis pillars,
  // flagged details, and research questions selected for this passId.
  memoUnderstandingDigest?: MemoUnderstandingDigest;
  passMemoTasks?: MemoUnderstandingResearchTask[];
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

// ---------- Phase 6A additions: Memo Understanding Engine ----------

export type MemoUnderstandingImportance =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type MemoUnderstandingResearchPriority =
  | "must_check"
  | "important"
  | "nice_to_have";

export type MemoUnderstandingClaimType =
  | "reported"
  | "forecast"
  | "estimate"
  | "guidance"
  | "assumption";

export type MemoUnderstandingFlagCategory =
  | "valuation_anchor"
  | "financial_claim"
  | "segment_driver"
  | "margin_driver"
  | "earnings_quality"
  | "management_claim"
  | "catalyst"
  | "risk"
  | "source_gap"
  | "contradiction"
  | "must_verify";

export type MemoUnderstandingSourcePriority =
  | "company_filings"
  | "exchange_filings"
  | "earnings_call"
  | "investor_presentation"
  | "broker_notes"
  | "market_data"
  | "press";

export interface MemoUnderstandingFlaggedDetail {
  id: string;
  label: string;
  detail: string;
  category: MemoUnderstandingFlagCategory;
  importance: MemoUnderstandingImportance;
  whyItMatters: string;
  memoEvidence: string;
  researchQuestion: string;
}

export interface MemoUnderstandingThesisPillar {
  id: string;
  label: string;
  originalClaim: string;
  evidenceFromMemo: string;
  importance: "high" | "medium" | "low";
  needsResearch: boolean;
  researchPriority: MemoUnderstandingResearchPriority;
}

export interface MemoUnderstandingFinancialClaim {
  id: string;
  metric: string;
  value: string;
  period?: string;
  segment?: string;
  claimType: MemoUnderstandingClaimType;
  whyItMatters: string;
  researchQuestion: string;
}

export interface MemoUnderstandingSegmentClaim {
  id: string;
  segment: string;
  claim: string;
  metric?: string;
  value?: string;
  period?: string;
  importance: "high" | "medium" | "low";
  researchQuestion: string;
}

export interface MemoUnderstandingResearchTask {
  id: string;
  label: string;
  question: string;
  memoAnchor: string;
  linkedFlagIds: string[];
  linkedPillarIds: string[];
  linkedFinancialClaimIds: string[];
  preferredSources: MemoUnderstandingSourcePriority[];
  expectedEvidence: string;
  priority: MemoUnderstandingResearchPriority;
}

export interface MemoUnderstanding {
  projectId: string;
  company: {
    detectedName: string;
    normalizedName?: string;
    ticker?: string;
    aliases: string[];
    sector?: string;
    geography?: string;
  };
  memo: {
    broker?: string;
    author?: string;
    publishedDate?: string;
    periodCovered?: string;
    reportType?: string;
    recommendation?: string;
    targetPrice?: string;
    currentPriceAtMemo?: string;
    upsideAtMemo?: string;
    timeHorizon?: string;
  };
  summary: {
    oneLineSummary: string;
    shortSummary: string;
    originalThesis: string;
    whatTheMemoNeedsToBeRight: string[];
    whatWouldChangeTheView: string[];
  };
  flaggedDetails: MemoUnderstandingFlaggedDetail[];
  thesis: {
    oneLineThesis: string;
    detailedThesis: string;
    thesisPillars: MemoUnderstandingThesisPillar[];
  };
  financials: {
    keyClaims: MemoUnderstandingFinancialClaim[];
    segmentClaims: MemoUnderstandingSegmentClaim[];
  };
  valuation: {
    method?: string;
    targetMultiple?: string;
    targetMetric?: string;
    impliedEPS?: string;
    targetPrice?: string;
    upside?: string;
    keyValuationAssumptions: string[];
    valuationQuestionsToUpdate: string[];
  };
  risksAndCatalysts: {
    catalysts: string[];
    risks: string[];
    watchItems: string[];
  };
  researchPlan: {
    mustAnswerQuestions: string[];
    sourcePriorities: MemoUnderstandingSourcePriority[];
    researchTasks: MemoUnderstandingResearchTask[];
  };
  confidence: {
    extractionConfidence: "high" | "medium" | "low";
    missingFromMemo: string[];
    ambiguousItems: string[];
  };
}

// Compact form sent to /api/research/pass and /api/generate/memo-section.
// Caps enforced by buildMemoUnderstandingDigest (frontend pure helper).
export interface MemoUnderstandingDigest {
  projectId: string;
  oneLineSummary: string;
  recommendation?: string;
  targetPrice?: string;
  valuation: {
    method?: string;
    targetMultiple?: string;
    impliedEPS?: string;
  };
  thesisPillars: Array<{
    id: string;
    label: string;
    importance: "high" | "medium" | "low";
    researchPriority: MemoUnderstandingResearchPriority;
  }>;
  flaggedDetails: Array<
    Pick<
      MemoUnderstandingFlaggedDetail,
      | "id"
      | "label"
      | "detail"
      | "category"
      | "importance"
      | "whyItMatters"
      | "researchQuestion"
    >
  >;
  financialClaims: Array<
    Pick<
      MemoUnderstandingFinancialClaim,
      | "id"
      | "metric"
      | "value"
      | "period"
      | "claimType"
      | "whyItMatters"
      | "researchQuestion"
    >
  >;
  researchTasks: Array<
    Pick<
      MemoUnderstandingResearchTask,
      | "id"
      | "question"
      | "memoAnchor"
      | "linkedFlagIds"
      | "linkedPillarIds"
      | "preferredSources"
      | "priority"
    >
  >;
}

export interface MemoUnderstandRequest {
  project: {
    id: string;
    ticker?: string;
    companyName: string;
    sector?: string;
  };
  detection?: ResearchDetectionInput;
  memo: {
    id?: string;
    text: string;
    sourceFilename: string;
    sizeBytes: number;
  };
  dna?: MemoDNA;
}

export type MemoUnderstandErrorCode = ResearchErrorCode;

export type MemoUnderstandResponse =
  | {
      ok: true;
      understanding: MemoUnderstanding;
      providerMetadata: LlmProviderMetadata;
      warnings: LlmGenerationWarning[];
    }
  | {
      ok: false;
      code: MemoUnderstandErrorCode;
      message: string;
      providerName?: LlmProviderName;
      modelUsed?: string;
    };

export type MemoUnderstandingState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      understanding: MemoUnderstanding;
      providerMetadata: LlmProviderMetadata;
      warnings: LlmGenerationWarning[];
    }
  | { kind: "error"; code: MemoUnderstandErrorCode; message: string };
