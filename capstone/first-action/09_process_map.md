# 09 — Process map

*The steps I actually took from input to output, in order.*
*This is my system design. It is what I build from in October.*

**D** = deterministic — a rule, a lookup, arithmetic
**P** = probabilistic — a judgment call, could go either way
**H** = human — someone had to be in the room, or know something unwritten

---

## Steps I actually took

*(Fill from what happened, NOT from what you plan to build. The rubric scores 0 for a map
of intentions.)*

| # | Step | D/P/H | Minutes | Notes |
|---|---|---|---|---|
| 1 | Pull the WhatsApp messages for the date range | D | | |
| 2 | Pull the supervisor sheet | D | | |
| 3 | Read each message and extract name + hours + job | **P** | | nicknames, half-sentences, voice notes |
| 4 | Match each name to a person on the payroll | **P** | | two Mohammeds, "the tall guy" |
| 5 | Match each entry to a job/site | **P** | | often not stated at all |
| 6 | Compare WhatsApp hours vs sheet hours | D | | |
| 7 | Where they disagree, decide which is right | **H** | | ← *nobody wrote the answer down* |
| 8 | Where hours have no job, assign one | **H** | | |
| 9 | Apply the rate card | D | | |
| 10 | Produce the payslip in standard format | D | | |

*Add, delete and re-time these to match what actually happened.*

---

## Tally

| | Steps | Minutes | % of time |
|---|---|---|---|
| D | | | |
| P | | | |
| H | | | |

---

## What this tells me

**D steps** → automate outright. No model needed, and saying so is a defensible decision.

**P steps** → where a model belongs. Extraction and matching under ambiguity.

**H steps** → where the person is irreplaceable **because the fact is not written anywhere**.
This is the entire basis of the capstone. Count these carefully.

> **The test for every H:** is the deciding fact stored in ANY file, sheet, chat or system
> this company can reach? If yes, it isn't H — it's P, and the model was simply
> under-informed. Be strict here. Marking something H that is really P is how you fool
> yourself into a result.

**H steps that survive that test:** ___ of ___

---

## Where the routing boundary sits

Between step **___** and step **___**.
Everything above it: the model should do alone.
Everything below it: the person must decide.
That boundary is what I build in October.
