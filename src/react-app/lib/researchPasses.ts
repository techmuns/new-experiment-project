import type {
  LlmGenerationWarning,
  MemoDNA,
  PeriodDetectionResult,
  ResearchDetectionInput,
  ResearchErrorCode,
  ResearchFinding,
  ResearchFindings,
  ResearchPassCompactDna,
  ResearchPassCompanyAliases,
  ResearchPassHarvestedUrl,
  ResearchPassId,
  ResearchPassRequest,
  ResearchPassResponse,
  ResearchSource,
  ResearchThesisCheckpointImpact,
  SourceTier,
  ThesisCheckpoint,
} from "@shared/types";

export const RESEARCH_PASS_IDS: readonly ResearchPassId[] = [
  "official_results",
  "management_call",
  "investor_presentation",
  "press_and_results",
  "valuation_market",
  "risks_competition",
] as const;

export const RESEARCH_PASS_TITLES: Record<ResearchPassId, string> = {
  official_results: "Official results / exchange filings",
  management_call: "Earnings call / management commentary",
  investor_presentation: "Investor presentation / IR deck",
  press_and_results: "Financial press / result summaries",
  valuation_market: "Valuation / market movement",
  risks_competition: "Risks / macro / competition / AI",
};

// Client-side ordering only — used to pick the LOWER-confidence tier when
// two passes disagree about the same URL. The full inference + downgrade
// rules stay server-side in worker/research/validate.ts. The client never
// upgrades a tier.
const TIER_RANK: Record<SourceTier, number> = {
  official: 0,
  company: 1,
  exchange: 2,
  transcript: 3,
  press: 4,
  market_data: 5,
  other: 6,
};

const PRIMARY_TIERS = new Set<SourceTier>([
  "official",
  "company",
  "exchange",
  "transcript",
]);

const IMPACT_RANK: Record<ResearchFinding["impact"], number> = {
  negative: 3,
  positive: 2,
  watch: 1,
  neutral: 0,
};

const LEGAL_SUFFIX_RE =
  /\s+(Limited|Ltd\.?|Inc\.?|PLC|Corp(?:oration)?|Holdings|Company|Co\.?)$/i;

const INDIAN_TICKER_RE = /^[A-Z0-9&]{2,10}$/;

export function buildCompanyAliases(
  detection: PeriodDetectionResult | null,
  project: { ticker?: string; companyName: string },
  dna: MemoDNA | null,
): ResearchPassCompanyAliases {
  const detectedCompany = detection?.detectedCompany?.trim() ?? "";
  const candidate =
    detectedCompany || project.companyName.trim() || "Unknown Company";
  const looksLong = LEGAL_SUFFIX_RE.test(candidate);
  let longName = candidate;
  if (!looksLong) {
    const fallback = project.companyName.trim();
    if (fallback && LEGAL_SUFFIX_RE.test(fallback)) {
      longName = fallback;
    } else if (fallback && fallback !== candidate) {
      longName = `${candidate} (also referred to as ${fallback})`;
    }
  }

  const shortName = longName.replace(LEGAL_SUFFIX_RE, "").trim();
  const informalName = shortName.split(/\s+/)[0] ?? shortName;

  const ticker =
    (detection?.detectedTicker ?? project.ticker ?? "").toUpperCase().trim() ||
    undefined;

  let exchangeTicker: string | undefined;
  let exchangeTickerAlt: string | undefined;
  if (ticker && INDIAN_TICKER_RE.test(ticker)) {
    exchangeTicker = `NSE:${ticker}`;
    exchangeTickerAlt = `${ticker} IN`;
  } else if (ticker) {
    exchangeTicker = ticker;
  }

  const aliases: ResearchPassCompanyAliases = {
    longName,
    shortName: shortName !== longName ? shortName : undefined,
    informalName: informalName !== shortName ? informalName : undefined,
    ticker,
    exchangeTicker,
    exchangeTickerAlt,
  };
  if (dna?.projectId && /\bric\b/i.test(JSON.stringify(dna))) {
    // RIC not parsed from DNA today — placeholder for future enrichment.
  }
  return aliases;
}

export function buildCompactPassDna(dna: MemoDNA): ResearchPassCompactDna {
  return {
    projectId: dna.projectId,
    originalThesisHead: truncate(dna.originalThesis ?? "", 400),
    keyAssumptions: (dna.keyAssumptions ?? [])
      .slice(0, 4)
      .map((a) => truncate(a, 200)),
    toneAdjectives: dna.styleTone?.adjectives ?? [],
    analyticalFramework: dna.analyticalFramework ?? [],
    valuationFramework: {
      method: dna.valuationFramework?.method ?? "",
      targetMultiple: dna.valuationFramework?.targetMultiple ?? "",
      bridgeNotes: (dna.valuationFramework?.bridgeNotes ?? [])
        .slice(0, 2)
        .map((n) => truncate(n, 200)),
    },
    thesisCheckpoints: (dna.thesisCheckpoints ?? []).slice(0, 5).map((cp) => ({
      id: cp.id,
      label: truncate(cp.label, 160),
      expectedDirection: cp.expectedDirection,
    })),
  };
}

