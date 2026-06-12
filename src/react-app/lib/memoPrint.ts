import type { FollowUpMemo, MemoSection } from "@shared/types";
import { humanSourceLabel } from "@shared/sanitizeMemo";

// Phase 6E: dedicated print document for the follow-up memo.
//
// Why a standalone document: printing the app page directly is fragile —
// the memo lives deep inside the React tree, and hiding everything else
// with CSS is easy to break (a `display:none` ancestor cannot be
// re-shown, which produced blank PDFs). Instead the Print button opens
// a new window whose ONLY content is the memo, with self-contained
// typography tuned so a typical 6-section memo lands in ≤3 A4 pages.
//
// Scope: CORE memo body only (sec_* sections + manual checks). The
// supplementary sup_* panels deliberately stay out of the PDF to hold
// the 3-page budget — they remain available in the dashboard.

export interface BuildPrintHtmlOptions {
  researchWindowLabel?: string;
}

// Adaptive page-budget guard. At the default 10.5px serif, an A4 page
// holds roughly 3.8k visible characters; three pages ≈ 11.5k. When the
// memo's visible text volume crosses DENSE_THRESHOLD the document
// switches to a denser 9.5px type scale (~4.6k chars/page → ~14k in
// three pages), keeping long memos inside the 3-page budget without
// truncating content.
const DENSE_THRESHOLD = 10_000;

function visibleCharCount(memo: FollowUpMemo): number {
  let n = memo.title.length;
  for (const s of memo.sections) {
    n += (s.summary ?? "").length;
    n += (s.body ?? "").length;
    for (const b of s.bullets ?? []) n += b.length;
    for (const row of s.bridge ?? []) {
      n +=
        row.metric.length +
        (row.original ?? "").length +
        (row.latest ?? "").length +
        (row.readThrough ?? "").length;
    }
  }
  for (const m of memo.manualChecksRemaining ?? []) n += m.length;
  return n;
}

export function buildPrintHtml(
  memo: FollowUpMemo,
  opts: BuildPrintHtmlOptions = {},
): string {
  const dense = visibleCharCount(memo) > DENSE_THRESHOLD;
  const generatedDate = new Date(memo.generatedAt).toLocaleDateString("en-US", {
    dateStyle: "medium",
  });
  const metaParts = [
    `Generated ${escapeHtml(generatedDate)}`,
    opts.researchWindowLabel ? escapeHtml(opts.researchWindowLabel) : null,
    "Confidential — internal research draft",
  ].filter(Boolean);

  const sectionsHtml = memo.sections
    .map((s, i) => renderSection(s, i + 1))
    .join("\n");

  const manualChecksHtml =
    memo.manualChecksRemaining && memo.manualChecksRemaining.length > 0
      ? `<section class="manual">
  <h2>Manual checks remaining</h2>
  <ul>
    ${memo.manualChecksRemaining.map((m) => `<li>${escapeHtml(m)}</li>`).join("\n    ")}
  </ul>
</section>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(memo.title)}</title>
<style>
  @page { size: A4; margin: 13mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 10.5px;
    line-height: 1.5;
    color: #101418;
    background: #ffffff;
  }
  body.dense { font-size: 9.5px; line-height: 1.45; }
  body.dense table { font-size: 8.5px; }
  body.dense section.memo-sec { margin-bottom: 8px; }
  body.dense th, body.dense td { padding: 2px 5px; }
  header.memo-head {
    border-bottom: 1.5pt solid #101418;
    padding-bottom: 6px;
    margin-bottom: 12px;
  }
  header.memo-head h1 {
    font-size: 16px;
    margin: 0 0 2px 0;
    letter-spacing: -0.01em;
  }
  header.memo-head .meta {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
  }
  section.memo-sec { margin: 0 0 11px 0; }
  section.memo-sec h2 {
    font-size: 12px;
    margin: 0 0 3px 0;
  }
  section.memo-sec h2 .num {
    color: #9ca3af;
    font-weight: normal;
    margin-right: 6px;
  }
  section.memo-sec h2 .sig {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #6b7280;
    margin-left: 8px;
    vertical-align: 2px;
  }
  .summary { font-weight: bold; margin: 0 0 3px 0; }
  .body { margin: 3px 0 0 0; white-space: pre-line; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
    margin: 5px 0;
    page-break-inside: avoid;
  }
  th, td {
    border: 0.5pt solid #c5c9ce;
    padding: 2.5px 6px;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    font-family: Arial, Helvetica, sans-serif;
    background: #f1efe8;
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #565d66;
  }
  ul { margin: 4px 0 0 15px; padding: 0; }
  li { margin: 1.5px 0; }
  .sources {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7.5px;
    color: #8a919b;
    margin-top: 3px;
  }
  section.manual {
    margin-top: 12px;
    border-top: 0.5pt solid #c5c9ce;
    padding-top: 6px;
  }
  section.manual h2 { font-size: 11px; margin: 0 0 2px 0; }
  section.manual ul { font-size: 9.5px; color: #4b5563; }
  footer.memo-foot {
    font-family: Arial, Helvetica, sans-serif;
    margin-top: 14px;
    border-top: 0.5pt solid #c5c9ce;
    padding-top: 5px;
    font-size: 7.5px;
    color: #8a919b;
  }
</style>
</head>
<body${dense ? ' class="dense"' : ""}>
<header class="memo-head">
  <h1>${escapeHtml(memo.title)}</h1>
  <div class="meta">${metaParts.join(" · ")}</div>
</header>
${sectionsHtml}
${manualChecksHtml}
<footer class="memo-foot">
  Draft for research support — not investment advice; analyst sign-off required.
  Supplementary valuation / EPS / memo-vs-actual detail is available in the dashboard.
</footer>
<script>
  window.addEventListener("load", function () {
    window.focus();
    window.print();
  });
  window.onafterprint = function () { window.close(); };
</script>
</body>
</html>`;
}

