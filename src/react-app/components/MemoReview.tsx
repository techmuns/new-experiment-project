import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, FileText } from "lucide-react";
import type { FollowUpMemo, MemoSection } from "@shared/types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { SIGNAL_BADGE_TONE, SIGNAL_LABEL } from "../lib/signalDisplay";

interface MemoReviewProps {
  memo: FollowUpMemo;
  generationType: "openai" | "demo";
  researchWindowLabel?: string;
}

export function MemoReview({
  memo,
  generationType,
  researchWindowLabel,
}: MemoReviewProps) {
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(() => buildMarkdown(memo), [memo]);
  const copy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const generatedDate = new Date(memo.generatedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const typeBadge =
    generationType === "openai" ? (
      <Badge tone="success" dot>
        OpenAI research memo
      </Badge>
    ) : (
      <Badge tone="warning" dot>
        Demo memo
      </Badge>
    );

  return (
    <div className="space-y-5">
      <header className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-6 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {typeBadge}
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Generated {generatedDate}
              {researchWindowLabel ? ` · ${researchWindowLabel}` : ""}
            </span>
          </div>
          <h2
            className="text-[22px] font-semibold tracking-tight text-[var(--color-text)] mt-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {memo.title}
          </h2>
        </div>
        <Button
          variant="secondary"
          onClick={copy}
          leadingIcon={
            copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />
          }
        >
          {copied ? "Copied" : "Copy memo (Markdown)"}
        </Button>
      </header>

      <article className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] px-8 sm:px-10 py-8">
        {memo.sections.map((section, i) => (
          <SectionView
            key={section.id}
            section={section}
            index={i}
            isFirst={i === 0}
          />
        ))}
      </article>
    </div>
  );
}

function SectionView({
  section,
  index,
  isFirst,
}: {
  section: MemoSection;
  index: number;
  isFirst: boolean;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  return (
    <section className={`scroll-mt-24 ${isFirst ? "" : "pt-10"}`}>
      {!isFirst && <div className="hairline mb-10" />}
      <div className="flex items-baseline gap-4 mb-4">
        <span
          className="tnum text-[36px] font-light text-[var(--color-text-subtle)] leading-none"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3
          className="text-[20px] font-semibold tracking-tight text-[var(--color-text)] leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {section.title}
        </h3>
        {section.signal && (
          <Badge tone={SIGNAL_BADGE_TONE[section.signal]} dot>
            {SIGNAL_LABEL[section.signal]}
          </Badge>
        )}
      </div>
      {section.summary && section.summary !== section.body && (
        <p
          className="text-[15.5px] text-[var(--color-text)] leading-[1.7] font-medium mb-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {section.summary}
        </p>
      )}
      {section.body && (
        <p
          className="text-[15.5px] text-[var(--color-text)] leading-[1.7]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {section.body}
        </p>
      )}
      {section.bullets && section.bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5 list-disc pl-5">
          {section.bullets.map((b, bi) => (
            <li
              key={bi}
              className="text-[14px] text-[var(--color-text)] leading-[1.65]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {b}
            </li>
          ))}
        </ul>
      )}
      {section.confidenceNote && (
        <p className="mt-3 text-[11px] italic text-[var(--color-text-subtle)]">
          {section.confidenceNote}
        </p>
      )}
      {section.sources.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            className="text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] inline-flex items-center gap-1.5"
          >
            {sourcesOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            Sources ({section.sources.length})
          </button>
          {sourcesOpen && (
            <ul className="mt-2 space-y-1.5 border-l-2 border-[var(--color-border)] pl-3">
              {section.sources.map((src, i) => (
                <li
                  key={`${src.documentId}-${i}`}
                  className="text-[11.5px] text-[var(--color-text-muted)] leading-snug inline-flex items-start gap-1.5"
                >
                  <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-mono text-[var(--color-text)]">
                      {src.documentId}
                    </span>
                    {src.page && <> · p.{src.page}</>}
                    {src.quote && <> — "{src.quote}"</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function buildMarkdown(memo: FollowUpMemo): string {
  const lines: string[] = [
    `# ${memo.title}`,
    "",
    `Generated: ${memo.generatedAt}`,
    "",
  ];
  memo.sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title}`);
    if (s.summary) lines.push(s.summary);
    if (s.body && s.body !== s.summary) lines.push("", s.body);
    if (s.bullets && s.bullets.length > 0) {
      lines.push("");
      for (const b of s.bullets) lines.push(`- ${b}`);
    }
    if (s.confidenceNote) {
      lines.push("", `_${s.confidenceNote}_`);
    }
    if (s.sources.length > 0) {
      lines.push("", "**Sources:**");
      for (const src of s.sources) {
        const extras = [src.page ? `p.${src.page}` : null, src.quote ? `"${src.quote}"` : null]
          .filter(Boolean)
          .join(" — ");
        lines.push(`- ${src.documentId}${extras ? ` · ${extras}` : ""}`);
      }
    }
    lines.push("");
  });
  return lines.join("\n");
}
