import type {
  MemoUnderstandingClaimType,
  MemoUnderstandingFlagCategory,
  MemoUnderstandingImportance,
  MemoUnderstandingResearchPriority,
  MemoUnderstandingSourcePriority,
} from "@shared/types";

// Phase 6A: strict OpenAI Responses-API json_schema for the Memo
// Understanding Engine. Every property listed in `properties` must also
// appear in `required` (strict mode). Optional/nullable fields use
// type-union `[..., "null"]`. normalizeUnderstandingNulls (below) strips
// the nulls before parseUnderstandJson runs.

export const MEMO_UNDERSTANDING_FORMAT_NAME = "memo_understanding";

const IMPORTANCE_CRITICAL: MemoUnderstandingImportance[] = [
  "critical",
  "high",
  "medium",
  "low",
];
const IMPORTANCE_THREE: ("high" | "medium" | "low")[] = ["high", "medium", "low"];
const PRIORITY: MemoUnderstandingResearchPriority[] = [
  "must_check",
  "important",
  "nice_to_have",
];
const CLAIM_TYPE: MemoUnderstandingClaimType[] = [
  "reported",
  "forecast",
  "estimate",
  "guidance",
  "assumption",
];
const FLAG_CATEGORY: MemoUnderstandingFlagCategory[] = [
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
];
const SOURCE_PRIORITY: MemoUnderstandingSourcePriority[] = [
  "company_filings",
  "exchange_filings",
  "earnings_call",
  "investor_presentation",
  "broker_notes",
  "market_data",
  "press",
];

const NULLABLE_STR = { type: ["string", "null"] };
// Phase 6A.2: OpenAI strict structured output does NOT support `maxItems`
// (or `minItems` / `maxLength` / `minLength` / `pattern` / `format`).
// Earlier Phase 5E section + pass schemas avoided these keywords for
// exactly this reason — see the long-standing note in src/worker/llm/
// parse.ts:108-109. Phase 6A.1 accidentally added `maxItems` here in
// nine places, silently disabling strict-mode enforcement and producing
// the production parse_error. List caps now live entirely in the prompt
// + parser (parse.ts MAX_FLAGS/MAX_PILLARS/MAX_KEY_CLAIMS/
// MAX_SEGMENT_CLAIMS/MAX_TASKS/MAX_LIST/MAX_MUST_ANSWER).
const NULLABLE_STR_ARRAY = {
  type: "array",
  items: { type: "string" },
};

