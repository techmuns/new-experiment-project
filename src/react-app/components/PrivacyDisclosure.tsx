import { Info } from "lucide-react";

interface PrivacyDisclosureProps {
  variant?: "research" | "local";
}

const COPY = {
  research: {
    title: "This sends extracted memo text and detected context to OpenAI for web research.",
    body: "Do not upload confidential material unless your organization has approved this provider path.",
    sub: "Local extraction is separate from server-side LLM/web research.",
  },
  local: {
    title: "Extraction runs locally in your browser.",
    body: "Memo text and DNA stay on this device until you click Research or Generate.",
    sub: "",
  },
} as const;

export function PrivacyDisclosure({ variant = "research" }: PrivacyDisclosureProps) {
  const copy = COPY[variant];
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 flex items-start gap-3">
      <Info className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-[var(--color-text)] leading-snug">
          {copy.title}
        </div>
        <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
          {copy.body}
        </div>
        {copy.sub && (
          <div className="text-[11.5px] text-[var(--color-text-subtle)] mt-1.5 italic">
            {copy.sub}
          </div>
        )}
      </div>
    </div>
  );
}
