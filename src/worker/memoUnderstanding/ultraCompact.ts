import type {
  MemoUnderstanding,
  MemoUnderstandingClaimType,
  MemoUnderstandingFlagCategory,
  MemoUnderstandingImportance,
  MemoUnderstandingResearchPriority,
  MemoUnderstandRequest,
} from "@shared/types";

// Phase 6A.2: ultra-compact second-attempt path for /api/memo/understand.
//
// When the normal (compact-first) call AND the JSON-repair call both fail,
// fall through to this minimal surface — a strictly smaller schema with
// only the bare-minimum useful fields (one-line summary, short summary,
// recommendation, target price, up to 3 flags, up to 3 pillars, up to 4
// key claims, up to 5 research tasks, confidence). Strict JSON schema
// here too — no `maxItems` / `minItems` / `maxLength` keywords (those
// silently disable strict mode, which is the bug that Phase 6A.2 fixes
// in the primary schema).
//
// Caps live in the prompt text + in parseUltraCompactJson.
//
// On success, expandUltraCompactToFull(uc, projectId, companyName) maps
// the smaller shape into a complete MemoUnderstanding object with empty
// arrays for the missing optional lists. The result still drives the
// dashboard (top 3 flags, top 3 pillars, top 4 claims, top 5 tasks) and
// STILL produces a memo-specific digest for research (selectTasksForPass
// has tasks to bin). This is NOT a fallback memo. NOT generic research.

export const MEMO_UNDERSTANDING_ULTRA_COMPACT_FORMAT_NAME =
  "memo_understanding_ultra_compact";

const NULLABLE_STR = { type: ["string", "null"] };
const STR_ARRAY_REQUIRED = {
  type: "array",
  items: { type: "string" },
};

const IMPORTANCE_4 = ["critical", "high", "medium", "low"] as const;
const IMPORTANCE_3 = ["high", "medium", "low"] as const;
const PRIORITY = ["must_check", "important", "nice_to_have"] as const;
const CLAIM_TYPE = [
  "reported",
  "forecast",
  "estimate",
  "guidance",
  "assumption",
] as const;
const FLAG_CATEGORY = [
  "valuation_anchor",
  "financial_claim",
  "segment_driver",
  "margin_driver",
  "earnings_quality",
  "management_claim",
  "catalyst",
  "risk",
  "source_gap",
  "contradiction",
  "must_verify",
] as const;

export const MEMO_UNDERSTANDING_ULTRA_COMPACT_OPENAI_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectId",
    "oneLineSummary",
    "shortSummary",
    "recommendation",
    "targetPrice",
    "flaggedDetails",
    "thesisPillars",
    "keyClaims",
    "researchTasks",
    "confidence",
  ],
  properties: {
    projectId: { type: "string" },
    oneLineSummary: { type: "string" },
    shortSummary: { type: "string" },
    recommendation: NULLABLE_STR,
    targetPrice: NULLABLE_STR,
    flaggedDetails: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "detail",
          "category",
          "importance",
          "whyItMatters",
          "memoEvidence",
          "researchQuestion",
        ],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          detail: { type: "string" },
          category: { type: "string", enum: FLAG_CATEGORY },
          importance: { type: "string", enum: IMPORTANCE_4 },
          whyItMatters: { type: "string" },
          memoEvidence: { type: "string" },
          researchQuestion: { type: "string" },
        },
      },
    },
    thesisPillars: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "importance",
          "needsResearch",
          "researchPriority",
        ],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          importance: { type: "string", enum: IMPORTANCE_3 },
          needsResearch: { type: "boolean" },
          researchPriority: { type: "string", enum: PRIORITY },
        },
      },
    },
    keyClaims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "metric",
          "value",
          "claimType",
          "whyItMatters",
          "researchQuestion",
        ],
        properties: {
          id: { type: "string" },
          metric: { type: "string" },
          value: { type: "string" },
          claimType: { type: "string", enum: CLAIM_TYPE },
          whyItMatters: { type: "string" },
          researchQuestion: { type: "string" },
        },
      },
    },
    researchTasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "memoAnchor", "priority"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          memoAnchor: { type: "string" },
          priority: { type: "string", enum: PRIORITY },
        },
      },
    },
    confidence: { type: "string", enum: IMPORTANCE_3 },
    // Forces required-coverage on a known no-op key so the strict
    // schema's "every property in required" rule still holds without
    // expanding the surface.
  },
};

