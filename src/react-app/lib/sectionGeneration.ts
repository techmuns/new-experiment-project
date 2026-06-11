import type {
  CanonicalSectionId,
  FollowUpMemo,
  GenerateMemoSectionRequest,
  GenerateMemoSectionResponse,
  LlmGenerationErrorCode,
  MemoDNA,
  MemoSection,
  MemoSectionDigestEntry,
  MemoUnderstandingDigest,
  ResearchDetectionInput,
  ResearchFinding,
  ResearchFindingCategory,
  ResearchFindings,
  ResearchThesisCheckpointImpact,
} from "@shared/types";
import {
  CORE_MEMO_SECTION_PREFIX,
  SUPPLEMENTARY_PANEL_PREFIX,
} from "@shared/types";

// Phase 6B: restructured for client feedback (Jun 2026).
// Six core "sec_" sections + three "sup_" supplementary panels.
// The renderer (MemoReview) splits on the id prefix.
export const CANONICAL_SECTION_IDS: readonly CanonicalSectionId[] = [
  "sec_thesis_scorecard",
  "sec_what_changed",
  "sec_shareholding",
  "sec_industry_regulatory",
  "sec_corporate_events",
  "sec_investment_action",
  "sup_valuation_detail",
  "sup_eps_bridge",
  "sup_financials_actuals",
] as const;

export const CORE_SECTION_IDS: readonly CanonicalSectionId[] = [
  "sec_thesis_scorecard",
  "sec_what_changed",
  "sec_shareholding",
  "sec_industry_regulatory",
  "sec_corporate_events",
  "sec_investment_action",
] as const;

export const SUPPLEMENTARY_PANEL_IDS: readonly CanonicalSectionId[] = [
  "sup_valuation_detail",
  "sup_eps_bridge",
  "sup_financials_actuals",
] as const;

export const SECTION_TITLES: Record<CanonicalSectionId, string> = {
  sec_thesis_scorecard: "Memo vs Reality Scorecard",
  sec_what_changed: "What Changed — Industry · Company · Financials",
  sec_shareholding: "Shareholding & Ownership Changes",
  sec_industry_regulatory: "Industry & Regulatory Developments",
  sec_corporate_events: "Corporate Events (Last 12 Months)",
  sec_investment_action: "Updated Investment View",
  sup_valuation_detail: "Valuation Detail · Then vs Now",
  sup_eps_bridge: "EPS Credibility Bridge",
  sup_financials_actuals: "Memo Forecasts vs Reported Financials",
};

export function isCoreSectionId(id: string): boolean {
  return id.startsWith(CORE_MEMO_SECTION_PREFIX);
}

export function isSupplementaryPanelId(id: string): boolean {
  return id.startsWith(SUPPLEMENTARY_PANEL_PREFIX);
}

// Phase 6B: section-aware category routing.
// `filings` is a generic category, but inside the worker pass we now ask
// `official_results` to ALWAYS emit a shareholding-pattern finding under
// the `filings` category. The router below routes such findings to
// sec_shareholding by keyword sniff; everything else stays generic.
const SHAREHOLDING_KEYWORDS = /(shareholding|promoter|pledge|fii\b|dii\b|institutional|mutual fund|insider|qip\b|preferential|warrant|rights issue|buyback|allotment)/i;

function findingMentionsShareholding(f: ResearchFinding): boolean {
  if (SHAREHOLDING_KEYWORDS.test(f.title)) return true;
  if (SHAREHOLDING_KEYWORDS.test(f.summary)) return true;
  if (SHAREHOLDING_KEYWORDS.test(f.relevance)) return true;
  return false;
}

const CORPORATE_EVENT_KEYWORDS = /(acquisition|m&a\b|merger|divest|capex|fund-raise|fundraise|qip\b|debenture|refinanc|buyback|dividend|cfo\b|auditor|kmp\b|board\b|resign|appoint|pivot|litigation|regulatory action)/i;

function findingMentionsCorporateEvent(f: ResearchFinding): boolean {
  if (CORPORATE_EVENT_KEYWORDS.test(f.title)) return true;
  if (CORPORATE_EVENT_KEYWORDS.test(f.summary)) return true;
  return false;
}

const INDUSTRY_KEYWORDS = /(regulat|policy|demand|pricing|competit|disrupt|ai\b|llm\b|industry|sector|substitut|commoditi[sz]|customer concentration)/i;

