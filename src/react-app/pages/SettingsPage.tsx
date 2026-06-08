import { useEffect } from "react";
import {
  Database,
  HardDrive,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { AlertCircle } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Panel } from "../components/ui/Panel";
import { useMemoProject } from "../state/MemoProjectContext";

type RowTone = "neutral" | "ink" | "accent" | "warning" | "success";

interface SettingsRow {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  detail: string;
  status: string;
  tone: RowTone;
}

const STORAGE_ROWS: SettingsRow[] = [
  {
    icon: HardDrive,
    label: "R2 bucket",
    detail: "MEMO_UPLOADS — uploaded memos, financial PDFs, transcripts",
    status: "Not connected",
    tone: "neutral",
  },
  {
    icon: Database,
    label: "D1 database",
    detail: "DB — projects, MemoDNA extractions, generation runs",
    status: "Not connected",
    tone: "neutral",
  },
  {
    icon: Workflow,
    label: "Queues + Workflows",
    detail: "MEMO_QUEUE / MEMO_WORKFLOW — async extraction & generation",
    status: "Not connected",
    tone: "neutral",
  },
];

function yesNoBadge(value: boolean, positive = true): RowTone {
  if (value) return positive ? "success" : "warning";
  return positive ? "neutral" : "success";
}

export function SettingsPage() {
  const { state, refreshLlmProviderStatus } = useMemoProject();
  const status = state.llmProviderStatus;

  useEffect(() => {
    void refreshLlmProviderStatus();
  }, [refreshLlmProviderStatus]);

  const llmEnabled = status?.llmEnabled === true;
  const providerConfigured = status?.providerConfigured === true;
  const apiKeyConfigured = status?.apiKeyConfigured === true;
  const gateEnabled = status?.gateEnabled === true;
  const gateConfigured = status?.gateConfigured === true;
  const llmReady = status?.llmReady === true;
  const warnings = status?.warnings ?? [];

  const llmRows: SettingsRow[] = [
    {
      icon: ShieldCheck,
      label: "LLM enabled",
      detail: 'LLM_ENABLED — server must set this var to "true"',
      status: llmEnabled ? "Yes" : "No",
      tone: yesNoBadge(llmEnabled),
    },
    {
      icon: Sparkles,
      label: "Provider configured",
      detail: "LLM_PROVIDER",
      status: status?.provider ?? "—",
      tone: providerConfigured ? "ink" : "neutral",
    },
    {
      icon: Sparkles,
      label: "Model",
      detail: "LLM_MODEL",
      status: status?.model ?? "—",
      tone: status?.model ? "ink" : "neutral",
    },
    {
      icon: KeyRound,
      label: "API key configured",
      detail: "LLM_API_KEY — set via `wrangler secret put LLM_API_KEY`",
      status: apiKeyConfigured ? "Yes" : "No",
      tone: yesNoBadge(apiKeyConfigured),
    },
    {
      icon: Lock,
      label: "Access gate enabled",
      detail: 'LLM_GATE_ENABLED — recommended "true" for public deployments',
      status: gateEnabled ? "Yes" : "No",
      tone: gateEnabled ? "success" : "warning",
    },
    {
      icon: Lock,
      label: "Access gate configured",
      detail:
        "LLM_GATE_SECRET — set via `wrangler secret put LLM_GATE_SECRET`",
      status: gateConfigured ? "Yes" : "No",
      tone: gateEnabled
        ? gateConfigured
          ? "success"
          : "warning"
        : "neutral",
    },
    {
      icon: Sparkles,
      label: "LLM Memo v1 ready",
      detail: "Server-side readiness across all checks above",
      status: llmReady ? "Yes" : "No",
      tone: yesNoBadge(llmReady),
    },
    {
      icon: ShieldCheck,
      label: "Deterministic fallback",
      detail:
        "Deterministic v0 always runs in the browser if the LLM is unavailable or fails",
      status: "Always available",
      tone: "success",
    },
  ];

  return (
    <div className="space-y-7">
      <SectionHeader
        eyebrow="Settings"
        title="Bindings and secrets"
        description="LLM Follow-up Memo v1 defaults to the OpenAI provider; Anthropic remains available by setting LLM_PROVIDER. The app-level access gate stays on, and deterministic v0 remains the always-available fallback."
      />

      <Panel
        eyebrow="LLM generation"
        title={llmReady ? "LLM Memo v1 is ready" : "LLM Memo v1 is not ready"}
        actions={
          <Badge tone={llmReady ? "success" : "neutral"} dot>
            {llmReady ? "Ready" : "Not ready"}
          </Badge>
        }
      >
        {warnings.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {warnings.map((msg) => {
              const isWarning = !msg.startsWith("LLM is disabled");
              return (
                <li
                  key={msg}
                  className={`text-[11.5px] inline-flex items-start gap-1.5 leading-snug ${
                    isWarning
                      ? "text-[var(--color-warning)]"
                      : "text-[var(--color-text-muted)]"
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{msg}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11.5px] text-[var(--color-text-subtle)] mb-2">
          LLM Memo v1 sends extracted memo and update-pack text to the
          configured LLM provider. Deterministic v0 stays local/browser-side.
          Internal access tokens are stored in session storage only and are
          never logged.
        </p>
        <RowList rows={llmRows} />
      </Panel>

      <Panel eyebrow="Storage and pipelines" title="Cloudflare bindings">
        <RowList rows={STORAGE_ROWS} />
      </Panel>
    </div>
  );
}

function RowList({ rows }: { rows: SettingsRow[] }) {
  return (
    <ul className="divide-y divide-[var(--color-border)] -mx-5">
      {rows.map(({ icon: Icon, label, detail, status, tone }) => (
        <li key={label} className="px-5 py-3 flex items-center gap-4">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] grid place-items-center shrink-0 border border-[var(--color-border)]">
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[var(--color-text)]">
              {label}
            </div>
            <div className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 font-mono">
              {detail}
            </div>
          </div>
          <Badge tone={tone} dot>
            {status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
