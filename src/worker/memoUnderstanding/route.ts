// Phase 6A: Memo Understanding Engine. POST /api/memo/understand turns
// extracted memo text into a strict-schema MemoUnderstanding object that
// drives downstream memo-specific research and section generation.
//
// Discipline (mirrors Phase 5E/5F):
// - OpenAI only (provider_missing otherwise).
// - NO web_search, NO tools, NO tool_choice, NO include.
// - Strict JSON schema (Responses API json_schema, strict: true).
// - Phase 6A.2 reliability ladder:
//     primary call (normal compact schema, JSON-only prompt)
//       → extractFirstJsonObject on raw output (handles fences/prose)
//       → strict shape
//       → if shape fails: repair OpenAI call (stronger JSON-only prompt)
//       → extractFirstJsonObject on repair output (handles fences/prose)
//       → strict shape
//       → if everything fails: ultra-compact second-attempt path
//         (minimal-surface schema + expand-into-full)
//       → if ultra-compact also fails: safe parse_error
// - Counts-only logging with `outcome` tag identifying which tier
//   succeeded (primary / primary_extract / repair / repair_extract /
//   ultra_compact / parse_error). NEVER log memo text, raw output,
//   prompts, API key, or c.env.
import type { Context } from "hono";
import type {
  LlmProviderName,
  MemoUnderstandErrorCode,
  MemoUnderstandRequest,
  MemoUnderstandResponse,
} from "@shared/types";
import {
  checkGateToken,
  evaluateLlmReadiness,
  getProviderName,
} from "../llm/provider";
import { callOpenAIResponses } from "../llm/openai";
import { extractFirstJsonObject } from "../llm/jsonRepair";
import { buildUnderstandPrompt } from "./prompt";
import {
  MEMO_UNDERSTANDING_FORMAT_NAME,
  MEMO_UNDERSTANDING_OPENAI_SCHEMA,
  normalizeUnderstandingNulls,
} from "./schema";
import { parseUnderstandJson } from "./parse";
import { trimForUnderstanding } from "./trim";
import {
  MEMO_UNDERSTANDING_ULTRA_COMPACT_FORMAT_NAME,
  MEMO_UNDERSTANDING_ULTRA_COMPACT_OPENAI_SCHEMA,
  buildUltraCompactPrompt,
  expandUltraCompactToFull,
  parseUltraCompactJson,
} from "./ultraCompact";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const UNDERSTAND_MAX_OUTPUT_TOKENS = 2_400;
const UNDERSTAND_REPAIR_MAX_OUTPUT_TOKENS = 1_600;
const UNDERSTAND_ULTRA_COMPACT_MAX_OUTPUT_TOKENS = 1_200;
const GATE_HEADER = "x-memo-llm-gate";