export const MEMO_UNDERSTANDING_OPENAI_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectId",
    "company",
    "memo",
    "summary",
    "flaggedDetails",
    "thesis",
    "financials",
    "valuation",
    "risksAndCatalysts",
    "researchPlan",
    "confidence",
  ],
  properties: {
    projectId: { type: "string" },
    company: {
      type: "object",
      additionalProperties: false,
      required: [
        "detectedName",
        "normalizedName",
        "ticker",
        "aliases",
        "sector",
        "geography",
      ],
      properties: {
        detectedName: { type: "string" },
        normalizedName: NULLABLE_STR,
        ticker: NULLABLE_STR,
        aliases: NULLABLE_STR_ARRAY,
        sector: NULLABLE_STR,
        geography: NULLABLE_STR,
      },
    },
    memo: {
      type: "object",
      additionalProperties: false,
      required: [
        "broker",
        "author",
        "publishedDate",
        "periodCovered",
        "reportType",
        "recommendation",
        "targetPrice",
        "currentPriceAtMemo",
        "upsideAtMemo",
        "timeHorizon",
      ],
      properties: {
        broker: NULLABLE_STR,
        author: NULLABLE_STR,
        publishedDate: NULLABLE_STR,
        periodCovered: NULLABLE_STR,
        reportType: NULLABLE_STR,
        recommendation: NULLABLE_STR,
        targetPrice: NULLABLE_STR,
        currentPriceAtMemo: NULLABLE_STR,
        upsideAtMemo: NULLABLE_STR,
        timeHorizon: NULLABLE_STR,
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "oneLineSummary",
        "shortSummary",
        "originalThesis",
        "whatTheMemoNeedsToBeRight",
        "whatWouldChangeTheView",
      ],
      properties: {
        oneLineSummary: { type: "string" },
        shortSummary: { type: "string" },
        originalThesis: { type: "string" },
        whatTheMemoNeedsToBeRight: NULLABLE_STR_ARRAY,
        whatWouldChangeTheView: NULLABLE_STR_ARRAY,
      },
    },
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
          importance: { type: "string", enum: IMPORTANCE_CRITICAL },
          whyItMatters: { type: "string" },
          memoEvidence: { type: "string" },
          researchQuestion: { type: "string" },
        },
      },
    },
    thesis: {
      type: "object",
      additionalProperties: false,
      required: ["oneLineThesis", "detailedThesis", "thesisPillars"],
      properties: {
        oneLineThesis: { type: "string" },
        detailedThesis: { type: "string" },
        thesisPillars: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "label",
              "originalClaim",
              "evidenceFromMemo",
              "importance",
              "needsResearch",
              "researchPriority",
            ],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              originalClaim: { type: "string" },
              evidenceFromMemo: { type: "string" },
              importance: { type: "string", enum: IMPORTANCE_THREE },
              needsResearch: { type: "boolean" },
              researchPriority: { type: "string", enum: PRIORITY },
            },
          },
        },
      },
    },
    financials: {
      type: "object",
      additionalProperties: false,
      required: ["keyClaims", "segmentClaims"],
      properties: {
        keyClaims: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "metric",
              "value",
              "period",
              "segment",
              "claimType",
              "whyItMatters",
              "researchQuestion",
            ],
            properties: {
              id: { type: "string" },
              metric: { type: "string" },
              value: { type: "string" },
              period: NULLABLE_STR,
              segment: NULLABLE_STR,
              claimType: { type: "string", enum: CLAIM_TYPE },
              whyItMatters: { type: "string" },
              researchQuestion: { type: "string" },
            },
          },
        },
        segmentClaims: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "segment",
              "claim",
              "metric",
              "value",
              "period",
              "importance",
              "researchQuestion",
            ],
            properties: {
              id: { type: "string" },
              segment: { type: "string" },
              claim: { type: "string" },
              metric: NULLABLE_STR,
              value: NULLABLE_STR,
              period: NULLABLE_STR,
              importance: { type: "string", enum: IMPORTANCE_THREE },
              researchQuestion: { type: "string" },
            },
          },
        },
      },
    },
    valuation: {
      type: "object",
      additionalProperties: false,
      required: [
        "method",
        "targetMultiple",
        "targetMetric",
        "impliedEPS",
        "targetPrice",
        "upside",
        "keyValuationAssumptions",
        "valuationQuestionsToUpdate",
      ],
      properties: {
        method: NULLABLE_STR,
        targetMultiple: NULLABLE_STR,
        targetMetric: NULLABLE_STR,
        impliedEPS: NULLABLE_STR,
        targetPrice: NULLABLE_STR,
        upside: NULLABLE_STR,
        keyValuationAssumptions: NULLABLE_STR_ARRAY,
        valuationQuestionsToUpdate: NULLABLE_STR_ARRAY,
      },
    },
    risksAndCatalysts: {
      type: "object",
      additionalProperties: false,
      required: ["catalysts", "risks", "watchItems"],
      properties: {
        catalysts: NULLABLE_STR_ARRAY,
        risks: NULLABLE_STR_ARRAY,
        watchItems: NULLABLE_STR_ARRAY,
      },
    },
    researchPlan: {
      type: "object",
      additionalProperties: false,
      required: ["mustAnswerQuestions", "sourcePriorities", "researchTasks"],
      properties: {
        mustAnswerQuestions: NULLABLE_STR_ARRAY,
        sourcePriorities: {
          type: "array",
          items: { type: "string", enum: SOURCE_PRIORITY },
        },
        researchTasks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "label",
              "question",
              "memoAnchor",
              "linkedFlagIds",
              "linkedPillarIds",
              "linkedFinancialClaimIds",
              "preferredSources",
              "expectedEvidence",
              "priority",
            ],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              question: { type: "string" },
              memoAnchor: { type: "string" },
              linkedFlagIds: NULLABLE_STR_ARRAY,
              linkedPillarIds: NULLABLE_STR_ARRAY,
              linkedFinancialClaimIds: NULLABLE_STR_ARRAY,
              preferredSources: {
                type: "array",
                items: { type: "string", enum: SOURCE_PRIORITY },
              },
              expectedEvidence: { type: "string" },
              priority: { type: "string", enum: PRIORITY },
            },
          },
        },
      },
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["extractionConfidence", "missingFromMemo", "ambiguousItems"],
      properties: {
        extractionConfidence: { type: "string", enum: IMPORTANCE_THREE },
        missingFromMemo: NULLABLE_STR_ARRAY,
        ambiguousItems: NULLABLE_STR_ARRAY,
      },
    },
  },
};

// Strip nulls on the nullable optional fields so parseUnderstandJson sees
// "absent = undefined" — identical pattern to Phase 5E normalizePassNulls.
export function normalizeUnderstandingNulls(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const out: Record<string, unknown> = { ...input };
  const company = out.company;
  if (isPlainObject(company)) {
    out.company = stripNullsInObj(company, [
      "normalizedName",
      "ticker",
      "sector",
      "geography",
    ]);
  }
  const memo = out.memo;
  if (isPlainObject(memo)) {
    out.memo = stripNullsInObj(memo, [
      "broker",
      "author",
      "publishedDate",
      "periodCovered",
      "reportType",
      "recommendation",
      "targetPrice",
      "currentPriceAtMemo",
      "upsideAtMemo",
      "timeHorizon",
    ]);
  }
  const financials = out.financials;
  if (isPlainObject(financials)) {
    const keyClaims = financials.keyClaims;
    if (Array.isArray(keyClaims)) {
      financials.keyClaims = keyClaims.map((c) =>
        stripNullsInObj(c, ["period", "segment"]),
      );
    }
    const segmentClaims = financials.segmentClaims;
    if (Array.isArray(segmentClaims)) {
      financials.segmentClaims = segmentClaims.map((c) =>
        stripNullsInObj(c, ["metric", "value", "period"]),
      );
    }
    out.financials = financials;
  }
  const valuation = out.valuation;
  if (isPlainObject(valuation)) {
    out.valuation = stripNullsInObj(valuation, [
      "method",
      "targetMultiple",
      "targetMetric",
      "impliedEPS",
      "targetPrice",
      "upside",
    ]);
  }
  return out;
}

function stripNullsInObj(input: unknown, keys: string[]): unknown {
  if (!isPlainObject(input)) return input;
  const out: Record<string, unknown> = { ...input };
  for (const k of keys) {
    if (out[k] === null) delete out[k];
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
