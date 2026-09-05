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
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
WEB = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
SCORES = ["intent", "filters", "computation", "grounding", "clarification"]


def ask(question: str, conversation_id: str) -> list[dict]:
    """Stream one question and collect its theatre events."""
    response = requests.post(f"{WEB}/api/ask", json={"conversation_id": conversation_id, "question": question},
                             stream=True, timeout=180)
    response.raise_for_status()
    events = []
    for line in response.iter_lines(decode_unicode=True):
        if line and line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


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


def grounded(package: dict) -> bool:
    """Every digit run in the explanation must be a number the computation produced."""
    allowed = {round(float(value), 2) for value in package.get("allowed_numbers", [])}
    for match in NUMBER.findall(package.get("explanation", "")):
        try:
            value = round(float(match.replace(",", "")), 2)
        except ValueError:
            continue
        if value not in allowed:
            return False
    return True


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

    result["grounding"] = int(grounded(package)) if package else 0
    # Kept so the sample question and answer page can be written from these results.
    result["verdict"] = (package.get("verdict") or {}).get("status")
    result["period_label"] = package.get("period_label")
    result["interpretation_text"] = package.get("interpretation_text")
    result["explanation"] = package.get("explanation")
    result["answer_unit"] = package.get("answer_unit")
    return result


def average(values: list[object]) -> float:
    real = [float(v) for v in values if v is not None]
    return round(sum(real) / len(real), 4) if real else 1.0


def main() -> None:
    parser = argparse.ArgumentParser(description="Score the evaluation set.")
    parser.add_argument("--out", type=Path, default=ROOT / "eval" / "results.json")
    parser.add_argument("--test-set", type=Path, default=ROOT / "eval" / "test_set.json")
    parser.add_argument("--expected", type=Path, default=ROOT / "eval" / "expected.json")
    args = parser.parse_args()

    test_set = json.loads(args.test_set.read_text())
    expected = json.loads(args.expected.read_text()) if args.expected.is_file() else {}

    items = []
    for index, item in enumerate(test_set):
        conversation = f"eval-{item['id']}-{index}"
        if item.get("context"):
            ask(item["context"], conversation)
        events = ask(item["question"], conversation)
        items.append(score(item, expected.get(item["id"]), events))

    by_category: dict[str, dict] = {}
    grouped = defaultdict(list)
    for scored in items:
        grouped[scored["category"]].append(scored)
    for category, rows in sorted(grouped.items()):
        by_category[category] = {key: average([row.get(key) for row in rows]) for key in SCORES}
        by_category[category]["count"] = len(rows)

    results = {
        "overall": {key: average([row.get(key) for row in items]) for key in SCORES},
        "by_category": by_category,
        "items": items,
    }
    args.out.write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results["overall"], indent=2))
    for category, scores in by_category.items():
        print(f"  {category}: computation {scores['computation']} over {scores['count']} questions")


if __name__ == "__main__":
    main()
