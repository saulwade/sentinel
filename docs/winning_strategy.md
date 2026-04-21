# Winning Strategy – Sentinel

Target: **1st place ($50k)** with stacked eligibility for **Managed Agents ($5k)**, **Creative Opus ($5k)**, and **Keep Thinking ($5k)**. Solo developer.

---

## Core Thesis

We win by reframing the category. Every other team at this hackathon falls into one of three buckets:
1. Agents that do X (booking, emails, customer support, writing)
2. Observability dashboards for agents (LangSmith / Langfuse / AgentOps clones)
3. Generic guardrails (approval workflows)

Sentinel is none of those. Sentinel is **DevTools for AI agents** — a category judges have not seen because it only becomes possible when a model can simulate counterfactuals and re-run alternate futures. That capability is Opus 4.7.

The framing is memorable ("DevTools" = instant metaphor for any developer) and the demo is visceral. Both matter equally.

---

## Score Math

| Criterion | Weight | Play |
|---|---|---|
| **Impact** | 30% | Named user: *agent developer debugging a production failure*. Named pain: *logs aren't enough*. Market: *every team shipping agents in 2026*. |
| **Demo** | 25% | Three sequential wow beats (Fork reveal, Timeline scrub, Pre-flight grade). One narrative arc. Rehearsed to 2:50. |
| **Opus 4.7 Use** | 25% | Six reasoning tasks, all visible on screen. Purple text trains the eye: "that's the model working." |
| **Depth** | 20% | Event-sourced architecture, real interception middleware, Pre-cog tested, clean README, reproducible install. |

**Scoring target:** 8/10 across all four = 80 total. Beats 10-in-demo-only-5-elsewhere projects. Don't sacrifice depth for polish.

---

## Differentiation vs. Expected Competition

| What other teams likely ship | What Sentinel ships |
|---|---|
| "Chat with X" wrappers | DevTools with time-travel |
| Approval buttons on a log | Counterfactual branches with simulated damage |
| Claude summarizing traces | Six distinct reasoning use cases |
| Static evaluation against test cases | Live interactive debugging + pre-deploy simulation |
| Real-time dashboards | Event-sourced timeline you can scrub |

---

## Prize Stacking

Designed so **one project** is eligible for multiple prize categories:

- **1st/2nd/3rd overall** — score-driven.
- **Best Managed Agents ($5k)** — Red Team is a genuinely long-running investigation task, exactly the shape Managed Agents is built for. Also the Pre-flight event generator.
- **Creative Opus 4.7 Exploration ($5k)** — Time-Travel re-simulation + Fork narration = Opus as a *simulator*, not a generator. That angle surprises.
- **Keep Thinking ($5k)** — the reframing from "approval UI" → "DevTools" is exactly the "didn't stop at the first idea" story this prize describes.

**Realistic outcome range:** $15k–$60k. Even a 4th–6th finish + one extra prize = $5k+.

---

## Solo-Dev Schedule (CDMX time)

See `schedule_mexico.md` for event calendar. This is the build schedule.

### Tue Apr 21 — Day 0 · Kickoff + Skeleton
- 10:00 — Kickoff (attend live)
- 10:30–13:00 — Lock tech stack, clone skeleton, pnpm monorepo
- 13:00–20:00 — End-to-end skeleton: agent running + middleware logging + UI showing stream
- **DoD:** I run `pnpm dev`, agent executes, I see actions in Live View. Even if ugly.

### Wed Apr 22 — Day 1 · Pre-cog + Polish
- 10:00 — Thariq AMA (listen in background while coding)
- 10:30–13:00 — Pre-cog: plan verifier with Opus 4.7, streaming reasoning into UI
- 13:00–17:00 — Seed scenario: inbox with prompt-injection email. Validate end-to-end block.
- 17:00–22:00 — Polish Live View + Action Review panel. shadcn/ui components.
- **DoD:** Scenario A runs end-to-end: agent reads malicious email, Pre-cog catches the chain, UI shows Claude reasoning in purple.

### Thu Apr 23 — Day 2 · Time-Travel + Fork (the crown)
- 09:00 — Managed Agents session (attend — $5k prize depends on this)
- 10:30–14:00 — Event sourcing refactor. Every agent step is an event row.
- 14:00–18:00 — Timeline UI: scrubber, state reconstruction at cursor, edit panel.
- 18:00–22:00 — Replay-from-fork: re-simulate future with edited state. Fork View UI.
- **DoD:** I can scrub to any past event, edit it, replay; I see the alternate branch side-by-side with Claude narration.

