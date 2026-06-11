import type {
  CanonicalSectionId,
  FinancialBridgeRow,
  FollowUpMemo,
  GenerateFollowUpMemoRequest,
  LlmGenerationWarning,
  MemoConfidence,
  MemoSection,
  MemoSectionSignal,
  SourceReference,
} from "@shared/types";
import { CANONICAL_SECTION_TITLES } from "./sectionPrompt";

// Phase 6B: 6 core + 3 supplementary; renderer splits on prefix.
const CANONICAL_SECTION_IDS = [
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

const SIGNAL_VALUES: MemoSectionSignal[] = [
  "positive",
  "negative",
  "neutral",
  "watch",
];

const CONFIDENCE_VALUES: MemoConfidence[] = ["high", "medium", "low"];

// Anthropic strict mode requires additionalProperties:false on every
// nested object.
export const FOLLOW_UP_MEMO_TOOL_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      minItems: 9,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "summary",
          "body",
          "bullets",
          "signal",
          "sources",
        ],
        properties: {
          id: { type: "string", enum: CANONICAL_SECTION_IDS },
          title: { type: "string" },
          summary: { type: "string" },
          body: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          signal: { type: "string", enum: SIGNAL_VALUES },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["documentId"],
              properties: {
                documentId: { type: "string" },
                page: { type: "number" },
                quote: { type: "string" },
              },
            },
          },
          confidenceNote: { type: "string" },
          // Phase 5B: optional per-section confidence label + structured
          // financial / valuation bridge rows. Anthropic tool schema keeps
          // these optional (not in `required`), matching the existing
          // confidenceNote treatment above.
          confidence: { type: "string", enum: CONFIDENCE_VALUES },
          bridge: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["metric"],
              properties: {
                metric: { type: "string" },
                original: { type: "string" },
                latest: { type: "string" },
                readThrough: { type: "string" },
              },
            },
          },
        },
      },
    },
    // Phase 5B: top-level sink for residual manual-check items, rendered
    // once at the foot of the memo (replaces per-section repetition).
    manualChecksRemaining: { type: "array", items: { type: "string" } },
  },
};

// OpenAI Responses-API Structured Outputs (strict json_schema) requires
// every property to appear in `required`, and does not support `minItems`
// / `maxItems`. Optional app-model fields are expressed as nullable type
// unions here; openai.ts normalizes nulls to absent before passing the
// payload to parseLlmJson. The 9-section length invariant is enforced by
// the prompt and by parseLlmJson, not by this schema.
export const FOLLOW_UP_MEMO_OPENAI_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: ["sections", "manualChecksRemaining"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "summary",
          "body",
          "bullets",
          "signal",
          "sources",
          "confidenceNote",
          "confidence",
          "bridge",
        ],
        properties: {
          id: { type: "string", enum: CANONICAL_SECTION_IDS },
          title: { type: "string" },
          summary: { type: "string" },
          body: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          signal: { type: "string", enum: SIGNAL_VALUES },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["documentId", "page", "quote"],
              properties: {
                documentId: { type: "string" },
                page: { type: ["number", "null"] },
                quote: { type: ["string", "null"] },
              },
            },
          },
          confidenceNote: { type: ["string", "null"] },
          // Phase 5B: required-nullable per OpenAI strict-mode discipline.
          // Nulls are stripped by normalizeMemoNulls in openai.ts before
          // parseLlmJson runs.
          confidence: {
            type: ["string", "null"],
            enum: [...CONFIDENCE_VALUES, null],
          },
          bridge: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              required: ["metric", "original", "latest", "readThrough"],
              properties: {
                metric: { type: "string" },
                original: { type: ["string", "null"] },
                latest: { type: ["string", "null"] },
                readThrough: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
    // Phase 5B: top-level sink for residual manual-check items, rendered
    // once at the foot of the memo (replaces per-section repetition).
    manualChecksRemaining: {
      type: ["array", "null"],
      items: { type: "string" },
    },
  },
};

