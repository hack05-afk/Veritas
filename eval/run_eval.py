"""Runs the evaluation set through the product and scores it.

Every question goes through POST /api/ask exactly as a person's would, and the
answer is compared with the value ground_truth.py worked out independently.

Usage: python eval/run_eval.py --out eval/results.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
WEB = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
# The minus sign is part of the number: a balance can be negative, and
# reading one as positive would fail a correctly grounded sentence.
NUMBER = re.compile(r"-?\d[\d,]*(?:\.\d+)?")
SCORES = ["intent", "filters", "computation", "grounding", "clarification"]


MAX_ATTEMPTS = 4


def ask(question: str, conversation_id: str, model: str | None = None) -> tuple[list[dict], float]:
    """Stream one question, collect its events, and time the whole exchange.

    A throttled or briefly failing request is retried with a backoff, because one
    429 in a forty question run should not cost the run.
    """
    body: dict = {"conversation_id": conversation_id, "question": question}
    if model:
        body["model"] = model

    started = time.perf_counter()
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = requests.post(f"{WEB}/api/ask", json=body, stream=True, timeout=180)
            if response.status_code in (408, 429, 500, 502, 503, 504) and attempt < MAX_ATTEMPTS:
                retry_after = response.headers.get("retry-after")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else min(30.0, 2 ** attempt)
                time.sleep(delay)
                continue
            response.raise_for_status()
            events = []
            for line in response.iter_lines(decode_unicode=True):
                if line and line.startswith("data:"):
                    try:
                        events.append(json.loads(line[5:].strip()))
                    except json.JSONDecodeError:
                        # A malformed frame is dropped; the run continues.
                        continue
            return events, (time.perf_counter() - started) * 1000
        except (requests.RequestException, OSError) as error:
            last_error = error
            if attempt == MAX_ATTEMPTS:
                break
            time.sleep(min(30.0, 2 ** attempt))

    raise RuntimeError(f"ask failed after {MAX_ATTEMPTS} attempts: {last_error}")


def last_package(events: list[dict]) -> dict | None:
    for event in reversed(events):
        if event["stage"] == "answer" and event["state"] == "done":
            return event.get("artifact")
    return None


def understood_plan(events: list[dict]) -> dict | None:
    for event in events:
        if event["stage"] == "understand" and event["state"] == "done":
            return event.get("artifact")
    return None


def grounded(package: dict, expected: object) -> int | None:
    """Does the explanation state the value ground_truth.py worked out on its own?

    Checking the explanation against the package's own allowed_numbers would only
    re-run the check the product already enforces, so it is checked against the
    independently recomputed expected value instead. None means the check does
    not apply: there is no expected number to compare with.
    """
    if not isinstance(expected, (int, float)) or isinstance(expected, bool):
        return None

    wanted = round(float(expected), 2)
    explanation = package.get("explanation", "")
    for match in NUMBER.findall(explanation):
        try:
            value = round(float(match.replace(",", "")), 2)
        except ValueError:
            continue
        if abs(value - wanted) < 0.01:
            return 1
    return 0


def score(item: dict, expected: object, events: list[dict]) -> dict:
    """Score one item. A score of None means the check does not apply to it."""
    plan = understood_plan(events) or {}
    package = last_package(events) or {}
    result: dict[str, object] = {"id": item["id"], "category": item["category"], "question": item["question"]}

    behaviour = item.get("expected_behaviour")
    if behaviour:
        got = "refuse" if package.get("refusal") else "clarify" if package.get("clarification") else "answer"
        result.update(intent=int(got == behaviour), filters=None, computation=None,
                      clarification=int(got == behaviour), got=got)
    else:
        result["intent"] = int(plan.get("intent") == item["expected_intent"])
        period = (plan.get("filters") or {}).get("period") or {}
        wanted = (item.get("truth") or {}).get("period")
        result["filters"] = int(not wanted or (period.get("start") == wanted["start"]
                                               and period.get("end") == wanted["end"]))
        answer = package.get("answer_value")
        result["computation"] = int(answer is not None and isinstance(expected, (int, float))
                                    and abs(float(answer) - float(expected)) < 0.01)
        result["clarification"] = int(not package.get("clarification") and not package.get("refusal"))
        result["answer_value"] = answer
        result["expected_value"] = expected

    result["grounding"] = grounded(package, expected) if package else 0
    if not package:
        failure = next((e for e in reversed(events) if e["state"] == "error"), None)
        result["error"] = (failure or {}).get("note", "no answer event")
    # Kept so the sample question and answer page can be written from these results.
    result["verdict"] = (package.get("verdict") or {}).get("status")
    result["period_label"] = package.get("period_label")
    result["interpretation_text"] = package.get("interpretation_text")
    result["explanation"] = package.get("explanation")
    result["answer_unit"] = package.get("answer_unit")
    return result


def average(values: list[object]) -> float | None:
    """The mean of the scores that apply. None when none of them do.

    A category where nothing was scored has no score, and must not be reported as
    a perfect one.
    """
    real = [float(v) for v in values if v is not None]
    return round(sum(real) / len(real), 4) if real else None


def shown(value: object) -> str:
    return "n/a" if value is None else str(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="Score the evaluation set.")
    parser.add_argument("--out", type=Path, default=ROOT / "eval" / "results.json")
    parser.add_argument("--test-set", type=Path, default=ROOT / "eval" / "test_set.json")
    parser.add_argument("--expected", type=Path, default=ROOT / "eval" / "expected.json")
    parser.add_argument("--model", default=None, help="override LLM_MODEL for this run")
    args = parser.parse_args()

    test_set = json.loads(args.test_set.read_text())
    expected = json.loads(args.expected.read_text()) if args.expected.is_file() else {}

    items = []
    for index, item in enumerate(test_set):
        conversation = f"eval-{item['id']}-{index}"
        try:
            if item.get("context"):
                ask(item["context"], conversation, args.model)
            events, elapsed_ms = ask(item["question"], conversation, args.model)
            scored = score(item, expected.get(item["id"]), events)
            scored["latency_ms"] = round(elapsed_ms, 1)
        except Exception as error:  # one bad question must not lose the run
            scored = {"id": item["id"], "category": item["category"], "question": item["question"],
                      "error": f"{type(error).__name__}: {error}", "latency_ms": 0.0}
            scored.update({key: 0 for key in SCORES})
            print(f"  {item['id']}: {scored['error']}")
        items.append(scored)

    by_category: dict[str, dict] = {}
    grouped = defaultdict(list)
    for scored in items:
        grouped[scored["category"]].append(scored)
    for category, rows in sorted(grouped.items()):
        by_category[category] = {key: average([row.get(key) for row in rows]) for key in SCORES}
        by_category[category]["count"] = len(rows)

    latencies = sorted(row["latency_ms"] for row in items)
    results = {
        "overall": {key: average([row.get(key) for row in items]) for key in SCORES},
        "median_latency_ms": latencies[len(latencies) // 2] if latencies else 0,
        "by_category": by_category,
        "items": items,
    }
    args.out.write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps({key: shown(value) for key, value in results["overall"].items()}, indent=2))
    for category, scores in by_category.items():
        print(f"  {category}: computation {shown(scores['computation'])} over {scores['count']} questions")


if __name__ == "__main__":
    main()
