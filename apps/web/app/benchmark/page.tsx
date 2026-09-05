/**
 * Model efficiency receipts.
 *
 * Which small model was shipped, what it scored, and what the alternatives
 * scored beside it. The bar next to each overall score is there so the gap
 * between candidates is read as a distance rather than as two numbers.
 */
import fs from "fs";

import { requireRepoFile } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface Model {
  model: string;
  params_b: number;
  shipped: boolean;
  accuracy: Record<string, number | Record<string, number>>;
  median_latency_ms: number;
  tokens_per_question: number;
}

interface Benchmark {
  generated_at: string;
  test_set_size: number;
  rationale: string;
  models: Model[];
}

function read(): Benchmark {
  return JSON.parse(fs.readFileSync(requireRepoFile("eval/benchmark.json"), "utf8"));
}

const CATEGORIES = ["intent", "filters", "computation", "grounding", "clarification", "overall"] as const;

function percent(value: number | Record<string, number> | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}

export default function BenchmarkPage() {
  const benchmark = read();
  const best = Math.max(...benchmark.models.map((model) => percent(model.accuracy.overall)), 1);

  return (
    <div className="min-h-screen">
      <header className="flex h-12 items-center justify-between gap-4 border-b border-rule px-5">
        <span className="text-sm font-semibold tracking-tight">Veritas</span>
        <nav className="flex items-center gap-3 text-xs">
          <a href="/" className="text-ink-3 hover:text-ink">Landing</a>
          <a href="/workspace" className="text-ink-3 hover:text-ink">Workspace</a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-16">
        <section className="border-b border-rule py-8">
          <span className="label">Model receipts</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Which model was shipped, and why</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            <span data-numeric>{benchmark.test_set_size}</span> questions, run against every
            candidate on {benchmark.generated_at}. Every candidate is at or under twenty billion
            parameters, because the plan is small work and the arithmetic happens elsewhere.
          </p>
        </section>

        <section className="border-b border-rule py-6">
          <span className="label">Overall accuracy</span>
          <ul className="mt-3">
            {benchmark.models.map((model) => {
              const score = percent(model.accuracy.overall);
              return (
                <li
                  key={model.model}
                  className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_4rem] items-center gap-3 border-b border-rule-faint py-2 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-sm text-ink" title={model.model}>
                    {model.model}
                  </span>
                  <span className="h-1.5 w-full rounded-full bg-rule-faint">
                    <span
                      className="block h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(1, (score / best) * 100)}%`,
                        background: model.shipped ? "hsl(var(--viz-2))" : "hsl(var(--viz-3))",
                      }}
                    />
                  </span>
                  <span data-numeric className="text-right text-sm text-ink">{score}%</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="py-6">
          <span className="label">Every score</span>
          <div className="mt-3 overflow-x-auto rounded-sm border border-rule">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-sunken">
                  <th scope="col" className="border-b border-rule px-3 py-2 text-left text-2xs font-semibold uppercase tracking-label text-ink-3">
                    Model
                  </th>
                  <th scope="col" className="border-b border-rule px-3 py-2 text-right text-2xs font-semibold uppercase tracking-label text-ink-3">
                    Params, b
                  </th>
                  {CATEGORIES.map((category) => (
                    <th
                      key={category}
                      scope="col"
                      className="border-b border-rule px-3 py-2 text-right text-2xs font-semibold uppercase tracking-label text-ink-3"
                    >
                      {category}
                    </th>
                  ))}
                  <th scope="col" className="border-b border-rule px-3 py-2 text-right text-2xs font-semibold uppercase tracking-label text-ink-3">
                    Latency
                  </th>
                  <th scope="col" className="border-b border-rule px-3 py-2 text-right text-2xs font-semibold uppercase tracking-label text-ink-3">
                    Tokens
                  </th>
                </tr>
              </thead>
              <tbody>
                {benchmark.models.map((model) => (
                  <tr
                    key={model.model}
                    data-model-row
                    data-shipped={model.shipped ? "true" : "false"}
                    className={`border-b border-rule-faint last:border-0 ${
                      model.shipped ? "bg-accent-soft" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      <span className="text-ink">{model.model}</span>
                      {model.shipped ? (
                        <span className="ml-2 text-2xs uppercase tracking-label text-accent">shipped</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-right" data-numeric>
                      <span data-params>{model.params_b}</span>
                    </td>
                    {CATEGORIES.map((category) => (
                      <td key={category} className="px-3 py-1.5 text-right" data-numeric>
                        {percent(model.accuracy[category])}%
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right" data-numeric>{model.median_latency_ms} ms</td>
                    <td className="px-3 py-1.5 text-right" data-numeric>{model.tokens_per_question}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-rule py-6">
          <span className="label">Why this model</span>
          <p data-rationale className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            {benchmark.rationale}
          </p>
        </section>
      </main>
    </div>
  );
}
