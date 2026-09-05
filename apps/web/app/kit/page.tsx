"use client";

import React from "react";
import {
  Button, Card, Chip, CountUp, DataTable, Drawer, GridBackground, Skeleton,
  StageStrip, Tabs, Typewriter, VerdictChip, Waveform,
} from "@veritas/ui";

const COLUMNS = [
  { key: "counterparty", label: "Counterparty" },
  { key: "account", label: "Account", masked: true },
  { key: "amount", label: "Amount", numeric: true },
];

const ROWS = [
  { counterparty: "SELECTION ELECTRONICS", account: "••••9069", amount: 1240000 },
  { counterparty: "RELIANCEDIGITAL RETAIL", account: "••••2244", amount: 388500 },
  { counterparty: "PARESH VIKRANT GHASE", account: "••••1284", amount: 245000 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[hsl(var(--border))] py-8">
      <h2 className="mb-4 text-sm font-medium text-[hsl(var(--muted-foreground))]">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

export default function Kit() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Veritas kit</h1>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        Every component in every state it can be in.
      </p>

      <Section title="Button">
        <Button variant="primary">Ask</Button>
        <Button variant="secondary">Call TBX</Button>
        <Button variant="ghost">Export CSV</Button>
        <Button variant="primary" disabled>Disabled</Button>
      </Section>

      <Section title="Chip">
        <Chip>Neutral</Chip>
        <Chip tone="brand">Brand</Chip>
        <Chip tone="success">Success</Chip>
        <Chip tone="warning">Warning</Chip>
        <Chip tone="danger">Danger</Chip>
      </Section>

      <Section title="Card">
        <Card className="w-64"><p className="text-sm">A plain card.</p></Card>
        <Card tilt className="w-64"><p className="text-sm">A card that lifts on hover.</p></Card>
      </Section>

      <Section title="Tabs">
        <div className="w-full max-w-md">
          <Tabs tabs={[
            { label: "Breakdown", content: <p className="text-sm">Spend split by channel.</p> },
            { label: "Records", content: <p className="text-sm">The rows behind the number.</p> },
            { label: "Query", content: <p className="text-sm" data-mono>SELECT sum(transaction_amount)</p> },
          ]} />
        </div>
      </Section>

      <Section title="StageStrip">
        <StageStrip
          states={{ understand: "done", verify: "active", compute: "idle", test: "skipped", answer: "error" }}
          notes={{ test: "one reading", answer: "nothing computed" }} />
      </Section>

      <Section title="DataTable">
        <div className="w-full"><DataTable columns={COLUMNS} rows={ROWS} caption="Top counterparties" /></div>
      </Section>

      <Section title="Drawer">
        <div className="h-64 w-full max-w-xl overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))]">
          <Drawer open title="Evidence">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Paginated records, masked.</p>
          </Drawer>
        </div>
      </Section>

      <Section title="Skeleton">
        <Skeleton />
        <Skeleton className="h-8 w-64" />
      </Section>

      <Section title="VerdictChip">
        <VerdictChip status="Stable" />
        <VerdictChip status="Sensitive" />
        <VerdictChip status="Fragile" />
      </Section>

      <Section title="Waveform">
        <Waveform amplitude={0.2} />
        <Waveform amplitude={0.6} />
      </Section>

      <Section title="Typewriter">
        <Typewriter text="Computing spend for June" />
      </Section>

      <Section title="CountUp">
        <span className="text-2xl"><CountUp value={1240000} /></span>
      </Section>

      <Section title="GridBackground">
        <div className="h-40 w-full"><GridBackground /></div>
      </Section>
    </main>
  );
}
