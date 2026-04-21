# Hackathon Context – Built with Opus 4.7

## TL;DR
One-week virtual hackathon run by Anthropic, 500 participants, teams of up to 2, $100k in API credits across prizes. Goal: build something that pushes Opus 4.7 to its limits, from scratch, open source, in one week.

---

## Objective
Build a project from scratch during the hackathon that demonstrates:
- **Real-world impact** (30% of score)
- **A polished live demo** (25% of score)
- **Creative, surprising use of Opus 4.7** (25% of score)
- **Depth and engineering craft** (20% of score)

---

## Key Rules

- **Open Source only** — backend, frontend, models, everything must ship under an approved OSS license.
- **New work only** — no pre-existing code. Started on or after Apr 21, 12:30 PM EDT.
- **Team size:** maximum 2 people.
- **No restricted content** — no legal/ethical violations, no assets/code without rights.
- **Submission required:**
  - 3-minute demo video (YouTube, Loom, etc.)
  - GitHub repo with code
  - Written summary (100–200 words)

**Deadline:** April 26, 8:00 PM EDT (= April 26, 6:00 PM CDMX)

---

## Judges (who we have to impress)

| Judge | Known for |
|---|---|
| Boris Cherny | Creator of Claude Code — cares about dev UX, tool use, agent ergonomics |
| Cat Wu | Claude product lead — looks for real user value |
| Thariq Shihipar | MTS on Claude Code — deep technical, cares about craft |
| Lydia Hallie | Developer educator — strong demo instincts, visual storytelling |
| Ado Kukic | DevRel — cares about what developers will actually use |
| Jason Bigman | Claude team — product-oriented |

**Implication:** These people have seen every "observability dashboard", every "AI wrapper", every "chatbot for X". Shallow novelty will not pass. Engineering depth + a surprising Opus 4.7 angle will.

---

## Judging Criteria (weights and what they really mean)

### 1. Impact — 30%
"Who benefits, how much does it matter, could this actually be used?"
- Map to a **concrete user or team** with a named pain.
- Avoid generic "enterprises need this" framing.

### 2. Demo — 25%
"Is this a working, impressive demo? Genuinely cool to watch?"
- Must be live-feeling, not stock footage.
- 3 minutes is short — one narrative arc, one "oh shit" moment.

### 3. Opus 4.7 Use — 25%
"How creatively did this team use Opus 4.7? Did they surface capabilities that surprised even us?"
- Basic chat/completion = low score.
- Claude as reasoning, simulation, adversary, verifier, planner, critic = high score.
- Use Opus-specific strengths: long reasoning, extended thinking, tool orchestration.

### 4. Depth & Execution — 20%
"Real craft, not just a quick hack."
- Clean architecture, tests, thoughtful UX, documented.

---

## Problem Statement Alignment

We are targeting **"Build For What's Next"** — an interface/workflow that only makes sense now that agents exist. Sentinel is explicitly a category that did not need to exist five years ago.

(The other track, "Build From What You Know", is for domain-specific tools; not our angle.)

---

## Prizes (stacking strategy)

| Prize | Amount | How we target it |
|---|---|---|
| 1st Place | $50k credits | Overall: impact + demo + Opus use + craft |
| 2nd Place | $30k credits | Strong fallback target |
| 3rd Place | $10k credits | — |
| Most Creative Opus 4.7 Exploration | $5k credits | Our Claude-as-adversary + counterfactual angle |
| The "Keep Thinking" Prize | $5k credits | The reframing from "approval UI" to "pre-cog for agents" |
| Best use of Claude Managed Agents | $5k credits | Delegate long-running forensic analysis to Managed Agents |

**Stacking plan:** A single project can realistically win a podium place AND one of the $5k extras. We are explicitly architecting to be eligible for Managed Agents + Creative Opus, so even a 4th–6th finish can be worth $5–10k.

---

## What wins, condensed

1. One concrete user, one visceral pain.
2. One "oh shit" moment in the demo that plays in under 15 seconds.
3. Opus 4.7 doing something judges have not seen before (reasoning, not text generation).
4. Ship the full loop: live capture → Claude reasoning → human decision → outcome.
5. Open source, documented, with a proper README and a working install.