// --- Merge helpers ---

function normalizeUrlForMerge(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

function primaryUrlKey(finding: ResearchFinding): string | null {
  for (const src of finding.sources) {
    const key = normalizeUrlForMerge(src.url);
    if (key) return key;
  }
  return null;
}

function sourceUrlKey(src: ResearchSource): string | null {
  return normalizeUrlForMerge(src.url);
}

function mergeSources(
  primary: ResearchSource[],
  additional: ResearchSource[],
): ResearchSource[] {
  const seen = new Map<string, ResearchSource>();
  const order: string[] = [];
  const recordKey = (label: string, idx: number): string => `__pos_${label}_${idx}`;
  primary.forEach((src, i) => {
    const k = sourceUrlKey(src) ?? recordKey("p", i);
    if (!seen.has(k)) {
      order.push(k);
      seen.set(k, src);
    }
  });
  additional.forEach((src, i) => {
    const k = sourceUrlKey(src) ?? recordKey("a", i);
    if (!seen.has(k)) {
      order.push(k);
      seen.set(k, src);
    }
  });
  return order.map((k) => seen.get(k)!).filter(Boolean);
}

function mergeFindingPair(
  primary: ResearchFinding,
  secondary: ResearchFinding,
): ResearchFinding {
  const primaryHigher =
    IMPACT_RANK[primary.impact] >= IMPACT_RANK[secondary.impact];
  const winner = primaryHigher ? primary : secondary;
  const loser = primaryHigher ? secondary : primary;
  return {
    ...winner,
    sources: mergeSources(winner.sources, loser.sources),
  };
}

function chooseTierRank(sources: ResearchSource[]): number {
  let best = TIER_RANK.other;
  for (const src of sources) {
    if (src.tier) {
      const rank = TIER_RANK[src.tier];
      if (rank < best) best = rank;
    }
  }
  return best;
}

function hasPrimaryVerified(sources: ResearchSource[]): boolean {
  return sources.some(
    (s) => s.verifiedByWebSearch === true && s.tier && PRIMARY_TIERS.has(s.tier),
  );
}

function hasAnyVerified(sources: ResearchSource[]): boolean {
  return sources.some((s) => s.verifiedByWebSearch === true);
}

function dedupeStringList(values: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= cap) break;
  }
  return out;
}

export interface PerPassEntry {
  passId: ResearchPassId;
  findings: ResearchFinding[];
  harvestedUrls: ResearchPassHarvestedUrl[];
  unresolvedQuestions: string[];
  warnings: LlmGenerationWarning[];
}

export interface MergePassResultsArgs {
  perPass: PerPassEntry[];
  failedPassIds: ResearchPassId[];
  thesisCheckpoints: ThesisCheckpoint[];
  company: string;
  researchWindow: { startIsoMonth: string; endIsoMonth: string };
  generatedAt: string;
}

