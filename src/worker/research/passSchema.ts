import type {
  ResearchFindingCategory,
  ResearchFindingImpact,
  SourceTier,
} from "@shared/types";

export const RESEARCH_PASS_FORMAT_NAME = "research_pass";

const CATEGORY_VALUES: ResearchFindingCategory[] = [
  "financials",
  "management",
  "filings",
  "guidance",
  "broker_consensus",
  "valuation",
  "peers",
  "macro",
  "ai_tech_risk",
  "other",
];

const IMPACT_VALUES: ResearchFindingImpact[] = [
  "positive",
  "negative",
  "neutral",
  "watch",
];

const TIER_VALUES: SourceTier[] = [
  "official",
  "company",
  "exchange",
  "transcript",
  "press",
  "market_data",
  "other",
];

// OpenAI Responses-API strict json_schema: every property must appear in
// `required`. Optional fields use nullable type unions; normalizePassNulls
// strips them before the route invokes enforceSourceGrounding.
export const RESEARCH_PASS_OPENAI_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: ["findings", "unresolvedQuestions", "warnings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "category",
          "title",
          "summary",
          "impact",
          "relevance",
          "sources",
          "thesisCheckpointId",
        ],
        properties: {
          id: { type: "string" },
          category: { type: "string", enum: CATEGORY_VALUES },
          title: { type: "string" },
          summary: { type: "string" },
          impact: { type: "string", enum: IMPACT_VALUES },
          relevance: { type: "string" },
          thesisCheckpointId: { type: ["string", "null"] },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "url", "tier", "date", "note"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                tier: { type: ["string", "null"], enum: [...TIER_VALUES, null] },
                date: { type: ["string", "null"] },
                note: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
    unresolvedQuestions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export function normalizePassNulls(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const copy: Record<string, unknown> = { ...input };
  const findings = copy.findings;
  if (Array.isArray(findings)) {
    copy.findings = findings.map((f) => normalizeFinding(f));
  }
  return copy;
}

function normalizeFinding(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const copy: Record<string, unknown> = { ...input };
  if (copy.thesisCheckpointId === null) delete copy.thesisCheckpointId;
  const sources = copy.sources;
  if (Array.isArray(sources)) {
    copy.sources = sources.map((s) => normalizeSource(s));
  }
  return copy;
}

function normalizeSource(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const copy: Record<string, unknown> = { ...input };
  if (copy.date === null) delete copy.date;
  if (copy.note === null) delete copy.note;
  if (copy.tier === null) delete copy.tier;
  return copy;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