export type ParseLlmJsonResult =
  | { ok: true; memo: FollowUpMemo; warnings: LlmGenerationWarning[] }
  | { ok: false; code: "malformed_output"; message: string };

export function parseLlmJson(
  input: unknown,
  request: GenerateFollowUpMemoRequest,
  generatedAt: string,
): ParseLlmJsonResult {
  const warnings: LlmGenerationWarning[] = [];

  if (!isPlainObject(input)) {
    return fail("LLM output is not an object");
  }
  const sections = input.sections;
  if (!Array.isArray(sections)) {
    return fail("LLM output is missing a sections array");
  }
  if (sections.length !== 9) {
    return fail(`Expected exactly 9 sections, got ${sections.length}`);
  }

  const allowed = allowedDocumentIds(request);
  const seenIds = new Set<string>();
  const parsedSections: MemoSection[] = [];

  for (let i = 0; i < sections.length; i++) {
    const raw = sections[i];
    if (!isPlainObject(raw)) {
      return fail(`Section ${i} is not an object`);
    }
    const sectionResult = parseSection(raw, i, allowed, warnings);
    if (!sectionResult.ok) return sectionResult;
    const id = sectionResult.section.id;
    if (seenIds.has(id)) {
      return fail(`Duplicate section id: ${id}`);
    }
    seenIds.add(id);
    parsedSections.push(sectionResult.section);
  }

  for (const canonical of CANONICAL_SECTION_IDS) {
    if (!seenIds.has(canonical)) {
      return fail(`Missing canonical section: ${canonical}`);
    }
  }

  const memo: FollowUpMemo = {
    projectId: request.project.id,
    title: `LLM Follow-up Memo v1 — ${request.project.companyName}`,
    generatedAt,
    sections: parsedSections,
    isDemo: false,
  };

  const manualChecks = parseManualChecksRemaining(input.manualChecksRemaining);
  if (manualChecks.length > 0) {
    memo.manualChecksRemaining = manualChecks;
  }

  return { ok: true, memo, warnings };
}

function parseManualChecksRemaining(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseConfidence(value: unknown): MemoConfidence | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.trim().toLowerCase();
  if ((CONFIDENCE_VALUES as string[]).includes(lower)) {
    return lower as MemoConfidence;
  }
  return undefined;
}

function parseBridge(value: unknown): FinancialBridgeRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: FinancialBridgeRow[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const metric =
      typeof item.metric === "string" ? item.metric.trim() : "";
    if (!metric) continue;
    const row: FinancialBridgeRow = { metric };
    if (typeof item.original === "string" && item.original.trim()) {
      row.original = item.original.trim();
    }
    if (typeof item.latest === "string" && item.latest.trim()) {
      row.latest = item.latest.trim();
    }
    if (typeof item.readThrough === "string" && item.readThrough.trim()) {
      row.readThrough = item.readThrough.trim();
    }
    rows.push(row);
  }
  return rows.length > 0 ? rows : undefined;
}

export type ParseSectionJsonResult =
  | { ok: true; section: MemoSection; warnings: LlmGenerationWarning[] }
  | { ok: false; code: "malformed_output"; message: string };

