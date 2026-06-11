import type {
  MemoUnderstanding,
  MemoUnderstandingDigest,
  MemoUnderstandingFinancialClaim,
  MemoUnderstandingFlagCategory,
  MemoUnderstandingFlaggedDetail,
  MemoUnderstandingImportance,
  MemoUnderstandingResearchTask,
  ResearchPassId,
} from "@shared/types";

// Phase 6A: pure helpers (no React, no browser APIs). Used by the
// MemoUnderstandingCard, the MemoProjectContext, and the synthetic tests.

export interface UnderstandingSummary {
  flagCount: number;
  pillarCount: number;
  claimCount: number;
  researchQuestionCount: number;
  confidence: "high" | "medium" | "low";
}

export function summarizeUnderstanding(
  u: MemoUnderstanding,
): UnderstandingSummary {
  return {
    flagCount: u.flaggedDetails.length,
    pillarCount: u.thesis.thesisPillars.length,
    claimCount:
      u.financials.keyClaims.length + u.financials.segmentClaims.length,
    researchQuestionCount: u.researchPlan.researchTasks.length,
    confidence: u.confidence.extractionConfidence,
  };
}

// Investor-grade ordering: category priority (thesis-critical first) →
// importance desc → id asc. source_gap / management_claim NEVER fill the
// visible top-N unless other higher-priority categories have run out.
const CATEGORY_RANK: Record<MemoUnderstandingFlagCategory, number> = {
  valuation_anchor: 1,
  earnings_quality: 2,
  segment_driver: 3,
  margin_driver: 4,
  financial_claim: 5,
  catalyst: 6,
  risk: 7,
  must_verify: 8,
  contradiction: 9,
  management_claim: 10,
  source_gap: 11,
};
const IMPORTANCE_RANK: Record<MemoUnderstandingImportance, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function topFlagged(
  u: MemoUnderstanding,
  n: number,
): MemoUnderstandingFlaggedDetail[] {
  // Category-priority dominates: thesis-critical categories (valuation_anchor,
  // earnings_quality, segment_driver, margin_driver, financial_claim,
  // catalyst, risk, must_verify, contradiction) ALWAYS outrank
  // management_claim / source_gap, regardless of importance. Within a
  // category, importance breaks ties.
  const sorted = [...u.flaggedDetails].sort((a, b) => {
    const catA = CATEGORY_RANK[a.category];
    const catB = CATEGORY_RANK[b.category];
    if (catA !== catB) return catA - catB;
    const impA = IMPORTANCE_RANK[a.importance];
    const impB = IMPORTANCE_RANK[b.importance];
    if (impA !== impB) return impA - impB;
    return a.id.localeCompare(b.id);
  });
  // Visible top-N: only critical + high importance qualify.
  const primary = sorted.filter(
    (f) => f.importance === "critical" || f.importance === "high",
  );
  return primary.slice(0, n);
}

// Phase 6A.1: digest caps aligned with compact-first schema (schema.ts).
const DIGEST_MAX_FLAGS = 5;
const DIGEST_MAX_PILLARS = 5;
const DIGEST_MAX_CLAIMS = 6;
const DIGEST_MAX_TASKS = 8;