function findingMentionsIndustry(f: ResearchFinding): boolean {
  if (INDUSTRY_KEYWORDS.test(f.title)) return true;
  if (INDUSTRY_KEYWORDS.test(f.summary)) return true;
  if (INDUSTRY_KEYWORDS.test(f.relevance)) return true;
  return false;
}

// Default category-to-section map (used as a fallback before the smart
// shareholding / corporate-event / industry sniffs run).
const CATEGORY_MAP: Record<CanonicalSectionId, Set<ResearchFindingCategory>> = {
  sec_thesis_scorecard: new Set([
    "financials",
    "guidance",
    "valuation",
  ]),
  sec_what_changed: new Set([
    "financials",
    "guidance",
    "management",
    "valuation",
    "ai_tech_risk",
    "macro",
    "peers",
    "broker_consensus",
    "filings",
    "other",
  ]),
  sec_shareholding: new Set([
    "filings",
    // also accept management/broker_consensus when the finding text mentions ownership
    "management",
    "broker_consensus",
  ]),
  sec_industry_regulatory: new Set([
    "ai_tech_risk",
    "macro",
    "peers",
    "other",
  ]),
  sec_corporate_events: new Set([
    "management",
    "filings",
    "guidance",
    "broker_consensus",
    "other",
  ]),
  sec_investment_action: new Set([
    "financials",
    "guidance",
    "management",
    "valuation",
    "peers",
    "macro",
    "ai_tech_risk",
    "filings",
    "broker_consensus",
    "other",
  ]),
  sup_valuation_detail: new Set(["valuation", "peers", "broker_consensus"]),
  sup_eps_bridge: new Set(["financials", "guidance", "valuation"]),
  sup_financials_actuals: new Set(["financials", "guidance"]),
};

const IMPACT_RANK: Record<ResearchFinding["impact"], number> = {
  negative: 3,
  positive: 2,
  watch: 1,
  neutral: 0,
};

export interface SectionSelection {
  findings: ResearchFinding[];
  checkpoints: ResearchThesisCheckpointImpact[];
  positiveIds: string[];
  negativeIds: string[];
  watchIds: string[];
}

