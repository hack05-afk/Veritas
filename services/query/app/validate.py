"""Plan validation against the frozen contract."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

CONTRACTS = Path(__file__).resolve().parents[3] / "contracts"


@lru_cache(maxsize=8)
def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(json.loads((CONTRACTS / name).read_text()),
                                format_checker=FormatChecker())


def plan_errors(plan: object) -> list[str]:
    """Every reason this body is not a computable QueryPlan. Empty means it is one."""
    if not isinstance(plan, dict):
        return ["plan must be an object"]
    errors = [e.message for e in _validator("query_plan.schema.json").iter_errors(plan)]
    if errors:
        return errors[:5]
    if "intent" not in plan:
        return ["this plan is a clarification or a refusal, so there is nothing to compute"]
    return []
