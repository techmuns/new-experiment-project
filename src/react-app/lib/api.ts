import type {
  FollowUpMemo,
  GenerateFollowUpMemoRequest,
  GenerateFollowUpMemoResponse,
  HealthResponse,
  LlmStatusResponse,
  MemoDNA,
  MemoProject,
  ResearchUpdatesRequest,
  ResearchUpdatesResponse,
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
};
