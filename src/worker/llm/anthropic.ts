import type {
  LlmGenerateArgs,
  LlmGenerateResult,
  LlmProvider,
} from "./types";
import { combineWithTimeout, isTimeoutError } from "./abort";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const TOOL_NAME = "emit_follow_up_memo";
const TIMEOUT_MS = 60_000;

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function createAnthropicProvider(
  apiKey: string,
  model: string,
): LlmProvider {
  return {
    providerName: "anthropic",
    modelUsed: model,
    async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
      const { signal, clear } = combineWithTimeout(args.abortSignal, TIMEOUT_MS);
      try {
        const body = {
          model,
          max_tokens: args.maxTokens,
          system: args.system,
          messages: [{ role: "user", content: args.user }],
          tools: [
            {
              name: TOOL_NAME,
              description:
                "Emit a 9-section follow-up investment memo grounded only in the provided material.",
              strict: true,
              input_schema: args.jsonSchema,
            },
          ],
          tool_choice: { type: "tool", name: TOOL_NAME },
        };

        let res: Response;
        try {
          res = await fetch(ANTHROPIC_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
            signal,
          });
        } catch (err) {
          const aborted = signal.aborted;
          const timeout = isTimeoutError(err);
          if (aborted) {
            logFailure(model, timeout ? "timeout" : "abort");
            return {
              ok: false,
              code: timeout ? "timeout" : "llm_error",
              message: timeout
                ? "LLM request timed out"
                : "LLM request was aborted",
              providerName: "anthropic",
              modelUsed: model,
            };
          }
          logFailure(model, "network");
          return {
            ok: false,
            code: "llm_error",
            message: err instanceof Error ? err.message : "Network error",
            providerName: "anthropic",
            modelUsed: model,
          };
        }

        if (res.status === 401) {
          logFailure(model, "unauthorized");
          return {
            ok: false,
            code: "not_configured",
            message: "Provider rejected the API key",
            providerName: "anthropic",
            modelUsed: model,
          };
        }
        if (res.status === 429) {
          logFailure(model, "rate_limited");
          return {
            ok: false,
            code: "rate_limited",
            message: "Provider rate limit",
            providerName: "anthropic",
            modelUsed: model,
          };
        }
        if (!res.ok) {
          logFailure(model, `http_${res.status}`);
          return {
            ok: false,
            code: "llm_error",
            message: `Provider returned HTTP ${res.status}`,
            providerName: "anthropic",
            modelUsed: model,
          };
        }

        let payload: AnthropicMessageResponse;
        try {
          payload = (await res.json()) as AnthropicMessageResponse;
        } catch {
          logFailure(model, "json_parse");
          return {
            ok: false,
            code: "malformed_output",
            message: "Provider response was not valid JSON",
            providerName: "anthropic",
            modelUsed: model,
          };
        }

        const block = (payload.content ?? []).find(
          (b) => b.type === "tool_use" && b.name === TOOL_NAME,
        );
        if (!block || block.input === undefined) {
          logFailure(model, "no_tool_use");
          return {
            ok: false,
            code: "malformed_output",
            message:
              "Provider did not emit the emit_follow_up_memo tool call",
            providerName: "anthropic",
            modelUsed: model,
          };
        }

        const inputTokens = payload.usage?.input_tokens;
        const outputTokens = payload.usage?.output_tokens;
        console.log(
          JSON.stringify({
            event: "llm_generate_ok",
            provider: "anthropic",
            model,
            inputTokens,
            outputTokens,
          }),
        );
        return {
          ok: true,
          json: block.input,
          providerName: "anthropic",
          modelUsed: model,
          inputTokens,
          outputTokens,
        };
      } finally {
        clear();
      }
    },
  };
}

function logFailure(model: string, errorType: string): void {
  console.log(
    JSON.stringify({
      event: "llm_generate_fail",
      provider: "anthropic",
      model,
      errorType,
    }),
  );
}
