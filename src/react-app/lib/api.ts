import type {
  FollowUpMemo,
  GenerateFollowUpMemoRequest,
  GenerateFollowUpMemoResponse,
  GenerateMemoSectionRequest,
  GenerateMemoSectionResponse,
  HealthResponse,
  LlmStatusResponse,
  MemoDNA,
  MemoProject,
  MemoUnderstandRequest,
  MemoUnderstandResponse,
  ResearchPassRequest,
  ResearchPassResponse,
  ResearchUpdatesRequest,
  ResearchUpdatesResponse,
  StockSearchResponse,
} from "@shared/types";
import { getLlmGateToken } from "./llmGateToken";

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<TResponse, TBody>(
  path: string,
  body: TBody,
  init?: RequestInit,
): Promise<TResponse> {
  const res = await fetch(path, {
    ...init,
    method: "POST",
    headers: {
      "content-type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<TResponse>;
}

// Attach the X-Memo-LLM-Gate header only when a non-empty token is set in
// session storage (Settings → Advanced). When the gate is off, the worker
// ignores the missing header; when the gate is on and the header is
// missing, the worker returns {ok:false, code:"llm_access_denied"} which
// the workspace surfaces as a "Setup required" panel.
function gateHeader(): Record<string, string> {
  const token = getLlmGateToken();
  return token && token.length > 0 ? { "X-Memo-LLM-Gate": token } : {};
}

export const api = {
  health: () => getJson<HealthResponse>("/api/health"),
  demoProject: () => getJson<MemoProject>("/api/demo/project"),
  demoMemoDna: () => getJson<MemoDNA>("/api/demo/memo-dna"),
  demoFollowUpMemo: () => getJson<FollowUpMemo>("/api/demo/follow-up-memo"),
  llmStatus: () => getJson<LlmStatusResponse>("/api/llm/status"),
  generateFollowUpMemo: (
    req: GenerateFollowUpMemoRequest,
    signal?: AbortSignal,
  ) =>
    postJson<GenerateFollowUpMemoResponse, GenerateFollowUpMemoRequest>(
      "/api/generate/follow-up-memo",
      req,
      {
        signal,
        headers: gateHeader(),
      },
    ),
  generateMemoSection: (
    req: GenerateMemoSectionRequest,
    signal?: AbortSignal,
  ) =>
    postJson<GenerateMemoSectionResponse, GenerateMemoSectionRequest>(
      "/api/generate/memo-section",
      req,
      {
        signal,
        headers: gateHeader(),
      },
    ),
  researchUpdates: (
    req: ResearchUpdatesRequest,
    signal?: AbortSignal,
  ) =>
    postJson<ResearchUpdatesResponse, ResearchUpdatesRequest>(
      "/api/research/updates",
      req,
      {
        signal,
        headers: gateHeader(),
      },
    ),
  researchPass: (
    req: ResearchPassRequest,
    signal?: AbortSignal,
  ) =>
    postJson<ResearchPassResponse, ResearchPassRequest>(
      "/api/research/pass",
      req,
      {
        signal,
        headers: gateHeader(),
      },
    ),
  memoUnderstand: (
    req: MemoUnderstandRequest,
    signal?: AbortSignal,
  ) =>
    postJson<MemoUnderstandResponse, MemoUnderstandRequest>(
      "/api/memo/understand",
      req,
      {
        signal,
        headers: gateHeader(),
      },
    ),
  // Company/stock search — the Worker proxies the Muns platform API and
  // injects the bearer token + static user_index server-side.
  stockSearch: (query: string, signal?: AbortSignal) =>
    postJson<StockSearchResponse, { query: string }>(
      "/api/stock/search",
      { query },
      { signal },
    ),
};
