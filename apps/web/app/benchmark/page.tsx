/**
 * Model efficiency receipts.
 *
 * Which small model was shipped, what it scored, and what the alternatives
 * scored beside it.
 */
import fs from "fs";
import path from "path";

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

const REPO_ROOT = path.resolve(process.cwd(), process.cwd().endsWith("apps/web") ? "../.." : ".");

function read(): Benchmark {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "eval/benchmark.json"), "utf8"));
}

const CATEGORIES = ["intent", "filters", "computation", "grounding", "clarification", "overall"] as const;

export default function BenchmarkPage() {
  const benchmark = read();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Model choice</h1>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        {benchmark.test_set_size} questions, run against every candidate model on {benchmark.generated_at}.
        Every model is at or under twenty billion parameters.
      </p>

      <div className="mt-8 overflow-x-auto rounded-[var(--radius)] border border-[hsl(var(--border))]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] text-left">
              <th scope="col" className="px-4 py-2 font-medium">Model</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Parameters, billions</th>
              {CATEGORIES.map((category) => (
                <th key={category} scope="col" className="px-4 py-2 text-right font-medium capitalize">{category}</th>
              ))}
              <th scope="col" className="px-4 py-2 text-right font-medium">Median latency</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {benchmark.models.map((model) => (
              <tr key={model.model} data-model-row data-shipped={model.shipped ? "true" : "false"}
                className={`border-b border-[hsl(var(--border))] last:border-0 ${
                  model.shipped ? "bg-[hsl(var(--brand-soft))]" : ""}`}>
                <td className="px-4 py-2">
                  {model.model}
                  {model.shipped ? <span className="ml-2 text-xs text-[hsl(var(--brand-text))]">shipped</span> : null}
                </td>
                <td className="px-4 py-2 text-right" data-numeric><span data-params>{model.params_b}</span></td>
                {CATEGORIES.map((category) => (
                  <td key={category} className="px-4 py-2 text-right" data-numeric>
                    {Math.round(Number(model.accuracy[category]) * 100)}%
                  </td>
                ))}
                <td className="px-4 py-2 text-right" data-numeric>{model.median_latency_ms} ms</td>
                <td className="px-4 py-2 text-right" data-numeric>{model.tokens_per_question}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-sm font-medium">Why this model</h2>
      <p data-rationale className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        {benchmark.rationale}
      </p>
    </main>
  );
}