export function mergePassResults(args: MergePassResultsArgs): ResearchFindings {
  // 1. Concatenate per-pass findings, tagging origin pass for warnings.
  const all: ResearchFinding[] = [];
  for (const entry of args.perPass) {
    for (const f of entry.findings) all.push(f);
  }

  // 2. Dedupe by primary URL key. Keep higher-impact-rank version's
  // top-level fields, union sources (preserving server-set verified +
  // tier; no client upgrade).
  const byKey = new Map<string, ResearchFinding>();
  const noKey: ResearchFinding[] = [];
  for (const finding of all) {
    const key = primaryUrlKey(finding);
    if (!key) {
      noKey.push(finding);
      continue;
    }
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeFindingPair(existing, finding) : finding);
  }
  let merged: ResearchFinding[] = [...byKey.values(), ...noKey];

  // 3. Sort and cap to 12.
  merged.sort((a, b) => {
    const impactDelta = IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact];
    if (impactDelta !== 0) return impactDelta;
    const tierDelta = chooseTierRank(a.sources) - chooseTierRank(b.sources);
    if (tierDelta !== 0) return tierDelta;
    const primaryDelta =
      (hasPrimaryVerified(b.sources) ? 1 : 0) -
      (hasPrimaryVerified(a.sources) ? 1 : 0);
    return primaryDelta;
  });
  merged = merged.slice(0, 12);

  // 4. Renumber ids and build an old-id → new-id map (for thesis
  // checkpoint id rewrites).
  const idRemap = new Map<string, string>();
  merged = merged.map((f, i) => {
    const newId = `r${String(i + 1).padStart(2, "0")}`;
    idRemap.set(f.id, newId);
    return { ...f, id: newId };
  });

  // 5. Build positive/negative/neutralOrWatch arrays from final impacts.
  const positiveDevelopments = merged
    .filter((f) => f.impact === "positive")
    .map((f) => f.id);
  const negativeDevelopments = merged
    .filter((f) => f.impact === "negative")
    .map((f) => f.id);
  const neutralOrWatch = merged
    .filter((f) => f.impact === "neutral" || f.impact === "watch")
    .map((f) => f.id);

  // 6. Build thesisCheckpointImpact from per-finding thesisCheckpointId
  // mappings (rewritten to merged ids).
  const thesisCheckpointImpact: ResearchThesisCheckpointImpact[] = [];
  for (const checkpoint of args.thesisCheckpoints) {
    const tied = merged.filter(
      (f) => f.thesisCheckpointId === checkpoint.id,
    );
    if (tied.length === 0) {
      thesisCheckpointImpact.push({
        checkpointId: checkpoint.id,
        impact: "no_update",
        note: "No findings touched this checkpoint in this run.",
        findingIds: [],
      });
      continue;
    }
    const anyPositive = tied.some((f) => f.impact === "positive");
    const anyNegative = tied.some((f) => f.impact === "negative");
    let impact: "supported" | "challenged" | "no_update";
    let note: string;
    if (anyNegative) {
      impact = "challenged";
      const first = tied.find((f) => f.impact === "negative")!;
      note = truncate(first.relevance, 240);
    } else if (anyPositive) {
      impact = "supported";
      const first = tied.find((f) => f.impact === "positive")!;
      note = truncate(first.relevance, 240);
    } else {
      impact = "no_update";
      note = "Watch/neutral findings only — keep monitoring.";
    }
    thesisCheckpointImpact.push({
      checkpointId: checkpoint.id,
      impact,
      note,
      findingIds: tied.map((f) => f.id),
    });
  }

  // 7. Aggregate unresolvedQuestions + warnings.
  const unresolvedQuestions = dedupeStringList(
    args.perPass.flatMap((p) => p.unresolvedQuestions),
    6,
  );
  const warningStrings = args.perPass.flatMap((p) =>
    p.warnings.map((w) => w.message),
  );
  for (const passId of args.failedPassIds) {
    warningStrings.push(
      `Research pass "${RESEARCH_PASS_TITLES[passId]}" failed and was skipped.`,
    );
  }
  const warnings = dedupeStringList(warningStrings, 12);

  return {
    generatedAt: args.generatedAt,
    company: args.company,
    researchWindow: args.researchWindow,
    findings: merged,
    positiveDevelopments,
    negativeDevelopments,
    neutralOrWatch,
    thesisCheckpointImpact,
    unresolvedQuestions,
    warnings,
  };
}

// Final research_no_sources check: a merged ResearchFindings is "empty"
// for the purposes of memo generation if no finding has any
// SERVER-RETURNED verifiedByWebSearch=true source. The client never sets
// that flag itself.
export function mergedResearchHasVerifiedSources(
  research: ResearchFindings,
): boolean {
  return research.findings.some((f) => hasAnyVerified(f.sources));
}

// --- Orchestration ---

export type RunResearchPassesOutcome =
  | "complete"
  | "complete_with_warnings"
  | "failed"
  | "aborted";

export interface RunResearchPassesArgs {
  baseRequest: Omit<ResearchPassRequest, "passId" | "retryCompact">;
  thesisCheckpoints: ThesisCheckpoint[];
  apiCall: (
    req: ResearchPassRequest,
    signal?: AbortSignal,
  ) => Promise<ResearchPassResponse>;
  signal?: AbortSignal;
  onPassStart: (id: ResearchPassId, attempt: 1 | 2) => void;
  onPassDone: (
    id: ResearchPassId,
    result: ResearchPassResponse & { ok: true },
  ) => void;
  onPassFail: (
    id: ResearchPassId,
    code: ResearchErrorCode,
    message: string,
  ) => void;
  passesToRun?: ResearchPassId[];
  existing?: Map<ResearchPassId, ResearchPassResponse & { ok: true }>;
}

export type RunResearchPassesResult =
  | {
      outcome: "complete" | "complete_with_warnings";
      research: ResearchFindings;
      perPass: Map<ResearchPassId, ResearchPassResponse & { ok: true }>;
      failedPassIds: ResearchPassId[];
    }
  | {
      outcome: "failed";
      code: ResearchErrorCode;
      message: string;
      perPass: Map<ResearchPassId, ResearchPassResponse & { ok: true }>;
      failedPassIds: ResearchPassId[];
    }
  | {
      outcome: "aborted";
      perPass: Map<ResearchPassId, ResearchPassResponse & { ok: true }>;
    };