export function selectFindingsForSection(
  sectionId: CanonicalSectionId,
  research: ResearchFindings | null,
  limit: number,
): SectionSelection {
  if (!research) {
    return {
      findings: [],
      checkpoints: [],
      positiveIds: [],
      negativeIds: [],
      watchIds: [],
    };
  }
  const all = research.findings;
  const positives = new Set(research.positiveDevelopments);
  const negatives = new Set(research.negativeDevelopments);
  const watches = new Set(research.neutralOrWatch);
  let picked: ResearchFinding[];

  switch (sectionId) {
    case "sec_shareholding": {
      // Smart sniff: a `filings` finding ONLY counts for sec_shareholding
      // if its text mentions ownership-related vocabulary. This keeps
      // CFO/auditor filings out of the shareholding section.
      picked = all.filter(
        (f) =>
          f.category === "filings" || findingMentionsShareholding(f),
      );
      // Then re-filter by the keyword sniff for non-filings categories.
      picked = picked.filter(
        (f) =>
          f.category === "filings"
            ? findingMentionsShareholding(f) ||
              // a filings finding without shareholding keywords might
              // still belong here if no other finding does — accept it
              // and let the limit cap.
              true
            : findingMentionsShareholding(f),
      );
      break;
    }
    case "sec_corporate_events": {
      // Smart sniff: corporate events are typically `filings` /
      // `management` / `other` whose text mentions M&A, KMP changes,
      // fund-raises, etc. Exclude shareholding-only findings.
      picked = all.filter(
        (f) =>
          CATEGORY_MAP.sec_corporate_events.has(f.category) &&
          (findingMentionsCorporateEvent(f) ||
            !findingMentionsShareholding(f)),
      );
      break;
    }
    case "sec_industry_regulatory": {
      const allowed = CATEGORY_MAP.sec_industry_regulatory;
      picked = all.filter(
        (f) => allowed.has(f.category) || findingMentionsIndustry(f),
      );
      break;
    }
    case "sec_what_changed": {
      // What Changed needs a BREADTH read — pick top impact-ranked across
      // many categories so the model has industry / company / financial
      // colour all in one prompt.
      picked = [...all];
      break;
    }
    case "sec_thesis_scorecard": {
      // Scorecard needs financials + valuation to populate the bridge.
      const allowed = CATEGORY_MAP.sec_thesis_scorecard;
      picked = all.filter(
        (f) => allowed.has(f.category) || mentionsValuation(f) || mentionsEarnings(f),
      );
      break;
    }
    case "sec_investment_action": {
      // Final action: top of each pile (positive / negative / watch).
      const top = (set: Set<string>, n: number): ResearchFinding[] =>
        all
          .filter((f) => set.has(f.id))
          .sort(byImpactRank)
          .slice(0, n);
      const merged = new Map<string, ResearchFinding>();
      for (const f of top(positives, 2)) merged.set(f.id, f);
      for (const f of top(negatives, 2)) merged.set(f.id, f);
      for (const f of top(watches, 2)) merged.set(f.id, f);
      picked = [...merged.values()];
      break;
    }
    case "sup_eps_bridge": {
      const allowed = CATEGORY_MAP.sup_eps_bridge;
      picked = all.filter(
        (f) => allowed.has(f.category) || mentionsEarnings(f),
      );
      break;
    }
    case "sup_valuation_detail": {
      const allowed = CATEGORY_MAP.sup_valuation_detail;
      picked = all.filter(
        (f) => allowed.has(f.category) || mentionsValuation(f),
      );
      break;
    }
    case "sup_financials_actuals": {
      const allowed = CATEGORY_MAP.sup_financials_actuals;
      picked = all.filter((f) => allowed.has(f.category));
      break;
    }
  }

  picked = [...picked].sort(byImpactRank).slice(0, Math.max(0, limit));
  const pickedIds = new Set(picked.map((f) => f.id));
  const checkpoints = research.thesisCheckpointImpact.filter((c) =>
    c.findingIds.some((id) => pickedIds.has(id)),
  );
  const positiveIds = picked.filter((f) => positives.has(f.id)).map((f) => f.id);
  const negativeIds = picked.filter((f) => negatives.has(f.id)).map((f) => f.id);
  const watchIds = picked.filter((f) => watches.has(f.id)).map((f) => f.id);

  return { findings: picked, checkpoints, positiveIds, negativeIds, watchIds };
}

function byImpactRank(a: ResearchFinding, b: ResearchFinding): number {
  return IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact];
}

function mentionsEarnings(f: ResearchFinding): boolean {
  const text = `${f.summary} ${f.relevance}`.toLowerCase();
  return /\b(eps|earnings|pat|profit|margin|guidance)\b/.test(text);
}

function mentionsValuation(f: ResearchFinding): boolean {
  const text = `${f.summary} ${f.relevance}`.toLowerCase();
  return /\b(valuation|multiple|p\/e|price target|target price|peer|p\/b|ev\/ebitda)\b/.test(text);
}

export function distillStyleSample(dna: MemoDNA, maxChars: number): string[] {
  const out: string[] = [];
  let running = 0;
  for (const s of dna.styleTone.sampleSentences ?? []) {
    const cleaned = s.trim();
    if (!cleaned) continue;
    if (running + cleaned.length > maxChars) break;
    out.push(cleaned);
    running += cleaned.length;
    if (out.length >= 5) break;
  }
  if (out.length === 0 && dna.originalThesis) {
    out.push(dna.originalThesis.slice(0, Math.min(800, maxChars)));
  }
  return out;
}

// Phase 6B: the final-action digest now draws on the five PRIOR core
// sections of the new memo (scorecard, what-changed, shareholding,
// industry, corporate-events).
const DIGEST_SECTION_IDS: CanonicalSectionId[] = [
  "sec_thesis_scorecard",
  "sec_what_changed",
  "sec_shareholding",
  "sec_industry_regulatory",
  "sec_corporate_events",
];

export function buildPriorSectionsDigest(
  completed: Partial<Record<CanonicalSectionId, MemoSection>>,
): MemoSectionDigestEntry[] {
  const out: MemoSectionDigestEntry[] = [];
  for (const id of DIGEST_SECTION_IDS) {
    const s = completed[id];
    if (!s) continue;
    out.push({
      id,
      signal: s.signal ?? "neutral",
      confidence: s.confidence,
      summary: truncate(s.summary ?? "", 250),
      topBullets: (s.bullets ?? []).slice(0, 2).map((b) => truncate(b, 200)),
    });
  }
  return out;
}

