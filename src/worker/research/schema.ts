// OpenAI Responses-API Structured Outputs (strict json_schema) for the
// research endpoint. Mirrors FOLLOW_UP_MEMO_OPENAI_SCHEMA's discipline:
// every property in `required`; optionals expressed as nullable type
// unions; no minItems/maxItems (not supported in strict mode). The
// research route normalizes nulls to absent before passing to validators.

const CATEGORY_VALUES = [
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
] as const;

const IMPACT_VALUES = ["positive", "negative", "neutral", "watch"] as const;

const CHECKPOINT_IMPACT_VALUES = [
  "supported",
  "challenged",
  "no_update",
] as const;

export const RESEARCH_FINDINGS_OPENAI_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: [
    "generatedAt",
    "company",
    "researchWindow",
    "findings",
    "positiveDevelopments",
    "negativeDevelopments",
    "neutralOrWatch",
    "thesisCheckpointImpact",
    "unresolvedQuestions",
    "warnings",
  ],
  properties: {
    generatedAt: { type: "string" },
    company: { type: "string" },
    researchWindow: {
      type: "object",
      additionalProperties: false,
      required: ["startIsoMonth", "endIsoMonth"],
      properties: {
        startIsoMonth: { type: "string" },
        endIsoMonth: { type: "string" },
      },
    },
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
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "url", "date", "note"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                date: { type: ["string", "null"] },
                note: { type: ["string", "null"] },
              },
            },
          },
          thesisCheckpointId: { type: ["string", "null"] },
        },
      },
    },
    positiveDevelopments: { type: "array", items: { type: "string" } },
    negativeDevelopments: { type: "array", items: { type: "string" } },
    neutralOrWatch: { type: "array", items: { type: "string" } },
    thesisCheckpointImpact: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["checkpointId", "impact", "note", "findingIds"],
        properties: {
          checkpointId: { type: "string" },
          impact: { type: "string", enum: CHECKPOINT_IMPACT_VALUES },
          note: { type: "string" },
          findingIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    unresolvedQuestions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export const RESEARCH_FORMAT_NAME = "research_findings";
