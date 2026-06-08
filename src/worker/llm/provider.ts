import type { LlmProvider } from "./types";
import type { LlmProviderName } from "@shared/types";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";

const SUPPORTED_PROVIDERS = ["openai", "anthropic"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function asSupportedProvider(value: string | undefined): SupportedProvider | undefined {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value ?? "")
    ? (value as SupportedProvider)
    : undefined;
}

// Wrangler typegen narrows vars to their default literal values. This
// widened view reflects the actual runtime shape — any of these may be
// undefined or any string at runtime.
interface LlmEnv {
  LLM_ENABLED?: string;
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;
  LLM_GATE_ENABLED?: string;
  LLM_GATE_SECRET?: string;
}

function readEnv(env: Env): LlmEnv {
  return env as unknown as LlmEnv;
}

const WARNING_LLM_DISABLED =
  "LLM is disabled. Deterministic generation remains available.";
const WARNING_GATE_OFF =
  "LLM is enabled without an app-level access gate. Protect this Worker using Cloudflare Access / WAF / rate limiting before public use.";
const WARNING_GATE_NO_SECRET =
  "LLM gate is enabled but no gate secret is configured.";

export interface LlmReadiness {
  llmEnabled: boolean;
  providerConfigured: boolean;
  apiKeyConfigured: boolean;
  provider?: LlmProviderName;
  model?: string;
  gateEnabled: boolean;
  gateConfigured: boolean;
  llmReady: boolean;
  warnings: string[];
}

export function evaluateLlmReadiness(env: Env): LlmReadiness {
  const e = readEnv(env);
  const llmEnabled = e.LLM_ENABLED === "true";
  const supported = asSupportedProvider(e.LLM_PROVIDER);
  const providerConfigured = supported !== undefined;
  const apiKeyConfigured = Boolean(e.LLM_API_KEY && e.LLM_API_KEY.length > 0);
  const model = e.LLM_MODEL && e.LLM_MODEL.length > 0 ? e.LLM_MODEL : undefined;
  const provider: LlmProviderName | undefined = supported;
  const gateEnabled = e.LLM_GATE_ENABLED === "true";
  const gateConfigured = Boolean(
    e.LLM_GATE_SECRET && e.LLM_GATE_SECRET.length > 0,
  );

  const llmReady =
    llmEnabled &&
    providerConfigured &&
    apiKeyConfigured &&
    Boolean(model) &&
    (!gateEnabled || gateConfigured);

  const warnings: string[] = [];
  if (!llmEnabled) {
    warnings.push(WARNING_LLM_DISABLED);
  } else if (!gateEnabled) {
    warnings.push(WARNING_GATE_OFF);
  } else if (!gateConfigured) {
    warnings.push(WARNING_GATE_NO_SECRET);
  }

  return {
    llmEnabled,
    providerConfigured,
    apiKeyConfigured,
    provider,
    model,
    gateEnabled,
    gateConfigured,
    llmReady,
    warnings,
  };
}

export type GateCheckResult =
  | { ok: true }
  | {
      ok: false;
      code: "gate_misconfigured" | "llm_access_denied";
      message: string;
    };

// Length-independent byte equality for short shared secrets. JIT can
// still rearrange, but this is materially better than naive `===` for
// the threat model (deter casual abuse — Cloudflare Access / WAF / rate
// limiting is the real defense, as the wrangler.jsonc comment warns).
function constantTimeEqual(a: string, b: string): boolean {
  const aLen = a.length;
  const bLen = b.length;
  const maxLen = Math.max(aLen, bLen, 1);
  let diff = aLen ^ bLen;
  for (let i = 0; i < maxLen; i++) {
    const ac = i < aLen ? a.charCodeAt(i) : 0;
    const bc = i < bLen ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

export function checkGateToken(
  env: Env,
  headerToken: string | undefined,
): GateCheckResult {
  const e = readEnv(env);
  const gateEnabled = e.LLM_GATE_ENABLED === "true";
  if (!gateEnabled) return { ok: true };
  const secret = e.LLM_GATE_SECRET;
  if (!secret) {
    return {
      ok: false,
      code: "gate_misconfigured",
      message: "LLM access gate is enabled but no secret is configured.",
    };
  }
  if (!headerToken) {
    return {
      ok: false,
      code: "llm_access_denied",
      message: "LLM access token missing.",
    };
  }
  if (!constantTimeEqual(headerToken, secret)) {
    return {
      ok: false,
      code: "llm_access_denied",
      message: "LLM access token is invalid.",
    };
  }
  return { ok: true };
}

export function getProvider(env: Env): LlmProvider | null {
  const e = readEnv(env);
  if (e.LLM_ENABLED !== "true") return null;
  const apiKey = e.LLM_API_KEY;
  const model = e.LLM_MODEL;
  if (!apiKey || !model) return null;
  const supported = asSupportedProvider(e.LLM_PROVIDER);
  if (!supported) return null;
  switch (supported) {
    case "openai":
      return createOpenAIProvider(apiKey, model);
    case "anthropic":
      return createAnthropicProvider(apiKey, model);
  }
}
