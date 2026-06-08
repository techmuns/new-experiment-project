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

export interface MemoSection {
  id: string;
  title: string;
  body: string;
  sources: SourceReference[];
  summary?: string;
  bullets?: string[];
  signal?: MemoSectionSignal;
  confidenceNote?: string;
}

export interface FollowUpMemo {
  projectId: string;
  title: string;
  generatedAt: string;
  sections: MemoSection[];
  isDemo: boolean;
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

export interface ResearchSource {
  title: string;
  url: string;
  date?: string;
  note?: string;
  verifiedByWebSearch?: boolean;
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
