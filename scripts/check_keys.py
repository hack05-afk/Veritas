#!/usr/bin/env python3
"""Check that the configured providers actually work before a run.

Reads .env, then makes the smallest real call each provider allows: a model
listing and one structured-output completion for the language model, and a
short synthesis for Sarvam. Nothing here writes to the repository and nothing
is cached, so it can be run before every demo.

    python scripts/check_keys.py            # check everything configured
    python scripts/check_keys.py --llm      # language model only
    python scripts/check_keys.py --sarvam   # speech only

Exit code is 0 when every configured provider answered, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIMEOUT = 30

# Groq sits behind Cloudflare, which rejects the default urllib user agent with
# a 403 before the request ever reaches the API. Send an explicit one.
USER_AGENT = "veritas-check-keys/1.0"


def load_env() -> dict[str, str]:
    """Read .env into a dict without overriding anything already exported."""
    values: dict[str, str] = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    values.update({k: v for k, v in os.environ.items() if k in values or k.startswith(("LLM_", "SARVAM_"))})
    return values


def post(url: str, payload: dict, headers: dict) -> tuple[int, dict | str]:
    body = json.dumps(payload).encode("utf-8")
    headers = {"User-Agent": USER_AGENT, **headers}
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(detail)
        except json.JSONDecodeError:
            return error.code, detail
    except Exception as error:  # network, DNS, TLS
        return 0, str(error)


def get(url: str, headers: dict) -> tuple[int, dict | str]:
    headers = {"User-Agent": USER_AGENT, **headers}
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(detail)
        except json.JSONDecodeError:
            return error.code, detail
    except Exception as error:
        return 0, str(error)


def say(ok: bool, message: str) -> None:
    print(f"[{'ok  ' if ok else 'FAIL'}] {message}")


def check_llm(env: dict[str, str]) -> bool:
    provider = env.get("LLM_PROVIDER", "fake")
    if provider == "fake":
        say(True, "LLM_PROVIDER is fake; no key needed and no network call made.")
        return True

    base = (env.get("LLM_BASE_URL") or "").rstrip("/")
    model = env.get("LLM_MODEL") or ""
    key = env.get("LLM_API_KEY") or ""
    if not (base and model and key):
        say(False, "LLM_BASE_URL, LLM_MODEL and LLM_API_KEY must all be set when LLM_PROVIDER is not fake.")
        return False

    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    ok = True

    status, listing = get(f"{base}/models", headers)
    if status != 200:
        say(False, f"{base}/models returned {status or 'no response'}: {str(listing)[:200]}")
        return False
    ids = [entry.get("id") for entry in listing.get("data", [])] if isinstance(listing, dict) else []
    say(True, f"key accepted; {len(ids)} models visible")
    if model in ids:
        say(True, f"LLM_MODEL {model} is served")
    else:
        say(False, f"LLM_MODEL {model} is NOT in the served list. Close matches: "
                   + ", ".join(sorted(i for i in ids if i and model.split('/')[-1][:4] in i)[:5] or ["none"]))
        ok = False

    # The extraction call is the one that matters: it must return JSON that
    # matches a schema, at temperature 0, within the token budget.
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "intent": {"type": "string"},
            "transaction_type": {"type": ["string", "null"]},
        },
        "required": ["intent", "transaction_type"],
    }
    status, answer = post(
        f"{base}/chat/completions",
        {
            "model": model,
            "temperature": 0,
            "max_completion_tokens": int(env.get("LLM_MAX_COMPLETION_TOKENS", "1024")),
            "messages": [
                {"role": "system", "content": "Return only JSON matching the schema."},
                {"role": "user", "content": "What did we spend last month?"},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "probe", "schema": schema, "strict": True},
            },
        },
        headers,
    )
    if status == 200:
        try:
            content = answer["choices"][0]["message"]["content"]
            json.loads(content)
            say(True, "structured output works with strict json_schema")
        except Exception as error:
            say(False, f"structured output returned unparseable content: {error}")
            ok = False
    else:
        say(False, f"strict json_schema rejected with {status}: {str(answer)[:300]}")
        say(False, "the app falls back to json_object here, but verify that path before the demo")
        ok = False

    return ok


def check_sarvam(env: dict[str, str]) -> bool:
    provider = env.get("SARVAM_PROVIDER", "fake")
    if provider == "fake":
        say(True, "SARVAM_PROVIDER is fake; fixture clips are used and no key is needed.")
        return True

    key = env.get("SARVAM_API_KEY") or ""
    if not key:
        say(False, "SARVAM_API_KEY is empty but SARVAM_PROVIDER is not fake.")
        return False

    headers = {"api-subscription-key": key, "Content-Type": "application/json"}
    status, answer = post(
        "https://api.sarvam.ai/text-to-speech",
        {"text": "Checking the connection.", "target_language_code": "en-IN"},
        headers,
    )
    if status == 200:
        say(True, "Sarvam key accepted and text to speech answered")
        return True
    say(False, f"Sarvam text to speech returned {status or 'no response'}: {str(answer)[:200]}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--llm", action="store_true", help="check the language model only")
    parser.add_argument("--sarvam", action="store_true", help="check speech only")
    args = parser.parse_args()

    env = load_env()
    both = not (args.llm or args.sarvam)
    results = []
    if both or args.llm:
        print("Language model")
        results.append(check_llm(env))
        print()
    if both or args.sarvam:
        print("Speech")
        results.append(check_sarvam(env))
        print()

    if all(results):
        print("Every configured provider answered.")
        return 0
    print("At least one provider did not answer. Fix the lines marked FAIL before running the demo.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