### Fri Apr 24 — Day 3 · Pre-flight + Red Team
- 10:00–11:00 — Mike Brown session (optional; background)
- 11:00–15:00 — Pre-flight: Opus generates synthetic events stream, agent runs in accelerated time
- 15:00–19:00 — Red Team as Managed Agent. Attack generation, sandbox replay, bypass detection.
- 19:00–22:00 — Pre-flight + Red Team UI
- **DoD:** Pre-flight produces graded report; Red Team runs in background and surfaces at least one novel bypass.

### Sat Apr 25 — Day 4 · Polish + Freeze
- 10:00–14:00 — Hammer the happy-path demo run 5 times. Fix anything that glitches.
- 14:00–18:00 — README with install, architecture diagram, screenshots, demo recipe, architecture rationale.
- 18:00–20:00 — Final review: test clean clone install on a second machine or fresh volume.
- **20:00 — HARD CODE FREEZE.** After this: docs, video, submission. No more features.

### Sun Apr 26 — Day 5 · Ship Day
- 10:00–13:00 — Record demo video. Multiple takes per segment. Rough edit.
- 13:00–15:00 — Final edit, subtitles, thumbnail.
- 15:00–16:30 — Summary (100–200 words). Final README pass.
- 16:30–17:30 — Submission walkthrough: rubric item by item.
- **18:00 CDMX — SUBMIT.** Two hours before the hard deadline.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Time-Travel re-simulation is non-deterministic (Opus gives different alternate branches on reruns) | High | Use fixed prompt + low temperature + scripted demo seed. Document as "production would use deterministic retry." |
| Managed Agents API has unexpected constraints or quota issues | Medium | Fallback: Red Team as a normal Agent SDK loop. Add README note "designed to run as Managed Agent in production." Still qualifies for prize if clearly architected for it. |
| Pre-flight simulation is slow (Opus world-generation) | Medium | Pre-generate event streams for the demo scenario. Live generation becomes a "run this in the background" button. |
| UI polish lags behind backend on a solo dev | High | Use shadcn/ui defaults religiously. Don't design CSS from scratch. Dark theme only. |
| Scope creep — the urge to add "one more feature" | Very High | Daily DoD. If a feature isn't done by end of day, it's cut from the demo. Full stop. |
| Video production consumes entire Sunday | High | Rough cut Saturday night. Sunday = edit only. Never first-takes on deadline day. |
| Anthropic API credits burn faster than expected | Medium | Dev with Sonnet 4.6 in Claude Code. Opus 4.7 only for product (Pre-cog, Fork, Pre-flight). See `technical_plan.md` § Credits Budget. |

---

## What NOT to Do

- **No framework building.** Use Anthropic's Agent SDK as-is. Do not write yet another agent harness.
- **No policy language design.** YAML is fine for the demo.
- **No auth, no multi-user, no billing.** One run at a time, local state, demo machine.
- **No logo, no marketing site, no domain.** Sentinel is a monospace wordmark on black. That's it.
- **No second scenario.** The corporate-assistant phishing demo is the one scenario. Nail it instead of diluting.
- **No real integrations.** Mock Gmail, mock DB, mock Slack.
- **No tests beyond Pre-cog correctness.** Tests demonstrate engineering craft, but don't over-invest.

---

## Tone of the Demo Video

- Serious, product-like, calm. Not "hackathon demo energy."
- Show the product first. Explain second.
- Open on pain, not features.
- Close with: "Six reasoning tasks, one model — Opus 4.7."
- No "I spent the last week building..." filler. Every second earns its place.

---

## Decision Points Already Made

- **Angle:** DevTools for AI Agents = Pre-cog + Time-Travel + Fork + Pre-flight + Red Team.
- **Stack:** TypeScript end-to-end (Next.js 15 + Hono + SQLite + Drizzle + shadcn/ui).
- **Team:** Solo.
- **Scope:** Six features, one scenario, dark theme only, local-first demo.
- **Licensing:** MIT.

These are locked. Further brainstorming burns time that should go into shipping.
