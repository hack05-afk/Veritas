# The demo

A six beat script that runs the product itself. Nothing on screen is a mock, and
no number is written into the demo: every figure comes from the pipeline, or
from a recorded stream of real query service output.

## The one URL

```
/workspace?demo=1
```

There is also a quiet "Run the demo" link on the landing page, beside Ask and
Call Veritas.

Press Start. Then talk, and advance on your own beat.

## Modes

The bar at the top of the workspace always says which mode you are in.

- **Live** runs each beat through `/api/ask`, the real model and the real query
  service. This is the mode to present in.
- **Replay** plays a recorded stream from `fixtures/events` through
  `/api/replay`. It needs no model and no query service.

`?demo=1` probes `/api/health?deep=1` before the first beat. If the web app or
the query service does not answer, the whole session starts in replay.

To choose for yourself:

```
/workspace?demo=live      always live
/workspace?demo=replay    always replay
```

If the wifi in the room is unknown, open `?demo=replay` before you walk on
stage. It looks identical and cannot fail on a network.

## Keys

A clicker sends arrow keys, so the keys are the real controls.

| Key | What it does |
| --- | --- |
| Right arrow, or space | Next beat |
| Left arrow | Previous beat |
| Escape | Exit the demo |

The buttons on the bar do the same, and add Restart. Auto-advance is off by
default; turn it on and pick an interval only if you want the script to run
itself.

## The beats

**1. What did we spend last month?**
Proves natural language understanding, grounded retrieval and a computed number
with evidence.
Say: "The model wrote a query plan. DuckDB computed the number. The five steps
on the right are what actually happened, not a progress bar."

**2. Compare that with the month before**
Proves multi-turn. No context is repeated in the question.
Say: "It carried the previous plan forward. The period changed and nothing else
did."

**3. Who were our top five counterparties last quarter?**
Proves confidence signalling. The verdict is Sensitive.
Say: "It recomputed the same question under every other reasonable reading. One
of them moves the number, so it says Sensitive before I have to ask."

**4. How much did we pay SELECTION last quarter?**
Proves it asks rather than guesses.
Say: "Several counterparties start with that word and they are of a similar
size, so guessing would give a confidently wrong total. It asks instead."

**5. How much did we spend on the marketing category last month?**
Proves the hallucination guardrail.
Say: "There is no category column in this data. It refuses, and tells you what
it can answer from the columns that do exist."

**6. The evidence and the export**
Re-asks the first question, opens the rows behind the number and exports them.
Say: "Every row behind that figure, with the account number and the UTR masked
to their last four characters, and the same rows as a CSV."

## When a beat falls back

In live mode, a beat that errors or takes more than 25 seconds is replayed from
its fixture instead. When that happens the bar shows an amber chip reading
"replayed from fixture", and it stays there for the rest of the beat. The mode
chip still says Live, because the session is live; the amber chip is the honest
part.

If it fires, say so. "That one came from a recording, the service did not answer
in time." The chip is on screen either way, so claiming otherwise will not hold.

Every beat has a recorded stream, beat 2 included. Its fixture,
`fixtures/events/period_compare.jsonl`, was captured from a real two-turn run
against the query service, so the two period totals and the variance in it are
the ones DuckDB computed rather than figures written by hand.

If a beat ever loses its fixture the bar says "no recorded stream for this beat"
and clears the panels, so an empty beat is never mistaken for an answer.

## Before you present

1. Open `/workspace?demo=1` and press Start. Watch the mode chip settle.
2. If it says Replay and you expected Live, check that the query service is up
   and that `QUERY_SERVICE_URL` points at it.
3. Restart, and leave the page on beat 1 with the demo not yet started.