export interface AssembleMemoArgs {
  project: { id: string; companyName: string };
  sections: MemoSection[];
  research: ResearchFindings | null;
  generatedAt: string;
}

export function assembleMemo(args: AssembleMemoArgs): FollowUpMemo {
  const ordered: MemoSection[] = [];
  const map = new Map<string, MemoSection>();
  for (const s of args.sections) map.set(s.id, s);
  for (const id of CANONICAL_SECTION_IDS) {
    const s = map.get(id);
    if (s) ordered.push(s);
  }
  if (ordered.length !== CANONICAL_SECTION_IDS.length) {
    throw new Error(
      `assembleMemo: expected ${CANONICAL_SECTION_IDS.length} canonical sections, got ${ordered.length}`,
    );
  }

  // Split ordered into core sections and supplementary panels.
  const coreSections = ordered.filter((s) => isCoreSectionId(s.id));
  const supplementaryPanels = ordered.filter((s) =>
    isSupplementaryPanelId(s.id),
  );

  const memo: FollowUpMemo = {
    projectId: args.project.id,
    title: `Follow-up Memo — ${args.project.companyName}`,
    generatedAt: args.generatedAt,
    sections: coreSections,
    supplementaryPanels:
      supplementaryPanels.length > 0 ? supplementaryPanels : undefined,
    isDemo: false,
    sourceMode: "llm",
  };

  const manualChecks = deriveManualChecksRemaining(args.research);
  if (manualChecks.length > 0) {
    memo.manualChecksRemaining = manualChecks;
  }
  return memo;
}

function deriveManualChecksRemaining(research: ResearchFindings | null): string[] {
  if (research === null) {
    return [
      "External research was not run for this memo; all forward-looking claims need to be verified by a human analyst.",
    ];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of research.unresolvedQuestions ?? []) {
    if (typeof q !== "string") continue;
    const trimmed = q.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 6) break;
  }
  return out;
}

// --- Orchestration ---

export interface RunSectionGenerationArgs {
  project: { id: string; ticker: string; companyName: string; sector?: string };
  dna: MemoDNA;
  detection?: ResearchDetectionInput;
  research: ResearchFindings | null;
  initialMemoId?: string;
  // Phase 6A: optional MemoUnderstanding digest. When present, each
  // section request carries it and the section prompt adds the
  // memo-anchored "Original memo's anchor" block.
  memoUnderstandingDigest?: MemoUnderstandingDigest;
  apiCall: (
    req: GenerateMemoSectionRequest,
    signal?: AbortSignal,
  ) => Promise<GenerateMemoSectionResponse>;
  signal?: AbortSignal;
  onSectionStart: (sectionId: CanonicalSectionId, attempt: 1 | 2) => void;
  onSectionDone: (sectionId: CanonicalSectionId, section: MemoSection) => void;
  onSectionFail: (
    sectionId: CanonicalSectionId,
    code: LlmGenerationErrorCode,
    message: string,
  ) => void;
  startFromSectionId?: CanonicalSectionId;
  existingSections?: Partial<Record<CanonicalSectionId, MemoSection>>;
}

export type RunSectionGenerationResult =
  | { ok: true; memo: FollowUpMemo }
  | {
      ok: false;
      code: LlmGenerationErrorCode | "aborted";
      message: string;
      failedSectionId?: CanonicalSectionId;
      completedSections: Partial<Record<CanonicalSectionId, MemoSection>>;
    };

const RETRY_COMPACT_CODES: ReadonlySet<LlmGenerationErrorCode> = new Set([
  "timeout",
  "provider_error",
  "parse_error",
  "rate_limited",
]);

