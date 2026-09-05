"""Writes docs/sample_qa.md from the last evaluation run."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TITLES = {"A": "Spend", "B": "Counterparties", "C": "Receipts and balance", "D": "Reconciliation",
          "E": "Lookups", "F": "Follow-ups", "G": "Guardrails", "H": "Voice"}


def indian(value: float) -> str:
    """Indian digit grouping: 12,40,000.00 rather than 1,240,000.00."""
    negative = value < 0
    whole, fraction = f"{abs(value):.2f}".split(".")
    last, rest = whole[-3:], whole[:-3]
    if not rest:
        return f"{'-' if negative else ''}{last}.{fraction}"
    groups = []
    while len(rest) > 2:
        groups.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        groups.insert(0, rest)
    return f"{'-' if negative else ''}{','.join(groups)},{last}.{fraction}"


def main() -> None:
    results = json.loads((ROOT / "eval" / "results.json").read_text())
    lines = ["# Sample questions and answers", "",
             "Every answer below came from the evaluation run in `eval/results.json`, over the",
             "synthetic seed 42 ledger. Account numbers and UTRs are masked everywhere.", ""]

    by_category: dict[str, list] = {}
    for item in results["items"]:
        by_category.setdefault(item["category"], []).append(item)

    for category in sorted(by_category):
        lines.append(f"## {category}. {TITLES.get(category, category)}")
        lines.append("")
        for item in by_category[category]:
            lines.append(f"**Question** {item['question']}")
            lines.append("")
            if item.get("answer_value") is not None:
                unit = "" if item.get("answer_unit") == "count" else "Rs "
                amount = indian(float(item["answer_value"])) if unit else f"{int(float(item['answer_value']))}"
                lines.append(f"**Answer** {unit}{amount}")
            else:
                lines.append(f"**Answer** {item.get('got', 'no number') } ")
            lines.append("")
            lines.append(f"**Verdict** {item.get('verdict') or 'Stable'}")
            lines.append("")
            if item.get("interpretation_text"):
                lines.append(f"**Read as** {item['interpretation_text']}")
                lines.append("")
        lines.append("")

    (ROOT / "docs" / "sample_qa.md").write_text("\n".join(lines))
    print(f"wrote docs/sample_qa.md with {len(results['items'])} entries")


if __name__ == "__main__":
    main()
