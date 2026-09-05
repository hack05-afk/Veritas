"use client";

/**
 * The specimen sheet.
 *
 * Every component in every state it can be in, on one rule-separated grid, with
 * the palette and the type scale beside them. This page is how the design
 * system gets reviewed, so it is exhaustive rather than pretty: each specimen
 * is labelled with the state it is showing.
 */

import React from "react";
import {
  AdversarialAudit, BarRow, Button, Card, Chip, CountUp, DataTable, Delta, Drawer,
  Field, Figure, GridBackground, Label, MonthBars, Panel, ProvenanceScope,
  ProvenanceTrail, Rule, ShareBar, Skeleton, Sparkline, StageStrip, Tabs, ThemeToggle,
  TimeScrub, Typewriter, VarianceStrip, VerdictChip, Waveform, WhatIf, formatIndian,
  type Column,
} from "@veritas/ui";

const COLUMNS: Column[] = [
  { key: "counterparty", label: "Counterparty" },
  { key: "account", label: "Account", masked: true },
  { key: "amount", label: "Amount", numeric: true },
];

const ROWS = [
  { counterparty: "SELECTION ELECTRONICS", account: "••••9069", amount: 1240000 },
  { counterparty: "RELIANCEDIGITAL RETAIL", account: "••••2244", amount: 388500 },
  { counterparty: "PARESH VIKRANT GHASE", account: "••••1284", amount: 245000 },
];

/* Drawn from fixtures/package/spend_last_month.json so the specimens on this
   page are the same numbers the workspace renders for that question. */
const PRIMARY = 1240000;
const ALTERNATIVES = [
  { axis: "spend", reading: "net", value: 1148800, variance_pct: 7.35 },
  { axis: "charges", reading: "exclude", value: 1187500, variance_pct: 4.23 },
  { axis: "period", reading: "trailing", value: 1305200, variance_pct: 5.26 },
];
const BREAKDOWN = [
  { key: "NEFT", value: 520000, count: 412 },
  { key: "IMPS", value: 310500, count: 968 },
  { key: "UPI", value: 188300, count: 1204 },
  { key: "FT", value: 168700, count: 391 },
  { key: "Charges", value: 52500, count: 145 },
];
const ALLOWED = [PRIMARY, ...ALTERNATIVES.map((a) => a.value), ...BREAKDOWN.map((b) => b.value)];
const MONTHS = [
  { key: "2026-01", label: "Jan", value: 980000 },
  { key: "2026-02", label: "Feb", value: 1105000 },
  { key: "2026-03", label: "Mar", value: 1042000 },
  { key: "2026-04", label: "Apr", value: 1310000 },
  { key: "2026-05", label: "May", value: 1188000 },
  { key: "2026-06", label: "Jun", value: 1240000 },
];

const PROVENANCE = {
  template: "spend_total",
  rowCount: 3120,
  period: "June 2026",
  sql: "SELECT sum(transaction_amount)\n  FROM transactions\n WHERE entity_id = ?\n   AND booking_date >= ? AND booking_date < ?\n   AND direction = 'debit'",
  readings: ALTERNATIVES.map((a) => ({ label: a.reading, value: a.value })),
};

const INK = [
  ["--paper", "Paper, the page ground"],
  ["--surface", "Surface, a panel"],
  ["--surface-sunken", "Sunken, a table head"],
  ["--ink", "Ink, the number"],
  ["--ink-2", "Ink 2, body copy"],
  ["--ink-3", "Ink 3, read second"],
  ["--ink-4", "Ink 4, disabled"],
  ["--rule", "Rule, the separator"],
  ["--rule-strong", "Rule strong, an edge"],
  ["--rule-faint", "Rule faint, inside a list"],
  ["--accent", "Accent, live state and focus"],
  ["--accent-soft", "Accent soft, a lit figure"],
  ["--stable", "Stable"],
  ["--sensitive", "Sensitive"],
  ["--fragile", "Fragile"],
  ["--viz-1", "Viz 1, the primary series"],
  ["--viz-2", "Viz 2, the comparison"],
  ["--viz-3", "Viz 3"],
  ["--viz-4", "Viz 4"],
];

