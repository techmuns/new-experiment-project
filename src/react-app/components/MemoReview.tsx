import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Layers,
  Printer,
} from "lucide-react";
import type {
  FollowUpMemo,
  MemoConfidence,
  MemoSection,
} from "@shared/types";
import { humanSourceLabel } from "@shared/sanitizeMemo";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { SIGNAL_BADGE_TONE, SIGNAL_LABEL } from "../lib/signalDisplay";
import { buildPrintHtml } from "../lib/memoPrint";

const CONFIDENCE_TONE: Record<MemoConfidence, "success" | "warning" | "neutral"> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

const CONFIDENCE_LABEL: Record<MemoConfidence, string> = {
  high: "Confidence: High",
  medium: "Confidence: Medium",
  low: "Confidence: Low",
};

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
  const filenameStem = useMemo(() => buildFilenameStem(memo), [memo]);
  const copy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const downloadMarkdown = (): void => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameStem}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  // Phase 6E: print via a dedicated, self-contained document. Printing
  // the app page directly produced blank PDFs (the memo sits deep in the
  // React tree and a display:none ancestor can't be re-shown). The new
  // window contains ONLY the memo with compact A4 typography tuned for
  // a ≤3-page output, auto-triggers the print dialog, and closes itself
  // after printing. If the popup is blocked we fall back to printing the
  // app page (the global print CSS handles that path).
  const printMemo = (): void => {
    const html = buildPrintHtml(memo, { researchWindowLabel });
    const w = window.open("", "_blank");
    if (!w) {
      window.print();
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
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
    <div className="space-y-5" data-print="memo">
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
        <div className="flex items-center gap-2 flex-wrap memo-actions">
          <Button
            variant="primary"
            onClick={downloadMarkdown}
            leadingIcon={<Download className="w-4 h-4" />}
          >
            Download (Markdown)
          </Button>
          <Button
            variant="secondary"
            onClick={printMemo}
            leadingIcon={<Printer className="w-4 h-4" />}
          >
            Print / Save as PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copy}
            leadingIcon={
              copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </header>

      <article className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] px-8 sm:px-10 py-8">
        <div className="mb-5 inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <span className="uppercase tracking-[0.1em] font-semibold">
            Memo body
          </span>
          <span className="opacity-60">·</span>
          <span>
            {memo.sections.length} section{memo.sections.length === 1 ? "" : "s"} ·
            designed to fit under three pages
          </span>
        </div>
        {memo.sections.map((section, i) => (
          <SectionView
            key={section.id}
            section={section}
            index={i}
            isFirst={i === 0}
          />
        ))}
        {memo.manualChecksRemaining && memo.manualChecksRemaining.length > 0 && (
          <section className="pt-10">
            <div className="hairline mb-10" />
            <h3
              className="text-[16px] font-semibold tracking-tight text-[var(--color-text)] mb-3"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Manual checks remaining
            </h3>
            <ul className="space-y-1.5 list-disc pl-5">
              {memo.manualChecksRemaining.map((item, i) => (
                <li
                  key={i}
                  className="text-[13.5px] text-[var(--color-text-muted)] leading-[1.6]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      {memo.supplementaryPanels && memo.supplementaryPanels.length > 0 && (
        <SupplementaryPanels panels={memo.supplementaryPanels} />
      )}
    </div>
  );
}

// Phase 6B: supplementary panels render BELOW the memo as collapsible
// drawers. They carry the deep valuation/EPS/financial math that would
// push the printed memo over three pages.
function SupplementaryPanels({ panels }: { panels: MemoSection[] }) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] px-6 sm:px-8 py-6">
      <header className="flex items-baseline gap-2 mb-4">
        <Layers className="w-4 h-4 text-[var(--color-text-muted)] translate-y-[2px]" />
        <h3
          className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Supplementary detail
        </h3>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          Valuation · EPS bridge · memo-vs-actual financials — collapsed so the
          memo above stays under three pages
        </span>
      </header>
      <div className="space-y-2">
        {panels.map((p) => (
          <PanelDrawer key={p.id} panel={p} />
        ))}
      </div>
    </section>
  );
}