export function buildUltraCompactPrompt(
  req: MemoUnderstandRequest,
  trimmedText: string,
): { system: string; user: string } {
  const system = [
    "You are a buy-side investment analyst. The normal memo-understanding pass failed to produce valid structured JSON. This is a MINIMAL-SURFACE retry — emit ONLY the fields below, nothing else.",
    "",
    "JSON-ONLY OUTPUT DISCIPLINE — strict parser, no deviation tolerated:",
    "  - Return raw JSON only. No prose, no preamble, no apology.",
    "  - Do NOT wrap the JSON in markdown fences.",
    "  - The FIRST character MUST be `{`. The LAST character MUST be `}`.",
    "  - Double quotes for all keys and strings. No trailing commas. No `undefined`.",
    "  - Use `null` only where the schema allows null. Use empty arrays `[]` for empty lists.",
    "",
    "Hard caps (the dashboard only needs the top items):",
    "  - at most 3 flagged details",
    "  - at most 3 thesis pillars",
    "  - at most 4 key claims",
    "  - at most 5 research tasks",
    "",
    "Per-field length budgets — terse analyst voice, sentences not paragraphs:",
    "  - oneLineSummary ≤ 200 chars (one tight sentence).",
    "  - shortSummary ≤ 600 chars (3–5 short lines).",
    "  - flaggedDetails[i].whyItMatters: ONE sentence ≤ 180 chars, MUST start with 'Matters for updating the memo because …'.",
    "  - flaggedDetails[i].memoEvidence: ONE verbatim quote from the memo ≤ 200 chars. NEVER fabricate.",
    "  - All other text fields ≤ 200 chars.",
    "",
    "Memo-specific research is REQUIRED — each researchTask must reference THIS memo's specific claim via `memoAnchor`. NEVER 'what's the latest with the company'.",
    "",
    "Hard rules:",
    "  - DO NOT fabricate page numbers or quotes.",
    "  - DO NOT invent broker / author / target price / recommendation if absent — set the field to null.",
    "  - `projectId` MUST equal the provided projectId.",
    "  - Emit a SINGLE JSON object matching the schema. No prose outside the JSON.",
  ].join("\n");

  const userLines: string[] = [];
  userLines.push(`# 1. Project`);
  userLines.push(`- projectId: ${req.project.id}`);
  userLines.push(`- companyName: ${req.project.companyName}`);
  if (req.project.ticker) userLines.push(`- ticker: ${req.project.ticker}`);
  if (req.detection?.periodLabel) {
    userLines.push(`- periodLabel: ${req.detection.periodLabel}`);
  }
  userLines.push("");
  userLines.push(`# 2. Uploaded memo text (filename: ${req.memo.sourceFilename})`);
  userLines.push("```text");
  userLines.push(trimmedText);
  userLines.push("```");
  userLines.push("");
  userLines.push(`Output a single JSON object matching the ultra-compact MemoUnderstanding schema. projectId = "${req.project.id}".`);
  // Suppress unused import warning at runtime.
  void STR_ARRAY_REQUIRED;
  return { system, user: userLines.join("\n") };
}

// ---- Parse + expand ----

export type ParseUltraCompactResult =
  | { ok: true; value: UltraCompact }
  | { ok: false; code: "malformed_output"; message: string };

export interface UltraCompactFlag {
  id: string;
  label: string;
  detail: string;
  category: MemoUnderstandingFlagCategory;
  importance: MemoUnderstandingImportance;
  whyItMatters: string;
  memoEvidence: string;
  researchQuestion: string;
}

export interface UltraCompactPillar {
  id: string;
  label: string;
  importance: "high" | "medium" | "low";
  needsResearch: boolean;
  researchPriority: MemoUnderstandingResearchPriority;
}

export interface UltraCompactClaim {
  id: string;
  metric: string;
  value: string;
  claimType: MemoUnderstandingClaimType;
  whyItMatters: string;
  researchQuestion: string;
}

export interface UltraCompactTask {
  id: string;
  question: string;
  memoAnchor: string;
  priority: MemoUnderstandingResearchPriority;
}

export interface UltraCompact {
  projectId: string;
  oneLineSummary: string;
  shortSummary: string;
  recommendation?: string;
  targetPrice?: string;
  flaggedDetails: UltraCompactFlag[];
  thesisPillars: UltraCompactPillar[];
  keyClaims: UltraCompactClaim[];
  researchTasks: UltraCompactTask[];
  confidence: "high" | "medium" | "low";
}