function renderSection(s: MemoSection, index: number): string {
  const parts: string[] = [];
  const sig = s.signal ? `<span class="sig">${escapeHtml(signalLabel(s.signal))}</span>` : "";
  parts.push(`<section class="memo-sec">`);
  parts.push(
    `  <h2><span class="num">${String(index).padStart(2, "0")}</span>${escapeHtml(s.title)}${sig}</h2>`,
  );
  if (s.summary && s.summary !== s.body) {
    parts.push(`  <p class="summary">${escapeHtml(s.summary)}</p>`);
  }
  if (s.bridge && s.bridge.length > 0) {
    parts.push(renderBridge(s));
  }
  if (s.body) {
    parts.push(`  <p class="body">${escapeHtml(s.body)}</p>`);
  }
  if (s.bullets && s.bullets.length > 0) {
    parts.push(
      `  <ul>\n${s.bullets.map((b) => `    <li>${escapeHtml(b)}</li>`).join("\n")}\n  </ul>`,
    );
  }
  if (s.sources.length > 0) {
    const labels = s.sources
      .map((src, i) => {
        const page = src.page ? ` p.${src.page}` : "";
        return `${humanSourceLabel(src.documentId, i)}${page}`;
      })
      .join(" · ");
    parts.push(`  <div class="sources">Sources: ${escapeHtml(labels)}</div>`);
  }
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderBridge(s: MemoSection): string {
  const rows = (s.bridge ?? [])
    .map(
      (row) => `      <tr>
        <td>${escapeHtml(row.metric)}</td>
        <td>${escapeHtml(row.original ?? "—")}</td>
        <td>${escapeHtml(row.latest ?? "—")}</td>
        <td>${escapeHtml(row.readThrough ?? "—")}</td>
      </tr>`,
    )
    .join("\n");
  return `  <table>
    <thead>
      <tr><th>Metric</th><th>Original anchor</th><th>Latest</th><th>Read-through</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

function signalLabel(signal: NonNullable<MemoSection["signal"]>): string {
  switch (signal) {
    case "positive":
      return "Positive";
    case "negative":
      return "Negative";
    case "watch":
      return "Watch";
    case "neutral":
      return "Neutral";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
