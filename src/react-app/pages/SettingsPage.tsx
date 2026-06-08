import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useLlmGateToken } from "../lib/llmGateToken";
import { useMemoProject } from "../state/MemoProjectContext";

type RowTone = "neutral" | "ink" | "accent" | "warning" | "success";

interface SettingsRow {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  detail: string;
  status: string;
  tone: RowTone;
}

export function SettingsPage() {
  const { state, refreshLlmProviderStatus, syncGateTokenSet } = useMemoProject();
  const status = state.llmProviderStatus;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [gateToken, setGateToken] = useLlmGateToken();
  const [draftToken, setDraftToken] = useState("");

  useEffect(() => {
    void refreshLlmProviderStatus();
  }, [refreshLlmProviderStatus]);

  const llmEnabled = status?.llmEnabled === true;
  const providerConfigured = status?.providerConfigured === true;
  const apiKeyConfigured = status?.apiKeyConfigured === true;
  const apiKeySource = status?.apiKeySource ?? "none";
  const gateEnabled = status?.gateEnabled === true;
  const gateConfigured = status?.gateConfigured === true;
  const llmReady = status?.llmReady === true;
  const researchAvailable = status?.researchAvailable === true;
  const warnings = status?.warnings ?? [];

  const rows: SettingsRow[] = [
    {
      icon: ShieldCheck,
      label: "LLM enabled",
      detail: 'LLM_ENABLED — server must set this var to "true"',
      status: llmEnabled ? "Yes" : "No",
      tone: llmEnabled ? "success" : "warning",
    },
    {
      icon: Sparkles,
      label: "Provider",
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
      detail:
        apiKeySource === "none"
          ? "Neither LLM_API_KEY nor OPENAI_API_KEY is set"
          : `Loaded from ${apiKeySource} (value never returned)`,
      status: apiKeyConfigured ? "Yes" : "No",
      tone: apiKeyConfigured ? "success" : "warning",
    },
    {
      icon: Sparkles,
      label: "Research available",
      detail: "Requires OpenAI provider, valid key, gate satisfied",
      status: researchAvailable ? "Yes" : "No",
      tone: researchAvailable ? "success" : "neutral",
    },
    {
      icon: Sparkles,
      label: "LLM memo generation available",
      detail: "Requires any supported provider + valid key + gate satisfied",
      status: llmReady ? "Yes" : "No",
      tone: llmReady ? "success" : "warning",
    },
    {
      icon: ShieldCheck,
      label: "Fallback / demo available",
      detail: "GET /api/demo/follow-up-memo always returns a 9-section memo",
      status: "Always available",
      tone: "success",
    },
    {
      icon: Lock,
      label: "Access gate enabled",
      detail:
        'LLM_GATE_ENABLED — repo default is "true" because there is no Cloudflare Access / WAF / rate limiting configured yet. Operators can flip to "false" after configuring those.',
      status: gateEnabled ? "Yes" : "No",
      tone: gateEnabled ? "accent" : "warning",
    },
  ];

  const handleSave = (): void => {
    setGateToken(draftToken.length > 0 ? draftToken : null);
    setDraftToken("");
    syncGateTokenSet();
  };

  const handleClear = (): void => {
    setGateToken(null);
    setDraftToken("");
    syncGateTokenSet();
  };

  return (
    <div className="space-y-7">
      <SectionHeader
        eyebrow="Settings"
        title="LLM configuration and readiness"
        description="Memo Updater v1 generates a same-style follow-up memo from an uploaded original memo, an OpenAI web_search research pass, and the deployed LLM. This page shows the server-side readiness. No secrets are returned to the browser."
      />

      <Panel
        eyebrow="LLM"
        title={llmReady ? "LLM is ready" : "LLM is not ready"}
        actions={
          <Badge tone={llmReady ? "success" : "neutral"} dot>
            {llmReady ? "Ready" : "Not ready"}
          </Badge>
        }
      >
        {warnings.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {warnings.map((msg) => (
              <li
                key={msg}
                className="text-[11.5px] text-[var(--color-warning)] inline-flex items-start gap-1.5 leading-snug"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11.5px] text-[var(--color-text-subtle)] mb-2 leading-relaxed">
          The OpenAI key is preferred under <code className="font-mono">LLM_API_KEY</code>.
          When <code className="font-mono">LLM_PROVIDER=openai</code>, a Cloudflare
          secret already provisioned as <code className="font-mono">OPENAI_API_KEY</code>{" "}
          is accepted as a fallback. Neither value is ever returned to the browser.
        </p>
        <RowList rows={rows} />
      </Panel>

      <Panel
        eyebrow="Hardening reminder"
        title="Cloudflare Access / WAF / rate limiting"
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] leading-relaxed">
          The app-level gate token is a cost-spend deterrent only. Before any
          non-internal deployment, configure Cloudflare Access, a WAF rule, or
          an IP allowlist, and a rate-limit policy on the Worker. Once those
          are in place an operator can set{" "}
          <code className="font-mono">LLM_GATE_ENABLED="false"</code> in{" "}
          <code className="font-mono">wrangler.jsonc</code> to drop the in-app
          token UX.
        </p>
      </Panel>

      <Panel
        eyebrow="Advanced"
        title="Internal access token"
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdvancedOpen((v) => !v)}
            leadingIcon={
              advancedOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )
            }
          >
            {advancedOpen ? "Hide" : "Show"}
          </Button>
        }
      >
        {!advancedOpen ? (
          <p className="text-[12px] text-[var(--color-text-subtle)] leading-relaxed">
            For internal testing only. Stored in this tab's session storage and
            sent as the <code className="font-mono">X-Memo-LLM-Gate</code>{" "}
            header. The main workspace never shows this field.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
              {gateEnabled
                ? gateConfigured
                  ? "The gate is enabled and the server has a secret. Paste the matching token below to unlock research / generation calls in this tab."
                  : "The gate is enabled but no server secret is configured. Either set LLM_GATE_SECRET via wrangler secret put, or disable the gate."
                : "The gate is disabled on the server. Tokens entered here will be sent but ignored."}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder={gateToken ? "(token set in this tab)" : "Paste internal access token"}
                className="flex-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[13px] font-mono"
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={draftToken.length === 0}
              >
                Save token
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClear}
                disabled={!gateToken && draftToken.length === 0}
              >
                Clear
              </Button>
            </div>
            <p className="text-[11.5px] text-[var(--color-text-subtle)]">
              Token status: {gateToken ? "set" : "not set"} (session storage only — never logged).
            </p>
          </div>
        )}
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
            <div className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
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