const TYPE = [
  ["--text-answer", "text-answer", "12,40,000.00", true],
  ["--text-display", "text-display", "Ask your ledger", false],
  ["--text-2xl", "text-2xl", "Page heading", false],
  ["--text-xl", "text-xl", "Section heading", false],
  ["--text-lg", "text-lg", "Panel title", false],
  ["--text-md", "text-md", "Lead paragraph", false],
  ["--text-base", "text-base", "Body copy, fourteen pixels", false],
  ["--text-sm", "text-sm", "Table body and secondary copy", false],
  ["--text-xs", "text-xs", "Captions and units", false],
  ["--text-2xs", "text-2xs", "Table meta and stage labels", false],
] as const;

/** The section titles, in the order they appear, so the rail and the sheet agree. */
const SECTIONS = [
  "Palette", "Type scale", "Button", "Chip", "Label, Field, Rule", "Card and Panel",
  "VerdictChip", "StageStrip", "Tabs", "DataTable", "Drawer", "Skeleton",
  "Sparkline and Delta", "BarRow", "ShareBar", "MonthBars", "VarianceStrip",
  "Figure and ProvenanceTrail", "WhatIf", "AdversarialAudit", "TimeScrub",
  "Waveform", "Typewriter and CountUp", "GridBackground",
];

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function Section({ title, note, children }: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={slug(title)} className="grid gap-4 border-t border-rule py-6 md:grid-cols-[160px_minmax(0,1fr)]">
      <div className="min-w-0">
        <h2 className="label">{title}</h2>
        {note ? <p className="mt-1 text-2xs text-ink-4">{note}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A labelled specimen, so a reviewer knows which state they are looking at. */
function Spec({ state, children, wide = false }: {
  state: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0 flex-1 basis-full" : "min-w-0"}>
      <span className="mb-1.5 block text-2xs text-ink-4">{state}</span>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-x-6 gap-y-5">{children}</div>;
}

export default function Kit() {
  const [drawer, setDrawer] = React.useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-rule bg-paper px-5">
        <span className="text-sm font-semibold tracking-tight">Veritas specimen sheet</span>
        <div className="flex items-center gap-3 text-xs">
          <a href="/" className="text-ink-3 hover:text-ink">Landing</a>
          <a href="/workspace" className="text-ink-3 hover:text-ink">Workspace</a>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-8 px-5">
        <nav aria-label="Specimens" className="sticky top-12 hidden h-[calc(100vh-3rem)] w-44 shrink-0 overflow-y-auto border-r border-rule py-6 pr-4 lg:block">
          <span className="label">Contents</span>
          <ul className="mt-2">
            {SECTIONS.map((section) => (
              <li key={section}>
                <a href={`#${slug(section)}`}
                  className="block truncate border-b border-rule-faint py-1.5 text-xs text-ink-3 hover:text-ink">
                  {section}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 pb-16">
      <p className="max-w-2xl py-6 text-sm text-ink-2">
        Every component in every state, the palette it draws from, and the type scale it sets
        on. Switch the theme in the corner: nothing on this page hardcodes a colour, so both
        modes are the same sheet.
      </p>

      <Section title="Palette" note="four ink steps, three rules, one accent, three verdicts">
        <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {INK.map(([token, meaning]) => (
            <li key={token} className="flex items-center gap-2.5 border-b border-rule-faint py-1.5">
              <span
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rounded-sm border border-rule"
                style={{ background: `hsl(var(${token}))` }}
              />
              <span className="min-w-0">
                <span data-mono className="block truncate text-2xs text-ink">{token}</span>
                <span className="block truncate text-2xs text-ink-3">{meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type scale" note="14px base, two large sizes, both numbers">
        <ul>
          {TYPE.map(([token, name, sample, numeric]) => (
            <li key={token} className="flex items-baseline gap-4 border-b border-rule-faint py-2">
              <span data-mono className="w-32 shrink-0 text-2xs text-ink-3">{name}</span>
              <span
                {...(numeric ? { "data-numeric": "" } : {})}
                className="min-w-0 truncate text-ink"
                style={{ fontSize: `var(${token})` }}
              >
                {sample}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Button" note="four variants at the size a page action uses">
        <Row>
          <Spec state="primary"><Button variant="primary" size="lg">Ask</Button></Spec>
          <Spec state="secondary"><Button variant="secondary" size="lg">Call Veritas</Button></Spec>
          <Spec state="ghost"><Button variant="ghost" size="lg">Export CSV</Button></Spec>
          <Spec state="accent"><Button variant="accent" size="lg">Open workspace</Button></Spec>
          <Spec state="disabled"><Button variant="primary" size="lg" disabled>Disabled</Button></Spec>
        </Row>
        <div className="mt-5">
          <Row>
            <Spec state="medium, inside a panel"><Button size="md">Ask</Button></Spec>
            <Spec state="small, in a header bar"><Button size="sm" variant="secondary">Call</Button></Spec>
          </Row>
        </div>
      </Section>

      <Section title="Chip" note="tone carries meaning, never decoration">
        <Row>
          <Spec state="neutral"><Chip>Neutral</Chip></Spec>
          <Spec state="quiet"><Chip tone="quiet">Quiet</Chip></Spec>
          <Spec state="brand"><Chip tone="brand">Running</Chip></Spec>
          <Spec state="success"><Chip tone="success">Held</Chip></Spec>
          <Spec state="warning"><Chip tone="warning">One reading moved it</Chip></Spec>
          <Spec state="danger"><Chip tone="danger">Ungrounded</Chip></Spec>
        </Row>
      </Section>

      <Section title="Label, Field, Rule" note="the workhorses of a dense layout">
        <div className="max-w-sm">
          <Label>Interpretation</Label>
          <Field label="Period" value="June 2026" />
          <Field label="Rows read" value="3,120" mono />
          <Rule className="my-2" />
          <Field label="Template" value="spend_total" />
        </div>
      </Section>

      <Section title="Card and Panel" note="a card holds, a panel is titled">
        <Row>
          <Spec state="card">
            <Card className="w-56 p-3"><p className="text-sm text-ink-2">A plain card.</p></Card>
          </Spec>
          <Spec state="card inset">
            <Card inset className="w-56 p-3"><p className="text-sm text-ink-2">An inset card.</p></Card>
          </Spec>
          <Spec state="panel with meta and actions" wide>
            <Panel title="The answer" meta="with the readings that would change it"
              actions={<Chip tone="brand">Running</Chip>}
              footer={<span className="text-2xs text-ink-3">Computed in DuckDB</span>}>
              <p className="text-sm text-ink-2">Panel bodies are 16px in from the hairline.</p>
            </Panel>
          </Spec>
        </Row>
      </Section>

      <Section title="VerdictChip" note="the only three colours besides the accent">
        <Row>
          <Spec state="Stable"><VerdictChip status="Stable" /></Spec>
          <Spec state="Sensitive"><VerdictChip status="Sensitive" /></Spec>
          <Spec state="Fragile"><VerdictChip status="Fragile" /></Spec>
          <Spec state="with its note" wide><VerdictChip status="Sensitive" withNote /></Spec>
        </Row>
      </Section>

      <Section title="StageStrip" note="every state, and the marching connector">
        <div className="space-y-6">
          <Spec state="done, active, idle, skipped, error">
            <StageStrip
              states={{ understand: "done", verify: "active", compute: "idle", test: "skipped", answer: "error" }}
              notes={{ test: "one reading", answer: "nothing computed" }} />
          </Spec>
          <Spec state="compact, all finished">
            <StageStrip compact
              states={{ understand: "done", verify: "done", compute: "done", test: "done", answer: "done" }} />
          </Spec>
        </div>
      </Section>

      <Section title="Tabs" note="a view switch over one object">
        <div className="max-w-md">
          <Tabs tabs={[
            { label: "Breakdown", badge: 5, content: <p className="text-sm text-ink-2">Spend split by channel.</p> },
            { label: "Records", badge: 3120, content: <p className="text-sm text-ink-2">The rows behind the number.</p> },
            { label: "Query", content: <p className="text-sm text-ink-2" data-mono>SELECT sum(transaction_amount)</p> },
          ]} />
        </div>
      </Section>

      <Section title="DataTable" note="rules, not stripes; numerals right and monospaced">
        <div className="w-full space-y-5">
          <Spec state="with rows and a caption">
            <DataTable columns={COLUMNS} rows={ROWS} caption="Top counterparties" />
          </Spec>
          <Spec state="empty">
            <DataTable columns={COLUMNS} rows={[]} />
          </Spec>
        </div>
      </Section>

      <Section title="Drawer" note="a right hand inspector, never over the conversation">
        <div className="h-56 w-full max-w-xl overflow-hidden rounded border border-rule">
          <Drawer open title="Evidence" meta="3,120 rows" onClose={() => setDrawer(false)}>
            <p className="text-sm text-ink-2">
              Paginated records, masked. {drawer ? "" : "Closing is handled by the parent."}
            </p>
          </Drawer>
        </div>
      </Section>

      <Section title="Skeleton" note="the shape of what is coming">
        <Row>
          <Spec state="default"><Skeleton /></Spec>
          <Spec state="sized"><Skeleton className="h-8 w-56" /></Spec>
        </Row>
      </Section>

      <Section title="Sparkline and Delta" note="trend and signed change">
        <Row>
          <Spec state="ink"><Sparkline values={MONTHS.map((m) => m.value)} /></Spec>
          <Spec state="accent, last point marked">
            <Sparkline values={MONTHS.map((m) => m.value)} tone="accent" highlight={5} />
          </Spec>
          <Spec state="up"><Delta pct={7.35} /></Spec>
          <Spec state="down"><Delta pct={-4.2} /></Spec>
          <Spec state="flat"><Delta pct={0} /></Spec>
        </Row>
      </Section>

      <Section title="BarRow" note="a ranking, with the figure written as well as drawn">
        <div className="w-full max-w-lg">
          {BREAKDOWN.map((row, index) => (
            <BarRow key={row.key} label={row.key} value={row.value} count={row.count}
              max={BREAKDOWN[0].value} active={index === 0} onClick={() => undefined} />
          ))}
        </div>
      </Section>

      <Section title="ShareBar" note="how one total splits">
        <div className="w-full max-w-lg">
          <ShareBar parts={BREAKDOWN.slice(0, 4).map((row) => ({ label: row.key, value: row.value }))} />
        </div>
      </Section>

      <Section title="MonthBars" note="a window drawn on the ledger">
        <div className="w-full max-w-lg space-y-5">
          <Spec state="all months in the window">
            <MonthBars buckets={MONTHS} />
          </Spec>
          <Spec state="a selection, with a reference line">
            <MonthBars buckets={MONTHS} selected={["2026-04", "2026-05", "2026-06"]} compareValue={1105000} />
          </Spec>
        </div>
      </Section>

      <Section title="VarianceStrip" note="the verdict, drawn as a distance">
        <div className="w-full max-w-lg">
          <VarianceStrip primary={PRIMARY} materialityPct={5}
            readings={ALTERNATIVES.map((a) => ({ label: a.reading, value: a.value, variance_pct: a.variance_pct }))} />
        </div>
      </Section>

      <Section title="Figure and ProvenanceTrail" note="grounded, lit and ungrounded">
        <ProvenanceScope allowed={ALLOWED} provenance={PROVENANCE}>
          <Row>
            <Spec state="grounded">
              <span className="text-xl font-semibold"><Figure value={PRIMARY} id="answer" /></span>
            </Spec>
            <Spec state="grounded, inline">
              <span className="text-sm text-ink-2">
                read as net it is <Figure value={1148800} id="net" />
              </span>
            </Spec>
            <Spec state="not in allowed_numbers">
              <span className="text-sm"><Figure value={999999} id="invented" /></span>
            </Spec>
          </Row>
          <div className="mt-6 max-w-md">
            <span className="mb-1.5 block text-2xs text-ink-4">the trail behind one figure</span>
            <ProvenanceTrail provenance={PROVENANCE} />
          </div>
        </ProvenanceScope>
      </Section>

      <Section title="WhatIf" note="each axis is a real fork, each value was computed">
        <div className="w-full max-w-lg">
          <WhatIf
            primary={PRIMARY}
            materialityPct={5}
            axes={[
              {
                axis: "spend",
                current: "gross",
                options: [{ reading: "net", value: 1148800, variance_pct: 7.35 }],
              },
              {
                axis: "charges",
                current: "include",
                options: [
                  { reading: "exclude", value: 1187500, variance_pct: 4.23 },
                  { reading: "charges only", value: null, variance_pct: null },
                ],
              },
            ]}
          />
        </div>
      </Section>

      <Section title="AdversarialAudit" note="what was tried, including what worked">
        <div className="w-full max-w-lg space-y-6">
          <Spec state="one attempt moved the answer">
            <AdversarialAudit
              strongest={{ label: "net", value: 1148800, variance_pct: 7.35 }}
              attacks={[
                { name: "net", attempt: "Recomputed reading spend as net", finding: "Came back at ₹11,48,800.00", survived: false, movedPct: 7.35 },
                { name: "charges", attempt: "Recomputed excluding bank charges", finding: "Came back at ₹11,87,500.00", survived: true, movedPct: 4.23 },
                { name: "anomaly", attempt: "Swept for counterparties paid above their baseline", finding: "SELECTION MOBILE was paid 3.2 times its average", survived: false },
                { name: "grounding", attempt: "Checked every figure against allowed_numbers", finding: "All 9 figures are in allowed_numbers", survived: true },
              ]}
            />
          </Spec>
          <Spec state="nothing to report">
            <AdversarialAudit
              strongest={null}
              attacks={[
                { name: "single", attempt: "Looked for another reasonable reading", finding: "The question admits only one", survived: true },
                { name: "grounding", attempt: "Checked every figure against allowed_numbers", finding: "All 4 figures are in allowed_numbers", survived: true },
              ]}
            />
          </Spec>
        </div>
      </Section>

      <Section title="TimeScrub" note="narrowing the window re-asks the question">
        <div className="w-full max-w-lg">
          <TimeScrub buckets={MONTHS} window={MONTHS.map((m) => m.key)} comparePrevious={1105000}
            onCommit={() => undefined} />
        </div>
      </Section>

      <Section title="Waveform" note="a live level, drawn as bars">
        <Row>
          <Spec state="quiet"><Waveform amplitude={0.2} /></Spec>
          <Spec state="loud"><Waveform amplitude={0.8} /></Spec>
        </Row>
      </Section>

      <Section title="Typewriter and CountUp" note="both end on a static value">
        <Row>
          <Spec state="typing"><Typewriter text="Computing spend for June" /></Spec>
          <Spec state="counting">
            <span className="text-xl font-semibold"><CountUp value={PRIMARY} /></span>
          </Spec>
          <Spec state="plain, no prefix">
            <span data-numeric className="text-sm text-ink">{formatIndian(3120)}</span>
          </Spec>
        </Row>
      </Section>

      <Section title="GridBackground" note="an engineering grid, not a texture">
        <div className="h-40 w-full border border-rule"><GridBackground /></div>
      </Section>
        </main>
      </div>
    </div>
  );
}