function PanelDrawer({ panel }: { panel: MemoSection }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline gap-3 px-4 py-3 text-left"
      >
        <span className="w-4 inline-flex justify-center text-[var(--color-text-muted)] translate-y-[2px]">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
        <span
          className="text-[14px] font-semibold tracking-tight text-[var(--color-text)] flex-1"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {panel.title}
        </span>
        {panel.signal && (
          <Badge tone={SIGNAL_BADGE_TONE[panel.signal]} dot>
            {SIGNAL_LABEL[panel.signal]}
          </Badge>
        )}
        {panel.confidence && (
          <Badge tone={CONFIDENCE_TONE[panel.confidence]}>
            {CONFIDENCE_LABEL[panel.confidence]}
          </Badge>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          {panel.summary && panel.summary !== panel.body && (
            <p
              className="text-[14px] text-[var(--color-text)] leading-[1.65] font-medium mt-3 mb-2"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {panel.summary}
            </p>
          )}
          {panel.bridge && panel.bridge.length > 0 && (
            <BridgeTable rows={panel.bridge} />
          )}
          {panel.body && (
            <p
              className="text-[14px] text-[var(--color-text)] leading-[1.65] whitespace-pre-line mt-3"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {panel.body}
            </p>
          )}
          {panel.bullets && panel.bullets.length > 0 && (
            <ul className="mt-3 space-y-1.5 list-disc pl-5">
              {panel.bullets.map((b, bi) => (
                <li
                  key={bi}
                  className="text-[13.5px] text-[var(--color-text)] leading-[1.6]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {b}
                </li>
              ))}
            </ul>
          )}
          {panel.confidenceNote && (
            <p className="mt-3 text-[11px] italic text-[var(--color-text-subtle)]">
              {panel.confidenceNote}
            </p>
          )}
          {panel.sources.length > 0 && (
            <ul className="mt-3 space-y-1 border-l-2 border-[var(--color-border)] pl-3">
              {panel.sources.map((src, i) => (
                <li
                  key={`${src.documentId}-${i}`}
                  className="text-[11px] text-[var(--color-text-muted)] leading-snug inline-flex items-start gap-1.5"
                >
                  <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium text-[var(--color-text)]">
                      {humanSourceLabel(src.documentId, i)}
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
        {section.confidence && (
          <Badge tone={CONFIDENCE_TONE[section.confidence]}>
            {CONFIDENCE_LABEL[section.confidence]}
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
      {section.bridge && section.bridge.length > 0 && (
        <BridgeTable rows={section.bridge} />
      )}
      {section.body && (
        <p
          className="text-[15.5px] text-[var(--color-text)] leading-[1.7] whitespace-pre-line"
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
                    {/* Visible label is human-readable; the machine
                        documentId stays in the structured source object
                        (and the React key) but never renders as text. */}
                    <span className="font-medium text-[var(--color-text)]">
                      {humanSourceLabel(src.documentId, i)}
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

function BridgeTable({
  rows,
}: {
  rows: NonNullable<MemoSection["bridge"]>;
}) {
  return (
    <div className="my-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
      <table className="w-full text-[13px] border-collapse">
        <thead className="bg-[var(--color-surface-muted)]">
          <tr className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">
            <th className="text-left font-semibold px-3 py-2">Metric</th>
            <th className="text-left font-semibold px-3 py-2">Original anchor</th>
            <th className="text-left font-semibold px-3 py-2">Latest</th>
            <th className="text-left font-semibold px-3 py-2">Read-through</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={i === 0 ? "" : "border-t border-[var(--color-border)]"}
            >
              <td
                className="px-3 py-2 font-medium text-[var(--color-text)] align-top"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {row.metric}
              </td>
              <td
                className="px-3 py-2 text-[var(--color-text-muted)] align-top"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {row.original || "—"}
              </td>
              <td
                className="px-3 py-2 text-[var(--color-text)] align-top"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {row.latest || "—"}
              </td>
              <td
                className="px-3 py-2 text-[var(--color-text-muted)] italic align-top"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {row.readThrough || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildMarkdown(memo: FollowUpMemo): string {
  const lines: string[] = [
    `# ${memo.title}`,
    "",
    `Generated: ${memo.generatedAt}`,
    "",
  ];
  memo.sections.forEach((s, i) => appendSectionMarkdown(lines, s, i + 1));
  if (memo.manualChecksRemaining && memo.manualChecksRemaining.length > 0) {
    lines.push("## Manual checks remaining", "");
    for (const item of memo.manualChecksRemaining) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  if (memo.supplementaryPanels && memo.supplementaryPanels.length > 0) {
    lines.push("---", "", "# Supplementary detail", "");
    memo.supplementaryPanels.forEach((s, i) =>
      appendSectionMarkdown(lines, s, i + 1),
    );
  }
  return lines.join("\n");
}

function appendSectionMarkdown(
  lines: string[],
  s: MemoSection,
  index: number,
): void {
  const confTag = s.confidence ? `  _(confidence: ${s.confidence})_` : "";
  lines.push(`## ${index}. ${s.title}${confTag}`);
  if (s.summary) lines.push(s.summary);
  if (s.bridge && s.bridge.length > 0) {
    lines.push("", "| Metric | Original anchor | Latest | Read-through |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of s.bridge) {
      lines.push(
        `| ${escapePipe(row.metric)} | ${escapePipe(row.original ?? "—")} | ${escapePipe(row.latest ?? "—")} | ${escapePipe(row.readThrough ?? "—")} |`,
      );
    }
  }
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
    s.sources.forEach((src, si) => {
      const extras = [
        src.page ? `p.${src.page}` : null,
        src.quote ? `"${src.quote}"` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      lines.push(
        `- ${humanSourceLabel(src.documentId, si)}${extras ? ` · ${extras}` : ""}`,
      );
    });
  }
  lines.push("");
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function buildFilenameStem(memo: FollowUpMemo): string {
  const dateIso = memo.generatedAt.slice(0, 10);
  const slug = memo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `${slug}-${dateIso}` : `follow-up-memo-${dateIso}`;
}