export async function handleMemoUnderstand(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  let bodyText: string;
  try {
    bodyText = await c.req.raw.text();
  } catch {
    return c.json({ error: "body_unreadable" }, 400);
  }
  if (bodyText.length > MAX_BODY_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const validation = validateUnderstandRequest(parsed);
  if (!validation.ok) {
    return c.json(
      { error: "invalid_request", message: validation.message },
      400,
    );
  }

  const readiness = evaluateLlmReadiness(c.env);
  if (!readiness.llmEnabled) {
    return c.json(
      buildSafeFailure(
        "not_configured",
        "LLM is not enabled on this server.",
      ),
    );
  }
  if (!readiness.providerConfigured) {
    return c.json(
      buildSafeFailure(
        "provider_missing",
        "LLM provider is not configured.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
  if (readiness.provider !== "openai") {
    return c.json(
      buildSafeFailure(
        "research_unavailable",
        "Memo understanding requires the OpenAI provider.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
  if (!readiness.apiKeyConfigured) {
    return c.json(
      buildSafeFailure(
        "api_key_missing",
        "LLM API key is not configured.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
  if (readiness.gateEnabled) {
    const gate = checkGateToken(c.env, c.req.header(GATE_HEADER));
    if (!gate.ok) {
      return c.json(
        buildSafeFailure(
          gate.code,
          gate.message,
          readiness.provider,
          readiness.model,
        ),
      );
    }
  }
  const providerName = getProviderName(c.env);
  if (providerName !== "openai") {
    return c.json(
      buildSafeFailure(
        "research_unavailable",
        "Memo understanding provider unavailable.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
  const apiKey = readResolvedApiKey(c.env);
  if (!apiKey || !readiness.model) {
    return c.json(
      buildSafeFailure(
        "not_configured",
        "Memo understanding provider is not available.",
        readiness.provider,
        readiness.model,
      ),
    );
  }

  try {
    const trim = trimForUnderstanding(validation.value.memo.text);
    const prompt = buildUnderstandPrompt(validation.value, trim.text);

    console.log(
      JSON.stringify({
        event: "llm_understand_enter",
        projectId: validation.value.project.id,
        memoTextLen: trim.inputLen,
        trimmedLen: trim.outputLen,
        sectionsKept: trim.sectionsKept,
        fallbackUsed: trim.fallbackUsed,
        maxTokens: UNDERSTAND_MAX_OUTPUT_TOKENS,
        model: readiness.model,
      }),
    );

    const call = await callOpenAIResponses({
      apiKey,
      model: readiness.model,
      system: prompt.system,
      user: prompt.user,
      schema: MEMO_UNDERSTANDING_OPENAI_SCHEMA,
      schemaName: MEMO_UNDERSTANDING_FORMAT_NAME,
      maxTokens: UNDERSTAND_MAX_OUTPUT_TOKENS,
      abortSignal: c.req.raw.signal,
      logEventTag: "llm_understand",
    });

    if (!call.ok) {
      if (call.code === "malformed_output" && typeof call.rawText === "string") {
        return await tryRepair(
          c,
          call.rawText,
          validation.value,
          readiness,
          apiKey,
        );
      }
      return c.json(
        buildSafeFailure(
          translateProviderFailToUnderstandCode(call.code),
          call.message,
          readiness.provider,
          readiness.model,
        ),
      );
    }

    // Normal path: strict-shape the OpenAI response directly.
    const normalized = normalizeUnderstandingNulls(call.parsed);
    const shape = parseUnderstandJson(normalized, validation.value.project.id);
    if (!shape.ok) {
      // The provider returned valid JSON but the shape didn't validate.
      // Repair ladder fires on strict-shape failures too (it can fix
      // missing required fields).
      const rawJson = JSON.stringify(call.parsed);
      return await tryRepair(
        c,
        rawJson,
        validation.value,
        readiness,
        apiKey,
      );
    }

    logOutcome("primary", validation.value.project.id);
    const body: MemoUnderstandResponse = {
      ok: true,
      understanding: shape.understanding,
      providerMetadata: {
        providerName: "openai",
        modelUsed: readiness.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      },
      warnings: [],
    };
    return c.json(body);
  } catch {
    console.log(
      JSON.stringify({
        event: "llm_understand_unexpected_fail",
        provider: readiness.provider,
        model: readiness.model,
        errorType: "internal",
      }),
    );
    return c.json(
      buildSafeFailure(
        "provider_error",
        "Internal memo-understanding error.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
}

async function tryRepair(
  c: Context<{ Bindings: Env }>,
  rawText: string,
  request: MemoUnderstandRequest,
  readiness: ReturnType<typeof evaluateLlmReadiness>,
  apiKey: string,
): Promise<Response> {
  console.log(
    JSON.stringify({
      event: "llm_understand_repair_enter",
      projectId: request.project.id,
      rawLength: rawText.length,
      repairAttempted: true,
    }),
  );

  // First try extractFirstJsonObject (cheap, no provider call) — strips
  // code fences, extracts the first balanced JSON object.
  const extracted = extractFirstJsonObject(rawText);
  if (extracted.ok) {
    const normalized = normalizeUnderstandingNulls(extracted.value);
    const shape = parseUnderstandJson(normalized, request.project.id);
    if (shape.ok) {
      return c.json(buildOkResponse(
        shape.understanding,
        readiness.model,
        "Recovered memo understanding via JSON extract.",
        "primary_extract",
        request.project.id,
      ));
    }
  }

  // Otherwise, a single focused repair OpenAI call.
  const repair = await callOpenAIResponses({
    apiKey,
    model: readiness.model ?? "",
    system: REPAIR_SYSTEM,
    user: buildRepairUser(rawText, request.project.id),
    schema: MEMO_UNDERSTANDING_OPENAI_SCHEMA,
    schemaName: MEMO_UNDERSTANDING_FORMAT_NAME,
    maxTokens: UNDERSTAND_REPAIR_MAX_OUTPUT_TOKENS,
    abortSignal: c.req.raw.signal,
    logEventTag: "llm_understand_repair",
  });

  if (!repair.ok) {
    // Repair didn't return a parsed object at all. If it was non-JSON
    // ("malformed_output" with rawText), the route's primary-tier
    // extract+strict-shape can't help — but the ultra-compact tier
    // might. Other terminal codes (timeout, rate_limited, not_configured)
    // fall straight through to safe failure.
    if (
      repair.code === "malformed_output" &&
      typeof repair.rawText === "string"
    ) {
      const extractedRepair = extractFirstJsonObject(repair.rawText);
      if (extractedRepair.ok) {
        const normalizedExtracted = normalizeUnderstandingNulls(extractedRepair.value);
        const shapeExtracted = parseUnderstandJson(normalizedExtracted, request.project.id);
        if (shapeExtracted.ok) {
          return c.json(buildOkResponse(
            shapeExtracted.understanding,
            readiness.model,
            "Memo understanding recovered via JSON repair (extract).",
            "repair_extract",
            request.project.id,
          ));
        }
      }
      return await tryUltraCompact(c, request, readiness, apiKey, "repair_malformed");
    }
    return c.json(
      buildSafeFailure(
        translateProviderFailToUnderstandCode(repair.code),
        repair.message,
        "openai",
        readiness.model,
      ),
    );
  }

  const normalized = normalizeUnderstandingNulls(repair.parsed);
  const shape = parseUnderstandJson(normalized, request.project.id);
  if (shape.ok) {
    logOutcome("repair", request.project.id);
    const body: MemoUnderstandResponse = {
      ok: true,
      understanding: shape.understanding,
      providerMetadata: {
        providerName: "openai",
        modelUsed: readiness.model ?? "unknown",
        inputTokens: repair.inputTokens,
        outputTokens: repair.outputTokens,
      },
      warnings: [
        {
          code: "schema_warning",
          message: "Memo understanding recovered via JSON repair.",
        },
      ],
    };
    return c.json(body);
  }

  // Repair JSON parsed but the strict shape rejected it. Try
  // extractFirstJsonObject on the serialized repair output (catches
  // cases where the repair model wrapped extra prose around the JSON
  // despite the explicit instructions).
  const repairSerialized = JSON.stringify(repair.parsed);
  const extractedRepairShape = extractFirstJsonObject(repairSerialized);
  if (extractedRepairShape.ok) {
    const normalizedExtracted = normalizeUnderstandingNulls(extractedRepairShape.value);
    const shapeExtracted = parseUnderstandJson(normalizedExtracted, request.project.id);
    if (shapeExtracted.ok) {
      return c.json(buildOkResponse(
        shapeExtracted.understanding,
        readiness.model,
        "Memo understanding recovered via JSON repair (extract).",
        "repair_extract",
        request.project.id,
      ));
    }
  }

  // Repair shape still failed — last resort is the ultra-compact tier.
  return await tryUltraCompact(c, request, readiness, apiKey, "repair_shape_failed");
}

function buildOkResponse(
  understanding: import("@shared/types").MemoUnderstanding,
  modelUsed: string | undefined,
  warningMessage: string,
  outcome: string,
  projectId: string,
): MemoUnderstandResponse {
  logOutcome(outcome, projectId);
  return {
    ok: true,
    understanding,
    providerMetadata: {
      providerName: "openai",
      modelUsed: modelUsed ?? "unknown",
    },
    warnings: [
      {
        code: "schema_warning",
        message: warningMessage,
      },
    ],
  };
}

function logOutcome(outcome: string, projectId: string): void {
  console.log(
    JSON.stringify({
      event: "llm_understand_outcome",
      projectId,
      outcome,
    }),
  );
}

async function tryUltraCompact(
  c: Context<{ Bindings: Env }>,
  request: MemoUnderstandRequest,
  readiness: ReturnType<typeof evaluateLlmReadiness>,
  apiKey: string,
  reason: string,
): Promise<Response> {
  console.log(
    JSON.stringify({
      event: "llm_understand_ultra_compact_enter",
      projectId: request.project.id,
      reason,
    }),
  );

  // Re-trim the memo with the same cap (cheap; trim is pure).
  const trim = trimForUnderstanding(request.memo.text);
  const prompt = buildUltraCompactPrompt(request, trim.text);

  const call = await callOpenAIResponses({
    apiKey,
    model: readiness.model ?? "",
    system: prompt.system,
    user: prompt.user,
    schema: MEMO_UNDERSTANDING_ULTRA_COMPACT_OPENAI_SCHEMA,
    schemaName: MEMO_UNDERSTANDING_ULTRA_COMPACT_FORMAT_NAME,
    maxTokens: UNDERSTAND_ULTRA_COMPACT_MAX_OUTPUT_TOKENS,
    abortSignal: c.req.raw.signal,
    logEventTag: "llm_understand_ultra_compact",
  });

  let parsedObject: unknown = null;
  if (call.ok) {
    parsedObject = call.parsed;
  } else if (
    call.code === "malformed_output" &&
    typeof call.rawText === "string"
  ) {
    const extracted = extractFirstJsonObject(call.rawText);
    if (extracted.ok) {
      parsedObject = extracted.value;
    }
  }

  if (parsedObject !== null) {
    const uc = parseUltraCompactJson(parsedObject, request.project.id);
    if (uc.ok) {
      const expanded = expandUltraCompactToFull(
        uc.value,
        request.project.id,
        request.project.companyName,
        request.project.ticker,
      );
      logOutcome("ultra_compact", request.project.id);
      const body: MemoUnderstandResponse = {
        ok: true,
        understanding: expanded,
        providerMetadata: {
          providerName: "openai",
          modelUsed: readiness.model ?? "unknown",
          inputTokens: call.ok ? call.inputTokens : undefined,
          outputTokens: call.ok ? call.outputTokens : undefined,
        },
        warnings: [
          {
            code: "schema_warning",
            message: "Memo understanding recovered via ultra-compact second attempt.",
          },
        ],
      };
      return c.json(body);
    }
  }

  // Ultra-compact also failed. Return safe parse_error.
  logOutcome("parse_error", request.project.id);
  return c.json(
    buildSafeFailure(
      "parse_error",
      "Memo understanding could not be parsed after primary, repair, and ultra-compact attempts.",
      "openai",
      readiness.model,
    ),
  );
}

const REPAIR_SYSTEM = [
  "You are a JSON repair assistant. Convert the user-supplied draft into a single valid JSON object that exactly matches the MemoUnderstanding schema.",
  "Preserve every fact present in the draft — numbers, dates, claims, quotes. Do NOT add new facts. Do NOT invent missing details. Do NOT change meaning. Preserve only information already present in the draft.",
  "If the draft is truncated mid-array or mid-string, OMIT the incomplete tail rather than invent a completion.",
  "For required fields the draft omits entirely: leave string fields as empty string, list fields as empty array, nullable fields as null.",
  "",
  "JSON-ONLY OUTPUT DISCIPLINE — your response is consumed by a strict parser. ANY deviation breaks the user's session.",
  "  - Output raw JSON only. No prose, no preamble, no commentary, no apology.",
  "  - Do NOT wrap the JSON in markdown fences (no ```json, no ```).",
  "  - The FIRST character of your response MUST be `{`.",
  "  - The LAST character of your response MUST be `}`.",
  "  - Double quotes for all keys and strings. No trailing commas. No `undefined` values.",
  "  - Use `null` only where the schema allows null. Use empty arrays `[]` when no items are found.",
].join("\n");

function buildRepairUser(rawText: string, projectId: string): string {
  // Cap repair input to keep the call cheap.
  const capped =
    rawText.length > 24_000 ? `${rawText.slice(0, 24_000)}\n…[truncated]` : rawText;
  return [
    `Project id: ${projectId} (the output's projectId must equal this exactly).`,
    "",
    "Draft (may be wrapped in prose, code fences, or truncated):",
    "```text",
    capped,
    "```",
    "",
    "Emit one valid JSON object matching the MemoUnderstanding schema.",
  ].join("\n");
}

// --- helpers ---

interface EnvWithKey {
  LLM_API_KEY?: string;
  OPENAI_API_KEY?: string;
  LLM_PROVIDER?: string;
}

function readResolvedApiKey(env: Env): string | undefined {
  const e = env as unknown as EnvWithKey;
  if (e.LLM_API_KEY && e.LLM_API_KEY.length > 0) return e.LLM_API_KEY;
  if (
    e.LLM_PROVIDER === "openai" &&
    e.OPENAI_API_KEY &&
    e.OPENAI_API_KEY.length > 0
  ) {
    return e.OPENAI_API_KEY;
  }
  return undefined;
}

function buildSafeFailure(
  code: MemoUnderstandErrorCode,
  message: string,
  providerName?: LlmProviderName,
  modelUsed?: string,
): MemoUnderstandResponse {
  return { ok: false, code, message, providerName, modelUsed };
}

function translateProviderFailToUnderstandCode(
  code:
    | "llm_error"
    | "timeout"
    | "malformed_output"
    | "rate_limited"
    | "not_configured",
): MemoUnderstandErrorCode {
  switch (code) {
    case "llm_error":
      return "provider_error";
    case "malformed_output":
      return "parse_error";
    case "timeout":
      return "timeout";
    case "rate_limited":
      return "rate_limited";
    case "not_configured":
      return "not_configured";
  }
}

type ValidationResult =
  | { ok: true; value: MemoUnderstandRequest }
  | { ok: false; message: string };

function validateUnderstandRequest(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return invalid("request must be an object");
  const project = input.project;
  if (!isPlainObject(project)) return invalid("project missing");
  if (typeof project.id !== "string" || project.id.length === 0)
    return invalid("project.id missing");
  if (typeof project.companyName !== "string" || project.companyName.length === 0)
    return invalid("project.companyName missing");

  const memo = input.memo;
  if (!isPlainObject(memo)) return invalid("memo missing");
  if (typeof memo.text !== "string" || memo.text.length === 0)
    return invalid("memo.text missing");
  if (typeof memo.sourceFilename !== "string")
    return invalid("memo.sourceFilename missing");
  if (typeof memo.sizeBytes !== "number")
    return invalid("memo.sizeBytes missing");

  if (input.detection !== undefined && !isPlainObject(input.detection)) {
    return invalid("detection must be an object when provided");
  }
  if (input.dna !== undefined && !isPlainObject(input.dna)) {
    return invalid("dna must be an object when provided");
  }

  return { ok: true, value: input as unknown as MemoUnderstandRequest };
}

function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
