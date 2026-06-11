import type { FollowUpMemo } from "../types";

// Phase 6B: restructured demo memo. SIX core sec_* sections in the printed
// body + THREE sup_* supplementary panels in the collapsible drawer below.
// The core memo body is deliberately tight (~3 pages total when printed).
// Content mirrors the client-supplied Stage 1 update note style.

export const demoFollowUpMemo: FollowUpMemo = {
  projectId: "proj_demo_rategain",
  title: "RateGain Follow-up Memo — Demo Output",
  generatedAt: "2026-06-05T09:12:00.000Z",
  sections: [
    {
      id: "sec_thesis_scorecard",
      title: "Memo vs Reality Scorecard",
      summary:
        "Stock +16% in 25 months — well below the memo's +43% base case; thesis broadly intact but transformed.",
      body: "The stock has returned ~16% (~7% p.a.) vs the memo's 43–61% upside case. ~100% of the return came from earnings growth — the multiple actually de-rated ~13% as the market discounted lower margins and higher leverage from the Sojern deal. The original clean, net-cash, organic-compounder thesis is partly broken; what remains is a larger-scale, debt-funded, integration-dependent story that is monitorable but no longer the same security.",
      bullets: [
        "Stock 670 → 778, +16% over ~25 months, vs Nifty 50 ~+12% and Nifty IT negative over the period.",
        "Memo's 40x P/E target on FY26 EPS would have implied ~32% upside on reported numbers vs +16% delivered.",
        "Mix-shift to lower-margin ad-tech revenue drove EBITDA margin from 21.6% to 18.5% — the core driver of multiple compression.",
      ],
      signal: "watch",
      confidence: "high",
      confidenceNote:
        "Anchored on Stage 1 memo target multiple and FY26 results press release; index-level returns are secondary context.",
      bridge: [
        {
          metric: "Stock price (memo vs current)",
          original: "INR 670 (7-May-2024)",
          latest: "INR 778 (4-Jun-2026)",
          readThrough: "+16% in 25 months",
        },
        {
          metric: "Memo target / upside",
          original: "+43% base / +61% bull (20m horizon)",
          latest: "+16% delivered",
          readThrough: "Materially below",
        },
        {
          metric: "Implied price @ original 40x on FY26 EPS",
          original: "40x P/E (memo basis)",
          latest: "~INR 1,030 implied",
          readThrough: "Stock ~24% below implied",
        },
        {
          metric: "EBITDA margin",
          original: "Memo: rising to ~23–25%",
          latest: "FY26 actual: 18.5%",
          readThrough: "Margin thesis broken",
        },
      ],
      sources: [{ documentId: "doc_demo_01" }, { documentId: "doc_demo_02" }],
    },
    {
      id: "sec_what_changed",
      title: "What Changed — Industry · Company · Financials",
      summary:
        "Industry intact but with AI overhang; company transformed by Sojern; financials top-line strong but margin / leverage worse.",
      body: "The thesis is broadly intact but the SECURITY is different: from clean, net-cash, organic compounder to debt-funded, integration-dependent platform. Thesis broadly intact, because revenue growth and AI positioning hold — but execution risk and balance-sheet quality have stepped down a notch.",
      bullets: [
        "Industry: Generative-AI travel search is now the defining structural force; RateGain is positioning travel-intent data as the moat (Adara+Sojern unification).",
        "Company: Sojern acquisition (Nov-2025) shifts the firm from net-cash to net-debt; CFO has resigned (May-2026), interim CFO appointed.",
        "Financials: Revenue +69% YoY (mostly inorganic); EBITDA margin 21.6% → 18.5%; PAT down 7%; debtor days held, working-capital days rose.",
      ],
      signal: "watch",
      confidence: "high",
      confidenceNote:
        "Cross-verified against the FY26 results press release and BSE CFO/KMP filings.",
      sources: [{ documentId: "doc_demo_02" }, { documentId: "doc_demo_03" }],
    },
    {
      id: "sec_shareholding",
      title: "Shareholding & Ownership Changes",
      summary:
        "Promoter stable ~48.8%; FII share down ~5 ppt over two years; DII / retail picked up the slack — neutral-to-slightly-negative read.",
      body: "Promoter holding eased from 51.25% to ~48.8% via the Nov-2023 QIP, then stabilised. No fresh promoter selling, no disclosed pledge. FII share fell from 10.5% to 5.4% — a mild negative on global institutional conviction. DII and public/retail picked up the slack, indicating a shift toward a more domestic, retail-heavy register. The Nov-QIP funded the Sojern deal; dilution is real but was put to acquisition use, not cash burn.",
      bullets: [
        "Promoter 51.25% → 48.77% (post QIP/dilution); no pledge disclosed.",
        "FII flight: 10.49% → 5.35% (-5.1 ppt over 2 years).",
        "DII +3.6 ppt to 20.86%; public +4.1 ppt to 24.96% — register shifts retail/domestic.",
      ],
      signal: "watch",
      confidence: "medium",
      confidenceNote:
        "Per BSE/NSE shareholding-pattern filings via Screener.in; named fund-level moves not surfaced in this run.",
      bridge: [
        {
          metric: "Promoter",
          original: "51.25% (Mar-24)",
          latest: "48.77% (Mar-26)",
          readThrough: "Stable post QIP; no pledge",
        },
        {
          metric: "FII",
          original: "10.49% (Mar-24)",
          latest: "5.35% (Mar-26)",
          readThrough: "Material FII exit",
        },
        {
          metric: "DII",
          original: "17.31% (Mar-24)",
          latest: "20.86% (Mar-26)",
          readThrough: "Picked up the FII slack",
        },
        {
          metric: "Public / Retail",
          original: "20.89% (Mar-24)",
          latest: "24.96% (Mar-26)",
          readThrough: "Register tilting domestic",
        },
      ],
      sources: [{ documentId: "doc_demo_04" }],
    },
    {
      id: "sec_industry_regulatory",
      title: "Industry & Regulatory Developments",
      summary:
        "Travel demand normalising; AI disintermediation is the defining structural risk over 3–5 years; data-privacy regulation a watch item.",
      body: "Post-COVID travel growth has moderated, but enterprise hotel IT spend remains a budget priority. The dominant force is generative-AI / agentic travel search, which threatens to disintermediate parts of the metasearch/OTA chain — a risk the memo did not contemplate. RateGain is responding offensively via Adara+Sojern unification (proprietary intent data as the moat). No adverse regulatory change specific to the company has surfaced; cookie deprecation / first-party data rules actually strengthen the data-moat case.",
      bullets: [
        "AI disintermediation a medium-to-high structural risk on a 3–5 year view; management's data-moat response credible but unproven.",
        "Travel-tech demand structurally healthy; organic growth slowed below the memo's 20%+ assumption.",
        "No adverse regulation specific to the company; data-privacy regime is a net positive for owned intent data.",
      ],
      signal: "watch",
      confidence: "medium",
      sources: [{ documentId: "doc_demo_05" }, { documentId: "doc_demo_06" }],
    },
    {
      id: "sec_corporate_events",
      title: "Corporate Events (Last 12 Months)",
      summary:
        "Three big events: Sojern close (Nov-2025), FY26 results (record revenue, falling PAT), CFO resignation (May-2026).",
      body: "The trailing twelve months were defined by Sojern execution. The deal is strategically bold but the security has materially changed.",
      bullets: [
        "Sojern acquisition closed 6-Nov-2025 — largest-ever deal, funded by debt + QIP; shifts firm net-cash → net-debt [mixed].",
        "FY26 results 21-May-2026 — record revenue +69% YoY, but EBITDA margin 21.6% → 18.5% and PAT -7% [weakens].",
        "CFO Rohan Mittal resigned 8-May-2026 (second CFO exit in ~2 years); Deputy CFO interim [weakens].",
      ],
      signal: "watch",
      confidence: "high",
      confidenceNote:
        "Anchored on BSE filings (CFO change, completion releases) and FY26 results press release.",
      sources: [{ documentId: "doc_demo_03" }, { documentId: "doc_demo_07" }],
    },
    {
      id: "sec_investment_action",
      title: "Updated Investment View",
      summary:
        "MIXED BUT MONITORABLE — hold at current weight; do not add on post-results pop until margin and CFO appointment clarify.",
      body: "Provisional action: HOLD\nClassification: Mixed but monitorable\n\nWhy:\n- Sojern makes RateGain the largest travel-intent-data platform — a credible AI-era moat, but margin and EPS dilution have materially repriced the security.\n- ~100% of shareholder return came from earnings growth; the multiple has de-rated ~13% — re-rating thesis has not played out.\n- Stock still well off the memo's target case, so optionality remains if margins recover and a credible permanent CFO is named.\n\nWhat would change the call:\n- Positive: FY27 EBITDA margin recovery toward 20%+, debt reduction trajectory, credible permanent CFO, quantified Sojern synergies.\n- Negative: Margins stay sub-19%, organic growth slips below low-teens, working-capital deteriorates, governance flags multiply.\n\nTop 3 to monitor:\n- Margin & synergy delivery — does blended EBITDA margin recover toward 20%+?\n- Balance sheet — debt-reduction pace, cash conversion, working-capital normalisation, corporate-guarantee exposure.\n- Governance — permanent CFO appointment, audited FY26 annual-report disclosures (goodwill, RPTs, contingent liabilities), further KMP changes.\n\nNote: Draft for research support — not investment advice; analyst sign-off required.",
      bullets: [
        "Add: EBITDA margin recovering ≥20% with quantified Sojern synergies.",
        "Reduce: margins stay sub-19% or organic growth slips below low-teens.",
        "Watch: permanent CFO appointment and audited FY26 disclosures.",
      ],
      signal: "watch",
      confidence: "medium",
      sources: [],
    },
  ],
  supplementaryPanels: [
    {
      id: "sup_valuation_detail",
      title: "Valuation Detail · Then vs Now",
      summary:
        "De-rating, not re-rating — and it is justified by the change in business quality. ~100% of return from earnings; multiple compressed ~13%.",
      body: "The memo's 40x P/E (base) / 45x (bull) anchored a 20-month +43–61% upside case. Applied to FY26 reported EPS, the original 40x multiple would imply ~INR 1,030 — the actual stock at ~778 is ~24% below that implied value. The de-rating is justified: organic growth slowed below 20%, ROE / ROCE flat, EBITDA margin compressed by mix shift, and the balance sheet went from net-cash to net-debt. Peer multiples are scattered (Sabre ~18x, Amadeus ~22x, IDS Next ~38x); RateGain at ~42x screens rich on snapshot but cheap on ARR-growth differential.",
      bullets: [
        "Original anchor: 40x FY26E EPS = INR 800 base / 45x = ~INR 905 bull.",
        "Implied @ orig 40x on reported FY26 EPS ≈ INR 1,030; actual price ~24% below.",
        "Return attribution: ~100%+ from earnings growth; multiple de-rated ~13%.",
      ],
      signal: "negative",
      confidence: "high",
      bridge: [
        {
          metric: "Original valuation anchor",
          original: "40x (base) / 45x (bull) on FY26E EPS",
          latest: "—",
          readThrough: "Memo basis",
        },
        {
          metric: "Current trading multiple",
          original: "—",
          latest: "~37x on FY26 adjusted EPS",
          readThrough: "Below memo target band",
        },
        {
          metric: "Implied price on ORIGINAL 40x",
          original: "40x (memo basis)",
          latest: "~INR 1,030 on reported FY26 EPS",
          readThrough: "Stock ~24% below implied",
        },
        {
          metric: "Peer P/E gap",
          original: "Memo cohort: travel SaaS",
          latest: "Sabre 18x · Amadeus 22x · IDS Next 38x",
          readThrough: "Premium narrowed",
        },
        {
          metric: "Return attribution",
          original: "Memo expected: multiple expansion",
          latest: "~100% earnings, multiple de-rated 13%",
          readThrough: "Re-rating thesis failed",
        },
      ],
      sources: [{ documentId: "doc_demo_01" }, { documentId: "doc_demo_07" }],
    },
    {
      id: "sup_eps_bridge",
      title: "EPS Credibility Bridge",
      summary:
        "FY26 reported EPS ~16.4 vs memo expectation in the ~19–21 range; deal-related dilution and margin compression are the dominant deltas.",
      body: "The memo bridged FY27 EPS into the high teens, with FY26 anchoring at INR 17.7 (FY25 actual) and rising to ~21 on margin expansion. Reported FY26 EPS landed at INR 16.4 — a ~22% miss vs the memo's implied path. The walk: Sojern revenue contribution helped the top line but the lower margin profile diluted EBITDA by ~3 ppt; acquisition-related deferred consideration, higher D&A and new interest cost pushed PAT down 7%; tax-rate normalised. Adjusted for the Sojern deferred consideration, EPS is ~21.1 — close to the memo's expectation, suggesting the underlying earnings engine is broadly intact but the headline number reflects integration drag.",
      bullets: [
        "Prior EPS path (memo): rising to ~21 on margin expansion.",
        "Reported FY26 EPS: 16.4 (~22% miss vs memo path).",
        "Adjusted EPS (ex-Sojern deferred consideration): ~21.1 — engine intact.",
      ],
      signal: "negative",
      confidence: "high",
      bridge: [
        {
          metric: "Prior EPS estimate (memo)",
          original: "~21 (FY26 implied path)",
          latest: "—",
          readThrough: "Memo anchor",
        },
        {
          metric: "Latest REPORTED EPS",
          original: "—",
          latest: "INR 16.4 (FY26)",
          readThrough: "Headline miss vs memo",
        },
        {
          metric: "Latest adjusted EPS",
          original: "—",
          latest: "INR ~21.1 (ex-Sojern deferred consideration)",
          readThrough: "Underlying engine intact",
        },
        {
          metric: "Delta: margin / mix",
          original: "Memo: margin rising",
          latest: "EBITDA margin 21.6% → 18.5%",
          readThrough: "Sojern mix dilution",
        },
        {
          metric: "Delta: one-offs / interest",
          original: "Memo: net cash",
          latest: "Deal-funded debt + D&A",
          readThrough: "Net-cash → net-debt drag",
        },
      ],
      sources: [{ documentId: "doc_demo_02" }],
    },
    {
      id: "sup_financials_actuals",
      title: "Memo Forecasts vs Reported Financials",
      summary:
        "Revenue beat (inorganic); margins missed; balance sheet flipped net-cash to net-debt; cash conversion to be re-proven post-deal.",
      body: "The memo expected ~INR 1,200 cr organic revenue with margins rising to ~23% by FY26. Actual: revenue INR 1,824 cr (+69% YoY, almost entirely inorganic from Sojern), EBITDA margin 18.5% (vs memo's 23%+), reported PAT INR 194 cr. Organic SaaS (distribution + DaaS) grew only mid-teens, below the memo's 20%+ baseline. On the balance sheet, the company moved from ~+INR 1,000 cr net cash to ~INR 1,346 cr gross debt with a USD 150m corporate guarantee. Working-capital days deteriorated 198 → 227. Cash conversion (historically ~90%) is the single most important post-deal item to re-prove. ~100 words.",
      signal: "negative",
      confidence: "high",
      bridge: [
        {
          metric: "Revenue",
          original: "Memo: ~INR 1,200 cr (organic)",
          latest: "FY26: INR 1,824 cr (~+69%)",
          readThrough: "Beat — almost entirely inorganic",
        },
        {
          metric: "EBITDA margin",
          original: "Memo: rising to ~23%",
          latest: "FY26: 18.5%",
          readThrough: "Memo too optimistic on margin",
        },
        {
          metric: "PAT",
          original: "Memo: rising",
          latest: "FY26: INR 194 cr (-7% YoY)",
          readThrough: "Missed",
        },
        {
          metric: "EPS",
          original: "Memo path: ~21 by FY26",
          latest: "FY26 reported: 16.4 (adj ~21.1)",
          readThrough: "Headline miss, adjusted in line",
        },
        {
          metric: "Net debt / cash",
          original: "Memo: net cash",
          latest: "FY26: ~INR 1,346 cr gross debt",
          readThrough: "Structural change",
        },
        {
          metric: "Working-capital days",
          original: "FY25: 227 days (memo era ~198)",
          latest: "FY26: pending audited annual",
          readThrough: "Watch — Sojern AR profile",
        },
      ],
      bullets: [],
      sources: [{ documentId: "doc_demo_02" }, { documentId: "doc_demo_03" }],
    },
  ],
  isDemo: true,
};
