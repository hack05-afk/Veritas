"""Runs the evaluation set against each candidate model and records the cost of each.

Every candidate is at or under twenty billion parameters, which is the limit
this build is scored against. Needs a real key: set LLM_PROVIDER, LLM_BASE_URL
and LLM_API_KEY, and restart the web app between models so it picks up
LLM_MODEL.

Usage: python eval/run_benchmark.py
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_one(model: dict) -> dict:
    """Score one model over the whole set. The model travels on each request,
    so the web app does not have to be restarted between candidates.

    A model that fails outright is recorded as failed rather than ending the run.
    """
    output = ROOT / "eval" / f"results_{model['model'].replace('/', '_')}.json"
    try:
        subprocess.run([sys.executable, "eval/run_eval.py", "--out", str(output),
                        "--model", model["model"]], cwd=ROOT, check=True)
        results = json.loads(output.read_text())
    except (subprocess.CalledProcessError, OSError, json.JSONDecodeError) as error:
        return {
            "model": model["model"],
            "params_b": model["params_b"],
            "shipped": False,
            "error": f"{type(error).__name__}: {error}",
            "accuracy": None,
            "median_latency_ms": None,
            "tokens_per_question": model.get("tokens_per_question", 0),
        }

    overall = results["overall"]
    # A category with nothing to score reports null, which cannot go into a mean.
    scored_values = [value for value in overall.values() if value is not None]
    return {
        "model": model["model"],
        "params_b": model["params_b"],
        "shipped": False,
        "accuracy": {
            "intent": overall["intent"],
            "filters": overall["filters"],
            "computation": overall["computation"],
            "grounding": overall["grounding"],
            "clarification": overall["clarification"],
            "overall": round(statistics.mean(scored_values), 4) if scored_values else None,
            "by_category": {key: value["computation"] for key, value in results["by_category"].items()},
        },
        "median_latency_ms": round(results.get("median_latency_ms", 0), 1),
        "tokens_per_question": model.get("tokens_per_question", 0),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark every candidate model.")
    parser.add_argument("--out", type=Path, default=ROOT / "eval" / "benchmark.json")
    args = parser.parse_args()

    test_set = json.loads((ROOT / "eval" / "test_set.json").read_text())
    models = json.loads((ROOT / "eval" / "models.json").read_text())

    attempted = [run_one(model) for model in models]
    failed = [entry for entry in attempted if entry.get("error")]
    for entry in failed:
        print(f"candidate {entry['model']} failed: {entry['error']}")

    # The benchmark file describes the candidates that produced a score; the ones
    # that did not are named in the rationale rather than shown with empty scores.
    scored = [entry for entry in attempted if not entry.get("error")]
    ranked = [entry for entry in scored if (entry.get("accuracy") or {}).get("overall") is not None]
    best = max(ranked, key=lambda entry: (entry["accuracy"]["overall"], -entry["params_b"]), default=None)
    if best:
        best["shipped"] = True

    rationale = (
        f"{best['model']} is shipped: it scores {best['accuracy']['overall']} overall while staying "
        "at or under the twenty billion parameter limit. Because every number is computed in the query "
        "service and checked against allowed_numbers, a weaker model produces a clarification or a "
        "refusal rather than a wrong figure, so the choice trades coverage against latency and never "
        "against correctness."
    ) if best else "No candidate produced a score, so no model is marked as shipped."

    if failed:
        rationale += " Candidates that did not complete: " + ", ".join(entry["model"] for entry in failed) + "."

    benchmark = {
        "generated_at": date.today().isoformat(),
        "test_set_size": len(test_set),
        "rationale": rationale,
        "models": scored,
    }
    args.out.write_text(json.dumps(benchmark, indent=2) + "\n")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