const RETRY_COMPACT_CODES: ReadonlySet<ResearchErrorCode> = new Set([
  "timeout",
  "provider_error",
  "parse_error",
  "rate_limited",
]);

export async function runResearchPasses(
  args: RunResearchPassesArgs,
): Promise<RunResearchPassesResult> {
  const perPass = new Map(args.existing ?? []);
  const failedPassIds: ResearchPassId[] = [];
  const toRun = args.passesToRun ?? RESEARCH_PASS_IDS;

  for (const passId of toRun) {
    if (args.signal?.aborted) {
      return { outcome: "aborted", perPass };
    }

    const request: ResearchPassRequest = {
      ...args.baseRequest,
      passId,
      thesisCheckpoints: args.thesisCheckpoints,
    };

    args.onPassStart(passId, 1);
    let response = await safeCall(args.apiCall, request, args.signal);
    if (response.aborted) {
      return { outcome: "aborted", perPass };
    }

    if (
      !response.value.ok &&
      RETRY_COMPACT_CODES.has(response.value.code) &&
      !args.signal?.aborted
    ) {
      args.onPassStart(passId, 2);
      const retryReq: ResearchPassRequest = { ...request, retryCompact: true };
      response = await safeCall(args.apiCall, retryReq, args.signal);
      if (response.aborted) {
        return { outcome: "aborted", perPass };
      }
    }

    if (response.value.ok) {
      perPass.set(passId, response.value);
      args.onPassDone(passId, response.value);
    } else {
      failedPassIds.push(passId);
      args.onPassFail(passId, response.value.code, response.value.message);
    }
  }

  // After the loop, also propagate any previously-failed passes that were
  // NOT re-run this time (e.g. partial retry). They stay in the failed
  // list for the merge step.
  if (args.passesToRun && args.existing) {
    for (const id of RESEARCH_PASS_IDS) {
      if (perPass.has(id)) continue;
      if (failedPassIds.includes(id)) continue;
      if (toRun.includes(id)) continue;
      failedPassIds.push(id);
    }
  }

  const research = mergePassResults({
    perPass: [...perPass.entries()].map(([passId, value]) => ({
      passId,
      findings: value.findings,
      harvestedUrls: value.harvestedUrls,
      unresolvedQuestions: value.unresolvedQuestions,
      warnings: value.warnings,
    })),
    failedPassIds,
    thesisCheckpoints: args.thesisCheckpoints,
    company: args.baseRequest.companyAliases.longName,
    researchWindow: {
      startIsoMonth: args.baseRequest.detection.researchStart ?? "",
      endIsoMonth: args.baseRequest.detection.researchCurrent,
    },
    generatedAt: new Date().toISOString(),
  });

  if (
    research.findings.length === 0 ||
    !mergedResearchHasVerifiedSources(research)
  ) {
    return {
      outcome: "failed",
      code: "research_no_sources",
      message:
        failedPassIds.length === RESEARCH_PASS_IDS.length
          ? "All research passes failed."
          : "No verified sources were returned from any research pass.",
      perPass,
      failedPassIds,
    };
  }

  return {
    outcome: failedPassIds.length > 0 ? "complete_with_warnings" : "complete",
    research,
    perPass,
    failedPassIds,
  };
}

interface SafeCallResult {
  aborted: boolean;
  value: ResearchPassResponse;
}

async function safeCall(
  apiCall: RunResearchPassesArgs["apiCall"],
  req: ResearchPassRequest,
  signal: AbortSignal | undefined,
): Promise<SafeCallResult> {
  try {
    const value = await apiCall(req, signal);
    if (signal?.aborted) {
      return {
        aborted: true,
        value: {
          ok: false,
          passId: req.passId,
          code: "provider_error",
          message: "Aborted",
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
          passId: req.passId,
          code: "provider_error",
          message: "Aborted",
        },
      };
    }
    const message = err instanceof Error ? err.message : "Network error";
    return {
      aborted: false,
      value: {
        ok: false,
        passId: req.passId,
        code: "provider_error",
        message,
      },
    };
  }
}

// --- helpers exported for tests ---

export function detectionToResearchDetectionInput(
  detection: PeriodDetectionResult | null,
  companyName: string,
): ResearchDetectionInput {
  return {
    detectedCompany: detection?.detectedCompany ?? companyName,
    periodLabel: detection?.best
      ? (detection.best.fiscalYearLabel ??
        detection.best.monthLabel ??
        detection.best.isoMonth ??
        detection.best.isoDate ??
        detection.best.rawMatch)
      : "",
    researchStart: detection?.researchStart,
    researchCurrent:
      detection?.researchCurrent ?? new Date().toISOString().slice(0, 7),
    assumptionNotes: detection?.assumptionNotes ?? [],
  };
}

function truncate(value: string, max: number): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}