export async function runSectionGeneration(
  args: RunSectionGenerationArgs,
): Promise<RunSectionGenerationResult> {
  const completed: Partial<Record<CanonicalSectionId, MemoSection>> = {
    ...(args.existingSections ?? {}),
  };
  const startIdx = args.startFromSectionId
    ? Math.max(0, CANONICAL_SECTION_IDS.indexOf(args.startFromSectionId))
    : 0;

  for (let i = 0; i < CANONICAL_SECTION_IDS.length; i++) {
    const sectionId = CANONICAL_SECTION_IDS[i];
    if (i < startIdx && completed[sectionId]) continue;

    if (args.signal?.aborted) {
      return {
        ok: false,
        code: "aborted",
        message: "Generation aborted",
        completedSections: completed,
      };
    }

    const request = buildSectionRequest(args, sectionId, completed, false);

    args.onSectionStart(sectionId, 1);
    let response = await safeCall(args.apiCall, request, args.signal);

    if (response.aborted) {
      return {
        ok: false,
        code: "aborted",
        message: "Generation aborted",
        failedSectionId: sectionId,
        completedSections: completed,
      };
    }

    if (
      !response.value.ok &&
      RETRY_COMPACT_CODES.has(response.value.code) &&
      !args.signal?.aborted
    ) {
      const retryReq = buildSectionRequest(args, sectionId, completed, true);
      args.onSectionStart(sectionId, 2);
      response = await safeCall(args.apiCall, retryReq, args.signal);
      if (response.aborted) {
        return {
          ok: false,
          code: "aborted",
          message: "Generation aborted",
          failedSectionId: sectionId,
          completedSections: completed,
        };
      }
    }

    if (!response.value.ok) {
      args.onSectionFail(sectionId, response.value.code, response.value.message);
      return {
        ok: false,
        code: response.value.code,
        message: response.value.message,
        failedSectionId: sectionId,
        completedSections: completed,
      };
    }

    completed[sectionId] = response.value.section;
    args.onSectionDone(sectionId, response.value.section);
  }

  const orderedSections: MemoSection[] = [];
  for (const id of CANONICAL_SECTION_IDS) {
    const s = completed[id];
    if (s) orderedSections.push(s);
  }
  const memo = assembleMemo({
    project: { id: args.project.id, companyName: args.project.companyName },
    sections: orderedSections,
    research: args.research,
    generatedAt: new Date().toISOString(),
  });
  return { ok: true, memo };
}

interface SafeCallResult {
  aborted: boolean;
  value: GenerateMemoSectionResponse;
}

async function safeCall(
  apiCall: RunSectionGenerationArgs["apiCall"],
  req: GenerateMemoSectionRequest,
  signal: AbortSignal | undefined,
): Promise<SafeCallResult> {
  try {
    const value = await apiCall(req, signal);
    if (signal?.aborted) {
      return {
        aborted: true,
        value: {
          ok: false,
          code: "provider_error",
          message: "Aborted",
          sectionId: req.sectionId,
        },
      };
    }
    return { aborted: false, value };
  } catch (err) {
    if (signal?.aborted) {
      return {
        aborted: true,
        value: {
          ok: false,
          code: "provider_error",
          message: "Aborted",
          sectionId: req.sectionId,
        },
      };
    }
    const message = err instanceof Error ? err.message : "Network error";
    return {
      aborted: false,
      value: {
        ok: false,
        code: "provider_error",
        message,
        sectionId: req.sectionId,
      },
    };
  }
}

function buildSectionRequest(
  args: RunSectionGenerationArgs,
  sectionId: CanonicalSectionId,
  completed: Partial<Record<CanonicalSectionId, MemoSection>>,
  retryCompact: boolean,
): GenerateMemoSectionRequest {
  const limit = retryCompact ? 4 : 6;
  const selection = selectFindingsForSection(sectionId, args.research, limit);
  const styleSample = distillStyleSample(
    args.dna,
    retryCompact ? 800 : 1500,
  );
  const req: GenerateMemoSectionRequest = {
    sectionId,
    project: args.project,
    dna: args.dna,
    detection: args.detection,
    relevantFindings: selection.findings,
    relevantCheckpointImpacts:
      selection.checkpoints.length > 0 ? selection.checkpoints : undefined,
    positiveDevelopmentIds:
      selection.positiveIds.length > 0 ? selection.positiveIds : undefined,
    negativeDevelopmentIds:
      selection.negativeIds.length > 0 ? selection.negativeIds : undefined,
    watchDevelopmentIds:
      selection.watchIds.length > 0 ? selection.watchIds : undefined,
    styleSample: styleSample.length > 0 ? styleSample : undefined,
    initialMemoId: args.initialMemoId,
    memoUnderstandingDigest: args.memoUnderstandingDigest,
    retryCompact: retryCompact ? true : undefined,
  };
  if (sectionId === "sec_investment_action") {
    const digest = buildPriorSectionsDigest(completed);
    if (digest.length > 0) req.priorSectionsDigest = digest;
  }
  return req;
}

function truncate(value: string, max: number): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}