const MAX_UC_FLAGS = 3;
const MAX_UC_PILLARS = 3;
const MAX_UC_CLAIMS = 4;
const MAX_UC_TASKS = 5;

const FLAG_SET = new Set<string>(FLAG_CATEGORY);
const IMPORTANCE_4_SET = new Set<string>(IMPORTANCE_4);
const IMPORTANCE_3_SET = new Set<string>(IMPORTANCE_3);
const PRIORITY_SET = new Set<string>(PRIORITY);
const CLAIM_TYPE_SET = new Set<string>(CLAIM_TYPE);

export function parseUltraCompactJson(
  input: unknown,
  projectId: string,
): ParseUltraCompactResult {
  if (!isPlainObject(input)) {
    return { ok: false, code: "malformed_output", message: "ultra-compact output is not an object" };
  }
  const u = input as Record<string, unknown>;
  const required = [
    "projectId",
    "oneLineSummary",
    "shortSummary",
    "flaggedDetails",
    "thesisPillars",
    "keyClaims",
    "researchTasks",
    "confidence",
  ];
  for (const k of required) {
    if (!(k in u)) {
      return { ok: false, code: "malformed_output", message: `ultra-compact missing key: ${k}` };
    }
  }
  const oneLineSummary = str(u.oneLineSummary);
  const shortSummary = str(u.shortSummary);
  const confidence = enumStr(u.confidence, IMPORTANCE_3_SET);
  if (!oneLineSummary || !shortSummary || !confidence) {
    return { ok: false, code: "malformed_output", message: "ultra-compact missing required scalars" };
  }
  const flags = parseFlags(u.flaggedDetails);
  const pillars = parsePillars(u.thesisPillars);
  const claims = parseClaims(u.keyClaims);
  const tasks = parseTasks(u.researchTasks);
  return {
    ok: true,
    value: {
      projectId,
      oneLineSummary,
      shortSummary,
      recommendation: optStr(u.recommendation),
      targetPrice: optStr(u.targetPrice),
      flaggedDetails: flags,
      thesisPillars: pillars,
      keyClaims: claims,
      researchTasks: tasks,
      confidence: confidence as "high" | "medium" | "low",
    },
  };
}

function parseFlags(input: unknown): UltraCompactFlag[] {
  if (!Array.isArray(input)) return [];
  const out: UltraCompactFlag[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (out.length >= MAX_UC_FLAGS) break;
    if (!isPlainObject(raw)) continue;
    const id = str(raw.id);
    const label = str(raw.label);
    const detail = str(raw.detail);
    const category = enumStr(raw.category, FLAG_SET);
    const importance = enumStr(raw.importance, IMPORTANCE_4_SET);
    const whyItMatters = str(raw.whyItMatters);
    const memoEvidence = str(raw.memoEvidence);
    const researchQuestion = str(raw.researchQuestion);
    if (
      !id || seen.has(id) || !label || !detail || !category || !importance ||
      !whyItMatters || !memoEvidence || !researchQuestion
    ) continue;
    seen.add(id);
    out.push({
      id, label, detail,
      category: category as MemoUnderstandingFlagCategory,
      importance: importance as MemoUnderstandingImportance,
      whyItMatters, memoEvidence, researchQuestion,
    });
  }
  return out;
}

function parsePillars(input: unknown): UltraCompactPillar[] {
  if (!Array.isArray(input)) return [];
  const out: UltraCompactPillar[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (out.length >= MAX_UC_PILLARS) break;
    if (!isPlainObject(raw)) continue;
    const id = str(raw.id);
    const label = str(raw.label);
    const importance = enumStr(raw.importance, IMPORTANCE_3_SET);
    const researchPriority = enumStr(raw.researchPriority, PRIORITY_SET);
    const needsResearch = typeof raw.needsResearch === "boolean" ? raw.needsResearch : false;
    if (!id || seen.has(id) || !label || !importance || !researchPriority) continue;
    seen.add(id);
    out.push({
      id, label,
      importance: importance as "high" | "medium" | "low",
      needsResearch,
      researchPriority: researchPriority as MemoUnderstandingResearchPriority,
    });
  }
  return out;
}

