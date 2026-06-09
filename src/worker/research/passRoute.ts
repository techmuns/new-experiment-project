// Phase 5E: per-pass research handler. The workspace orchestrates 6
// sequential calls to this endpoint instead of one big /api/research/updates
// call. Each pass focuses on a narrow scope (official_results /
// management_call / investor_presentation / press_and_results /
// valuation_market / risks_competition), so the model + web_search workload
// per call stays well under the 60s provider timeout.
import type { Context } from "hono";
import type {
  LlmGenerationWarning,
  LlmProviderName,
  ResearchErrorCode,
  ResearchFindings,
  ResearchPassHarvestedUrl,
  ResearchPassId,
  ResearchPassRequest,
  ResearchPassResponse,
} from "@shared/types";
import {
  checkGateToken,
  evaluateLlmReadiness,
  getProviderName,
} from "../llm/provider";
import { callOpenAIResponses, harvestWebSources } from "../llm/openai";
import {
  RESEARCH_PASS_IDS,
  buildResearchPassPrompt,
} from "./passPrompt";
import {
  RESEARCH_PASS_FORMAT_NAME,
  RESEARCH_PASS_OPENAI_SCHEMA,
  normalizePassNulls,
} from "./passSchema";
import { enforceSourceGrounding } from "./validate";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const PASS_MAX_OUTPUT_TOKENS = 2_500;
const PASS_COMPACT_MAX_OUTPUT_TOKENS = 1_500;
const GATE_HEADER = "x-memo-llm-gate";

const WEB_SEARCH_TOOL = { type: "web_search" } as const;
const WEB_SEARCH_TOOL_CHOICE = { type: "web_search" } as const;
const PASS_INCLUDE = ["web_search_call.action.sources"] as const;