// Phase 5D: parse a single MemoSection JSON object emitted by the per-section
// endpoint. Differs from parseLlmJson (full-memo) in that it expects ONE
// section, validates the id matches the requested one, and falls back to the
// canonical title when the model omits it.
export function parseSectionJson(
  input: unknown,
  expectedId: CanonicalSectionId,
  allowedDocumentIds: Set<string>,
): ParseSectionJsonResult {
  const warnings: LlmGenerationWarning[] = [];
  if (!isPlainObject(input)) {
    return fail("Section output is not an object");
  }
  const idVal = input.id;
  if (typeof idVal !== "string" || !isCanonicalId(idVal)) {
    return fail(`Section has unknown id: ${String(idVal)}`);
  }
  if (idVal !== expectedId) {
    return fail(`Expected section id "${expectedId}" but got "${idVal}"`);
  }
  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title
      : CANONICAL_SECTION_TITLES[expectedId];
  const summary = typeof input.summary === "string" ? input.summary : "";
  const body = typeof input.body === "string" ? input.body : "";
  const bullets = Array.isArray(input.bullets)
    ? input.bullets.filter((b): b is string => typeof b === "string")
    : [];
  const signal = parseSignal(input.signal);
  const sources = parseSources(input.sources, allowedDocumentIds, expectedId, warnings);
  const section: MemoSection = {
    id: expectedId,
    title,
    body,
    sources,
    summary,
    bullets,
    signal,
  };
  if (typeof input.confidenceNote === "string") {
    section.confidenceNote = input.confidenceNote;
  }
  const confidence = parseConfidence(input.confidence);
  if (confidence) section.confidence = confidence;
  const bridge = parseBridge(input.bridge);
  if (bridge) section.bridge = bridge;
  return { ok: true, section, warnings };
}

function parseSection(
  raw: Record<string, unknown>,
  index: number,
  allowed: Set<string>,
  warnings: LlmGenerationWarning[],
):
  | { ok: true; section: MemoSection }
  | { ok: false; code: "malformed_output"; message: string } {
  const idVal = raw.id;
  if (typeof idVal !== "string" || !isCanonicalId(idVal)) {
    return fail(`Section ${index} has unknown id: ${String(idVal)}`);
  }
  const title = typeof raw.title === "string" ? raw.title : "";
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets.filter((b): b is string => typeof b === "string")
    : [];
  const signal = parseSignal(raw.signal);
  const sources = parseSources(raw.sources, allowed, idVal, warnings);
  const section: MemoSection = {
    id: idVal,
    title,
    body,
    sources,
    summary,
    bullets,
    signal,
  };
  if (typeof raw.confidenceNote === "string") {
    section.confidenceNote = raw.confidenceNote;
  }
  const confidence = parseConfidence(raw.confidence);
  if (confidence) section.confidence = confidence;
  const bridge = parseBridge(raw.bridge);
  if (bridge) section.bridge = bridge;
  return { ok: true, section };
}

function parseSignal(value: unknown): MemoSectionSignal {
  if (
    typeof value === "string" &&
    (SIGNAL_VALUES as string[]).includes(value)
  ) {
    return value as MemoSectionSignal;
  }
  return "neutral";
}

function parseSources(
  value: unknown,
  allowed: Set<string>,
  sectionId: string,
  warnings: LlmGenerationWarning[],
): SourceReference[] {
  if (!Array.isArray(value)) return [];
  const out: SourceReference[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const docId = item.documentId;
    if (typeof docId !== "string") continue;
    if (!allowed.has(docId)) {
      warnings.push({
        code: "schema_warning",
        message: `Section ${sectionId}: dropped source with unknown documentId "${docId}"`,
      });
      continue;
    }
    const ref: SourceReference = { documentId: docId };
    if (typeof item.page === "number") ref.page = item.page;
    if (typeof item.quote === "string") ref.quote = item.quote;
    out.push(ref);
  }
  return out;
}

function allowedDocumentIds(req: GenerateFollowUpMemoRequest): Set<string> {
  const set = new Set<string>();
  if (req.initialMemo.id) set.add(req.initialMemo.id);
  for (const doc of req.updateDocs ?? []) set.add(doc.id);
  if (req.research) {
    for (const finding of req.research.findings) set.add(finding.id);
  }
  return set;
}

function isCanonicalId(
  id: string,
): id is (typeof CANONICAL_SECTION_IDS)[number] {
  return (CANONICAL_SECTION_IDS as readonly string[]).includes(id);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function fail(message: string): {
  ok: false;
  code: "malformed_output";
  message: string;
} {
  return { ok: false, code: "malformed_output", message };
}
