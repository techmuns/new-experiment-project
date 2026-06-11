import type { CanonicalSectionId, MemoConfidence, MemoSectionSignal } from "@shared/types";

// Phase 6B: 6 core + 3 supplementary; renderer splits on prefix.
const CANONICAL_SECTION_IDS: readonly CanonicalSectionId[] = [
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

export const MEMO_SECTION_TOOL_SCHEMA: object = {
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
};

// OpenAI Responses-API strict json_schema variant: every property must be in
// `required`, and optional fields are expressed as nullable type unions.
// normalizeSectionNulls (sectionRoute.ts) strips nulls before parseSectionJson.
export const MEMO_SECTION_OPENAI_SCHEMA: object = {
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
};

export function normalizeSectionNulls(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const out: Record<string, unknown> = { ...input };
  if (out.confidenceNote === null) delete out.confidenceNote;
  if (out.confidence === null) delete out.confidence;
  if (out.bridge === null) delete out.bridge;
  if (Array.isArray(out.bridge)) {
    out.bridge = out.bridge.map((row) => {
      if (!isPlainObject(row)) return row;
      const rc: Record<string, unknown> = { ...row };
      if (rc.original === null) delete rc.original;
      if (rc.latest === null) delete rc.latest;
      if (rc.readThrough === null) delete rc.readThrough;
      return rc;
    });
  }
  const sources = out.sources;
  if (Array.isArray(sources)) {
    out.sources = sources.map((src) => {
      if (!isPlainObject(src)) return src;
      const sc: Record<string, unknown> = { ...src };
      if (sc.page === null) delete sc.page;
      if (sc.quote === null) delete sc.quote;
      return sc;
    });
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