export async function handleResearchPass(
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
  const validation = validateResearchPassRequest(parsed);
  if (!validation.ok) {
    return c.json(
      { error: "invalid_request", message: validation.message },
      400,
    );
  }
  const passId = validation.value.passId;

  const readiness = evaluateLlmReadiness(c.env);
  if (!readiness.llmEnabled) {
    return c.json(
      buildSafeFailure("not_configured", "LLM research is not enabled on this server.", passId),
    );
  }
  if (!readiness.providerConfigured) {
    return c.json(
      buildSafeFailure(
        "provider_missing",
        "LLM provider is not configured.",
        passId,
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
        passId,
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
        passId,
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
          passId,
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
        "Research provider unavailable.",
        passId,
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
        passId,
        readiness.provider,
        readiness.model,
      ),
    );
  }

  try {
    const prompt = buildResearchPassPrompt(validation.value);
    const maxTokens = validation.value.retryCompact
      ? PASS_COMPACT_MAX_OUTPUT_TOKENS
      : PASS_MAX_OUTPUT_TOKENS;

    console.log(
      JSON.stringify({
        event: "llm_research_pass_enter",
        passId,
        retryCompact: validation.value.retryCompact === true,
        systemLen: prompt.system.length,
        userLen: prompt.user.length,
        maxTokens,
        model: readiness.model,
      }),
    );

    const call = await callOpenAIResponses({
      apiKey,
      model: readiness.model,
      system: prompt.system,
      user: prompt.user,
      schema: RESEARCH_PASS_OPENAI_SCHEMA,
      schemaName: RESEARCH_PASS_FORMAT_NAME,
      tools: [WEB_SEARCH_TOOL as unknown as Record<string, unknown>],
      toolChoice: WEB_SEARCH_TOOL_CHOICE,
      include: [...PASS_INCLUDE],
      maxTokens,
      abortSignal: c.req.raw.signal,
      logEventTag: "llm_research_pass",
    });

    if (!call.ok) {
      return c.json(
        buildSafeFailure(
          translateProviderFailToResearchCode(call.code),
          call.message,
          passId,
          readiness.provider,
          readiness.model,
        ),
      );
    }

    const normalized = normalizePassNulls(call.parsed);
    const shape = coercePassPayload(normalized);
    if (!shape.ok) {
      return c.json(
        buildSafeFailure(
          "parse_error",
          shape.message,
          passId,
          readiness.provider,
          readiness.model,
        ),
      );
    }

    const harvested = harvestWebSources(call.payload);
    // Wrap the pass payload in a synthetic ResearchFindings shell so
    // enforceSourceGrounding can reuse the Phase 5B downgrade rules
    // unchanged. The shell's company / researchWindow / grouping arrays
    // are intentionally empty — the client merge rebuilds them across
    // all passes.
    const shell: ResearchFindings = {
      generatedAt: new Date().toISOString(),
      company: validation.value.companyAliases.longName,
      researchWindow: {
        startIsoMonth: validation.value.detection.researchStart ?? "",
        endIsoMonth: validation.value.detection.researchCurrent,
      },
      findings: shape.findings,
      positiveDevelopments: [],
      negativeDevelopments: [],
      neutralOrWatch: [],
      thesisCheckpointImpact: [],
      unresolvedQuestions: shape.unresolvedQuestions,
      warnings: shape.warnings,
    };
    const grounded = enforceSourceGrounding(shell, harvested);

    const harvestedUrls: ResearchPassHarvestedUrl[] = [];
    for (const [url, meta] of harvested.byUrl.entries()) {
      harvestedUrls.push({ url, title: meta.title, date: meta.date });
    }

    console.log(
      JSON.stringify({
        event: "llm_research_pass_sources",
        passId,
        webSearchCallCount: harvested.webSearchCallCount,
        urlCitationCount: harvested.urlCitationCount,
        webSearchSourceCount: harvested.webSearchSourceCount,
        findings: grounded.findings.findings.length,
      }),
    );

    const warnings: LlmGenerationWarning[] = [];
    for (const w of grounded.findings.warnings) {
      warnings.push({ code: "schema_warning", message: w });
    }
    if (
      harvested.urlCitationCount === 0 &&
      harvested.webSearchSourceCount === 0
    ) {
      warnings.push({
        code: "schema_warning",
        message:
          "No web_search citations found in this pass; relying on model-emitted sources only.",
      });
    }

    const body: ResearchPassResponse = {
      ok: true,
      passId,
      findings: grounded.findings.findings,
      harvestedUrls,
      unresolvedQuestions: grounded.findings.unresolvedQuestions,
      warnings,
      providerMetadata: {
        providerName: "openai",
        modelUsed: readiness.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      },
    };
    return c.json(body);
  } catch {
    console.log(
      JSON.stringify({
        event: "llm_research_pass_unexpected_fail",
        passId,
        provider: readiness.provider,
        model: readiness.model,
        errorType: "internal",
      }),
    );
    return c.json(
      buildSafeFailure(
        "provider_error",
        "Internal research-pass error.",
        passId,
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
  passId: ResearchPassId,
  providerName?: LlmProviderName,
  modelUsed?: string,
): ResearchPassResponse {
  return {
    ok: false,
    passId,
    code,
    message,
    providerName,
    modelUsed,
  };
}

function translateProviderFailToResearchCode(
  code:
    | "llm_error"
    | "timeout"
    | "malformed_output"
    | "rate_limited"
    | "not_configured",
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

type PassValidationResult =
  | { ok: true; value: ResearchPassRequest }
  | { ok: false; message: string };

function validateResearchPassRequest(input: unknown): PassValidationResult {
  if (!isPlainObject(input)) return invalid("request must be an object");
  const passId = input.passId;
  if (typeof passId !== "string") return invalid("passId missing");
  if (!(RESEARCH_PASS_IDS as readonly string[]).includes(passId)) {
    return invalid(`passId is not a canonical research pass id: ${passId}`);
  }
  const project = input.project;
  if (!isPlainObject(project)) return invalid("project missing");
  if (typeof project.id !== "string") return invalid("project.id missing");
  if (typeof project.companyName !== "string")
    return invalid("project.companyName missing");

  const aliases = input.companyAliases;
  if (!isPlainObject(aliases)) return invalid("companyAliases missing");
  if (typeof aliases.longName !== "string" || aliases.longName.length === 0)
    return invalid("companyAliases.longName missing");

  if (!isPlainObject(input.dna)) return invalid("dna missing");
  const dna = input.dna;
  if (typeof dna.projectId !== "string") return invalid("dna.projectId missing");

  const detection = input.detection;
  if (!isPlainObject(detection)) return invalid("detection missing");
  if (typeof detection.periodLabel !== "string")
    return invalid("detection.periodLabel missing");
  if (typeof detection.researchCurrent !== "string")
    return invalid("detection.researchCurrent missing");

  return { ok: true, value: input as unknown as ResearchPassRequest };
}

function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PassCoerceOk {
  ok: true;
  findings: ResearchFindings["findings"];
  unresolvedQuestions: string[];
  warnings: string[];
}
interface PassCoerceFail {
  ok: false;
  message: string;
}

function coercePassPayload(input: unknown): PassCoerceOk | PassCoerceFail {
  if (!isPlainObject(input)) {
    return { ok: false, message: "research pass result must be an object" };
  }
  if (!Array.isArray(input.findings)) {
    return { ok: false, message: "research pass findings must be an array" };
  }
  const unresolved = Array.isArray(input.unresolvedQuestions)
    ? (input.unresolvedQuestions as unknown[]).filter(
        (q): q is string => typeof q === "string",
      )
    : [];
  const warnings = Array.isArray(input.warnings)
    ? (input.warnings as unknown[]).filter(
        (w): w is string => typeof w === "string",
      )
    : [];
  return {
    ok: true,
    findings: input.findings as ResearchFindings["findings"],
    unresolvedQuestions: unresolved,
    warnings,
  };
}