function parseClaims(input: unknown): UltraCompactClaim[] {
  if (!Array.isArray(input)) return [];
  const out: UltraCompactClaim[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (out.length >= MAX_UC_CLAIMS) break;
    if (!isPlainObject(raw)) continue;
    const id = str(raw.id);
    const metric = str(raw.metric);
    const value = str(raw.value);
    const claimType = enumStr(raw.claimType, CLAIM_TYPE_SET);
    const whyItMatters = str(raw.whyItMatters);
    const researchQuestion = str(raw.researchQuestion);
    if (!id || seen.has(id) || !metric || !value || !claimType || !whyItMatters || !researchQuestion) continue;
    seen.add(id);
    out.push({
      id, metric, value,
      claimType: claimType as MemoUnderstandingClaimType,
      whyItMatters, researchQuestion,
    });
  }
  return out;
}

function parseTasks(input: unknown): UltraCompactTask[] {
  if (!Array.isArray(input)) return [];
  const out: UltraCompactTask[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (out.length >= MAX_UC_TASKS) break;
    if (!isPlainObject(raw)) continue;
    const id = str(raw.id);
    const question = str(raw.question);
    const memoAnchor = str(raw.memoAnchor);
    const priority = enumStr(raw.priority, PRIORITY_SET);
    if (!id || seen.has(id) || !question || !memoAnchor || !priority) continue;
    seen.add(id);
    out.push({
      id, question, memoAnchor,
      priority: priority as MemoUnderstandingResearchPriority,
    });
  }
  return out;
}

// ---- Expand into full MemoUnderstanding shape ----

export function expandUltraCompactToFull(
  uc: UltraCompact,
  projectId: string,
  companyName: string,
  ticker?: string,
): MemoUnderstanding {
  return {
    projectId,
    company: {
      detectedName: companyName,
      aliases: [],
      ...(ticker ? { ticker } : {}),
    },
    memo: {
      recommendation: uc.recommendation,
      targetPrice: uc.targetPrice,
    },
    summary: {
      oneLineSummary: uc.oneLineSummary,
      shortSummary: uc.shortSummary,
      originalThesis: uc.oneLineSummary,
      whatTheMemoNeedsToBeRight: [],
      whatWouldChangeTheView: [],
    },
    flaggedDetails: uc.flaggedDetails.map((f) => ({
      id: f.id,
      label: f.label,
      detail: f.detail,
      category: f.category,
      importance: f.importance,
      whyItMatters: f.whyItMatters,
      memoEvidence: f.memoEvidence,
      researchQuestion: f.researchQuestion,
    })),
    thesis: {
      oneLineThesis: uc.oneLineSummary,
      detailedThesis: uc.shortSummary,
      thesisPillars: uc.thesisPillars.map((p) => ({
        id: p.id,
        label: p.label,
        originalClaim: p.label,
        evidenceFromMemo: "",
        importance: p.importance,
        needsResearch: p.needsResearch,
        researchPriority: p.researchPriority,
      })),
    },
    financials: {
      keyClaims: uc.keyClaims.map((c) => ({
        id: c.id,
        metric: c.metric,
        value: c.value,
        claimType: c.claimType,
        whyItMatters: c.whyItMatters,
        researchQuestion: c.researchQuestion,
      })),
      segmentClaims: [],
    },
    valuation: {
      keyValuationAssumptions: [],
      valuationQuestionsToUpdate: [],
    },
    risksAndCatalysts: {
      catalysts: [],
      risks: [],
      watchItems: [],
    },
    researchPlan: {
      mustAnswerQuestions: [],
      sourcePriorities: [],
      researchTasks: uc.researchTasks.map((t) => ({
        id: t.id,
        label: t.question.slice(0, 80),
        question: t.question,
        memoAnchor: t.memoAnchor,
        linkedFlagIds: [],
        linkedPillarIds: [],
        linkedFinancialClaimIds: [],
        preferredSources: [],
        expectedEvidence: "",
        priority: t.priority,
      })),
    },
    confidence: {
      extractionConfidence: uc.confidence,
      missingFromMemo: [],
      ambiguousItems: [],
    },
  };
}

// ---- helpers (private) ----

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}
function optStr(v: unknown): string | undefined {
  return str(v);
}
function enumStr(v: unknown, set: Set<string>): string | undefined {
  const s = str(v);
  return s && set.has(s) ? s : undefined;
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