export function buildMemoUnderstandingDigest(
  u: MemoUnderstanding,
): MemoUnderstandingDigest {
  const flagsByPriority = [...u.flaggedDetails].sort((a, b) => {
    const catA = CATEGORY_RANK[a.category];
    const catB = CATEGORY_RANK[b.category];
    if (catA !== catB) return catA - catB;
    const impA = IMPORTANCE_RANK[a.importance];
    const impB = IMPORTANCE_RANK[b.importance];
    if (impA !== impB) return impA - impB;
    return a.id.localeCompare(b.id);
  });
  const pillarsByPriority = [...u.thesis.thesisPillars].sort((a, b) => {
    const ra = priorityRank(a.researchPriority);
    const rb = priorityRank(b.researchPriority);
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
  const claimsByPriority = [...u.financials.keyClaims].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const tasksByPriority = [...u.researchPlan.researchTasks].sort((a, b) => {
    const ra = priorityRank(a.priority);
    const rb = priorityRank(b.priority);
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });

  return {
    projectId: u.projectId,
    oneLineSummary: u.summary.oneLineSummary,
    recommendation: u.memo.recommendation,
    targetPrice: u.memo.targetPrice,
    valuation: {
      method: u.valuation.method,
      targetMultiple: u.valuation.targetMultiple,
      impliedEPS: u.valuation.impliedEPS,
    },
    thesisPillars: pillarsByPriority
      .slice(0, DIGEST_MAX_PILLARS)
      .map((p) => ({
        id: p.id,
        label: truncate(p.label, 160),
        importance: p.importance,
        researchPriority: p.researchPriority,
      })),
    flaggedDetails: flagsByPriority.slice(0, DIGEST_MAX_FLAGS).map((f) => ({
      id: f.id,
      label: truncate(f.label, 120),
      detail: truncate(f.detail, 200),
      category: f.category,
      importance: f.importance,
      whyItMatters: truncate(f.whyItMatters, 240),
      researchQuestion: truncate(f.researchQuestion, 240),
    })),
    financialClaims: claimsByPriority.slice(0, DIGEST_MAX_CLAIMS).map((c) => ({
      id: c.id,
      metric: truncate(c.metric, 120),
      value: truncate(c.value, 120),
      period: c.period,
      claimType: c.claimType,
      whyItMatters: truncate(c.whyItMatters, 200),
      researchQuestion: truncate(c.researchQuestion, 200),
    })),
    researchTasks: tasksByPriority.slice(0, DIGEST_MAX_TASKS).map((t) => ({
      id: t.id,
      question: truncate(t.question, 240),
      memoAnchor: truncate(t.memoAnchor, 160),
      linkedFlagIds: t.linkedFlagIds.slice(0, 4),
      linkedPillarIds: t.linkedPillarIds.slice(0, 4),
      preferredSources: t.preferredSources,
      priority: t.priority,
    })),
  };
}

// Match research tasks to research passes by keyword + preferredSources.
// Each task can land in MULTIPLE passes (overlap is fine — the research
// model dedups within its findings). Tasks that match nothing become
// `press_and_results` catch-alls.
export function selectTasksForPass(
  digest: MemoUnderstandingDigest,
  passId: ResearchPassId,
): MemoUnderstandingResearchTask[] {
  if (!digest.researchTasks || digest.researchTasks.length === 0) return [];
  const tasks: MemoUnderstandingResearchTask[] = digest.researchTasks.map((t) => ({
    id: t.id,
    label: t.question.slice(0, 80),
    question: t.question,
    memoAnchor: t.memoAnchor,
    linkedFlagIds: t.linkedFlagIds,
    linkedPillarIds: t.linkedPillarIds,
    linkedFinancialClaimIds: [],
    preferredSources: t.preferredSources,
    expectedEvidence: "",
    priority: t.priority,
  }));

  const matches: MemoUnderstandingResearchTask[] = [];
  for (const task of tasks) {
    if (matchTaskToPass(task, passId)) matches.push(task);
  }
  // Catch-all: tasks with NO pass membership land in press_and_results.
  if (passId === "press_and_results") {
    for (const task of tasks) {
      const matchedAny = (
        [
          "official_results",
          "management_call",
          "investor_presentation",
          "press_and_results",
          "valuation_market",
          "risks_competition",
        ] as ResearchPassId[]
      ).some((p) => matchTaskToPass(task, p));
      if (!matchedAny && !matches.some((m) => m.id === task.id)) {
        matches.push(task);
      }
    }
  }
  return matches;
}

function matchTaskToPass(
  task: MemoUnderstandingResearchTask,
  passId: ResearchPassId,
): boolean {
  const anchor = (task.memoAnchor + " " + task.question).toLowerCase();
  const sources = new Set(task.preferredSources);
  switch (passId) {
    case "official_results":
      if (
        sources.has("company_filings") ||
        sources.has("exchange_filings")
      ) return true;
      return /\b(results?|filing|audited|annual|quarterly|exchange)\b/.test(anchor);
    case "management_call":
      if (sources.has("earnings_call")) return true;
      return /\b(commentary|call|guidance|tone|management)\b/.test(anchor);
    case "investor_presentation":
      if (sources.has("investor_presentation")) return true;
      return /\b(presentation|deck|ir|investor)\b/.test(anchor);
    case "press_and_results":
      if (sources.has("press") || sources.has("broker_notes")) return true;
      return /\b(press|broker|news|coverage)\b/.test(anchor);
    case "valuation_market":
      if (sources.has("market_data") || sources.has("broker_notes")) return true;
      return /\b(valuation|target|multiple|p\/e|ev\/ebitda|price|share|peer)\b/.test(
        anchor,
      );
    case "risks_competition":
      return /\b(risk|macro|competitor|peer|ai\b|regulator|policy|cost|input)\b/.test(
        anchor,
      );
  }
}

// Section-side selector for memo section generation.
export function selectClaimsForSection(
  digest: MemoUnderstandingDigest,
  sectionId: string,
): MemoUnderstandingDigest["financialClaims"] {
  if (!digest.financialClaims || digest.financialClaims.length === 0) return [];
  const claims = digest.financialClaims;
  // Phase 6B: sections that consume financial claims as the spine:
  // sec_thesis_scorecard (memo-vs-reality bridge), sup_eps_bridge,
  // sup_valuation_detail, sup_financials_actuals. Other sections can use
  // them as context (3 claims max).
  if (
    sectionId === "sec_thesis_scorecard" ||
    sectionId === "sup_eps_bridge" ||
    sectionId === "sup_valuation_detail" ||
    sectionId === "sup_financials_actuals"
  ) {
    return claims.slice(0, 4);
  }
  return claims.slice(0, 3);
}

function priorityRank(
  p: MemoUnderstandingResearchTask["priority"] | "high" | "medium" | "low",
): number {
  switch (p) {
    case "must_check":
      return 0;
    case "important":
      return 1;
    case "nice_to_have":
      return 2;
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}

function truncate(value: string | undefined, max: number): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

// Coerce optional fields that come from `Pick<…>` digest shape.
export type MemoUnderstandingFlaggedDigestEntry = MemoUnderstandingDigest["flaggedDetails"][number];
export type MemoUnderstandingFinancialDigestEntry = MemoUnderstandingDigest["financialClaims"][number];
// Re-export name for readability:
export type { MemoUnderstandingFinancialClaim };
