# Where Veritas gets it wrong

Every system has a question it answers badly. This is ours, worked through
honestly rather than hidden.

## The question

> How much did we pay Selection last quarter?

## What happened

Veritas asked a clarifying question instead of answering, and offered three
readings: SELECTION ELECTRONICS, SELECTION MALIGAI, or all of them treated as
one family. The person asking had a single supplier in mind and found the
question pedantic.

Worse is the near miss beside it. Ask the same question naming
`SELECTION ELECTRONICS` exactly and Veritas answers immediately, with a Stable
verdict, because the exact name matched one canonical counterparty. It never
mentions that five other counterparties in the same ledger share that first word
and that a person saying "Selection" may well have meant the group. The answer
is correct under its stated reading and still misleading in the room.

## Why

The Counterparty Resolver canonicalises a bank narration into a name, and the
family is the first two words of that name. That rule is deterministic and it is
right often enough to be useful, but it carries two assumptions that the data
does not justify.

The first is that a shared first word means a shared owner. In this ledger
SELECTION ELECTRONICS, SELECTION MOBILE and SELECTION MALIGAI genuinely look
like one group. NAVYUG SELECTION shares the word and sits somewhere else in the
name. The resolver cannot tell the difference, because the schema has no vendor
table to check against, and Veritas is built not to guess.

The second is that the clarification threshold is a proxy for how much the
choice matters. Veritas asks only when two or more canonical names match the
token and their recent totals differ by at least fifteen per cent. That is a
reasonable rule and it is still a guess about the person's intent. Below the
threshold it picks the exact match silently, and the interpretation line is the
only signal that a choice was made at all.

## The fix

Two changes, neither of them shipped in this build.

First, the family axis should be reported even when the exact name is
unambiguous. If a counterparty filter matches one canonical name but other
canonical names share its family, the family reading should appear as an
alternative in the Truth Panel with its own variance, so the answer says plainly
that reading it as a group would give a different number. The plumbing already
exists: the axis is computed whenever a counterparty filter is present, and it
is currently only offered when the match is exact and the name is ambiguous.

Second, the clarification threshold should consider the spread of the candidates
rather than the gap between the top two. Three counterparties at similar totals
currently pass the check silently, because the top two are close, even though
the choice between the group and any one member changes the answer a great deal.

Until then the honest summary is this: Veritas will not invent a vendor table,
so on a name that spans several counterparties it either asks or answers under a
reading it states. It will not quietly pick one and present it as the truth.
