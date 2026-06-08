import type { Context } from "hono";
import type {
  LlmGenerationWarning,
  LlmProviderName,
  ResearchErrorCode,
  ResearchFindings,
  ResearchUpdatesRequest,
  ResearchUpdatesResponse,
} from "@shared/types";
import {
  checkGateToken,
  evaluateLlmReadiness,
  getProviderName,
} from "../llm/provider";
import {
  callOpenAIResponses,
  extractWebSearchSources,
} from "../llm/openai";
import { trimResearchRequestBody } from "../llm/trim";
import { buildResearchPrompt } from "./prompt";
import {
  RESEARCH_FINDINGS_OPENAI_SCHEMA,
  RESEARCH_FORMAT_NAME,
} from "./schema";
import { enforceSourceGrounding, normalizeResearchNulls } from "./validate";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_000;
const HARD_MAX_OUTPUT_TOKENS = 12_000;
const GATE_HEADER = "x-memo-llm-gate";

const WEB_SEARCH_TOOL = { type: "web_search" } as const;

export async function handleResearchUpdates(
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
  const validation = validateResearchRequest(parsed);
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
        "LLM research is not enabled on this server.",
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
        "Research requires the OpenAI provider.",
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

  // Sanity: readiness passed but factory disagreed (rare race).
  const providerName = getProviderName(c.env);
  if (providerName !== "openai") {
    return c.json(
      buildSafeFailure(
        "research_unavailable",
        "Research provider unavailable.",
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
        "Research provider is not available.",
        readiness.provider,
        readiness.model,
      ),
    );
  }

  const trimmed = trimResearchRequestBody(validation.value);
  const maxTokens = clampMaxTokens(undefined);

  try {
    const { system, user } = buildResearchPrompt(trimmed);
    const call = await callOpenAIResponses({
      apiKey,
      model: readiness.model,
      system,
      user,
      schema: RESEARCH_FINDINGS_OPENAI_SCHEMA,
      schemaName: RESEARCH_FORMAT_NAME,
      tools: [WEB_SEARCH_TOOL as unknown as Record<string, unknown>],
      maxTokens,
      abortSignal: c.req.raw.signal,
      logEventTag: "llm_research",
    });

    if (!call.ok) {
      const code = translateProviderFailToResearchCode(call.code);
      return c.json(
        buildSafeFailure(
          code,
          call.message,
          readiness.provider,
          readiness.model,
        ),
      );
    }

    const normalized = normalizeResearchNulls(call.parsed);
    const shape = coerceResearchFindings(normalized);
    if (!shape.ok) {
      return c.json(
        buildSafeFailure(
          "parse_error",
          shape.message,
          readiness.provider,
          readiness.model,
        ),
      );
    }

    const webSearchMap = extractWebSearchSources(call.payload);
    const webSearchMissing = webSearchMap.size === 0;
    const enforcement = enforceSourceGrounding(shape.value, webSearchMap);
    const warnings: LlmGenerationWarning[] = [];
    if (webSearchMissing) {
      warnings.push({
        code: "schema_warning",
        message:
          "web_search source metadata not available in response; falling back to model-emitted source validation.",
      });
    }

    if (enforcement.allEmpty) {
      return c.json(
        buildSafeFailure(
          "research_no_sources",
          "Automated research returned no verifiable sources.",
          readiness.provider,
          readiness.model,
        ),
      );
    }

    for (const w of enforcement.findings.warnings) {
      warnings.push({ code: "schema_warning", message: w });
    }

    const body: ResearchUpdatesResponse = {
      ok: true,
      research: enforcement.findings,
      providerMetadata: {
        providerName: "openai",
        modelUsed: readiness.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      },
      warnings,
    };
    return c.json(body);
  } catch {
    console.log(
      JSON.stringify({
        event: "llm_research_unexpected_fail",
        provider: readiness.provider,
        model: readiness.model,
        errorType: "internal",
      }),
    );
    return c.json(
      buildSafeFailure(
        "provider_error",
        "Internal research error.",
        readiness.provider,
        readiness.model,
      ),
    );
  }
}

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
  code: ResearchErrorCode,
  message: string,
  providerName?: LlmProviderName,
  modelUsed?: string,
): ResearchUpdatesResponse {
  return {
    ok: false,
    code,
    message,
    providerName,
    modelUsed,
    fallbackAvailable: true,
  };
}

function translateProviderFailToResearchCode(
  code: "llm_error" | "timeout" | "malformed_output" | "rate_limited" | "not_configured",
): ResearchErrorCode {
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

function clampMaxTokens(requested: number | undefined): number {
  if (
    typeof requested !== "number" ||
    !Number.isFinite(requested) ||
    requested <= 0
  ) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return Math.min(Math.floor(requested), HARD_MAX_OUTPUT_TOKENS);
}

type ValidationResult =
  | { ok: true; value: ResearchUpdatesRequest }
  | { ok: false; message: string };

function validateResearchRequest(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return invalid("request must be an object");
  const project = input.project;
  if (!isPlainObject(project)) return invalid("project missing");
  if (typeof project.id !== "string") return invalid("project.id missing");
  if (typeof project.companyName !== "string")
    return invalid("project.companyName missing");

  const initialMemo = input.initialMemo;
  if (!isPlainObject(initialMemo)) return invalid("initialMemo missing");
  if (typeof initialMemo.text !== "string")
    return invalid("initialMemo.text missing");
  if (typeof initialMemo.sourceFilename !== "string")
    return invalid("initialMemo.sourceFilename missing");
  if (typeof initialMemo.sizeBytes !== "number")
    return invalid("initialMemo.sizeBytes missing");

  if (!isPlainObject(input.dna)) return invalid("dna missing");

  const detection = input.detection;
  if (!isPlainObject(detection)) return invalid("detection missing");
  if (typeof detection.periodLabel !== "string")
    return invalid("detection.periodLabel missing");
  if (typeof detection.researchCurrent !== "string")
    return invalid("detection.researchCurrent missing");

  return { ok: true, value: input as unknown as ResearchUpdatesRequest };
}

function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface CoerceResult {
  ok: true;
  value: ResearchFindings;
}
interface CoerceFail {
  ok: false;
  message: string;
}

function coerceResearchFindings(input: unknown): CoerceResult | CoerceFail {
  if (!isPlainObject(input)) {
    return { ok: false, message: "research must be an object" };
  }
  // Trust strict json_schema enforcement; treat the shape as ResearchFindings.
  // Belt-and-braces: ensure findings is an array.
  if (!Array.isArray(input.findings)) {
    return { ok: false, message: "research.findings must be an array" };
  }
  return { ok: true, value: input as unknown as ResearchFindings };
}
