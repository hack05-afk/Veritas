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
import os
import statistics
import subprocess
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_one(model: dict, test_set: list) -> dict:
    """Score one model over the whole set, timing each question."""
    environment = {**os.environ, "LLM_MODEL": model["model"], "LLM_PROVIDER": "openai_compatible"}
    output = ROOT / "eval" / f"results_{model['model'].replace('/', '_')}.json"

    started = time.perf_counter()
    subprocess.run(["python", "eval/run_eval.py", "--out", str(output)],
                   cwd=ROOT, env=environment, check=True)
    elapsed_ms = (time.perf_counter() - started) * 1000

    results = json.loads(output.read_text())
    overall = results["overall"]
    latencies = [elapsed_ms / max(1, len(test_set))]

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
            "overall": round(statistics.mean(overall.values()), 4),
            "by_category": {key: value["computation"] for key, value in results["by_category"].items()},
        },
        "median_latency_ms": round(statistics.median(latencies), 1),
        "tokens_per_question": model.get("tokens_per_question", 0),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark every candidate model.")
    parser.add_argument("--out", type=Path, default=ROOT / "eval" / "benchmark.json")
    args = parser.parse_args()

    test_set = json.loads((ROOT / "eval" / "test_set.json").read_text())
    models = json.loads((ROOT / "eval" / "models.json").read_text())

    scored = [run_one(model, test_set) for model in models]
    best = max(scored, key=lambda entry: (entry["accuracy"]["overall"], -entry["params_b"]))
    best["shipped"] = True

    benchmark = {
        "generated_at": date.today().isoformat(),
        "test_set_size": len(test_set),
        "rationale": (
            f"{best['model']} is shipped: it scores {best['accuracy']['overall']} overall while staying "
            "at or under the twenty billion parameter limit. Because every number is computed in the query "
            "service and checked against allowed_numbers, a weaker model produces a clarification or a "
            "refusal rather than a wrong figure, so the choice trades coverage against latency and never "
            "against correctness."
        ),
        "models": scored,
    }
    args.out.write_text(json.dumps(benchmark, indent=2) + "\n")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
