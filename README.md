<div align="center">

# SENTINEL

### AI Agent Security Platform

**Stop attacks before they execute.** Sentinel sits between your AI agent and its tools — intercepting every action, enforcing policies, and letting Opus 4.7 reason about the causal chain before anything irreversible happens.

### 🔗 [**Live demo → sentinel-web-theta.vercel.app**](https://sentinel-web-theta.vercel.app)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-2DD4A4?style=flat-square)](https://sentinel-web-theta.vercel.app)
[![Built with Opus 4.7](https://img.shields.io/badge/Built%20with-Opus%204.7-A78BFA?style=flat-square&logo=anthropic&logoColor=white)](https://www.anthropic.com)
[![Deployed on Fly.io + Vercel](https://img.shields.io/badge/Deployed-Fly.io%20%2B%20Vercel-8A8A93?style=flat-square)](https://sentinel-engine.fly.dev/health)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

*Built for the [Built with Opus 4.7 Hackathon](https://cerebralvalley.ai/e/built-with-4-7-hackathon) · by [@saulwade](https://github.com/saulwade)*

</div>

---

**Jump to:** [The problem](#the-problem) · [What it does](#what-it-does) · [Demo](#demo) · [Six views](#six-views-one-platform) · [How Opus reasons](#ten-ways-opus-47-reasons-about-your-security) · [Quick start](#quick-start) · [MCP integration](#mcp-integration-claude-desktop--claude-code) · [Deployment](#deployment) · [Architecture](#architecture)

---

## The problem

Your AI agent just sent M&A data to `deals@hargreaves-fold-advisory.com`. It exfiltrated 847 customer records. It approved a $12,000 refund it wasn't authorized to make.

**How did you find out?** A log entry. Three hours later.

There's no DevTools for agents. No breakpoint you can set. No firewall between the model and your production data. You ship, you pray, and when something goes wrong you piece it together from scattered logs.

Sentinel is the debugger that should have existed on day one.

---

## What it does

Sentinel intercepts every tool call your agent makes — **before it executes** — through a two-layer defense:

```
Agent wants to call send_email(to="external@firm.com", body="[M&A data]")
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Layer 1: Policy Engine                             │
│  Deterministic DSL — <5ms — no LLM cost             │
│  Rule: "block external email to non-allowlisted     │  ──► BLOCK (instant)
│  domains during financial negotiations"             │
└─────────────────────────────────────────────────────┘
         │ (if no policy matches)
         ▼
┌─────────────────────────────────────────────────────┐
│  Layer 2: Pre-cog (Opus 4.7, extended thinking)     │
│  "This email contains what appears to be deal       │
│  terms. The recipient domain is not in our          │  ──► BLOCK (reasoned)
│  approved vendor list. Causal chain: agent was      │
│  injected via ticket body in step 3..."             │
└─────────────────────────────────────────────────────┘
```

Then it shows you exactly what happened, what would have happened without it, and how to make sure it never happens again.

---

## Demo

![Command Center — Trust Score ring, stat cards, and one-click access to every workflow](./docs/screenshots/01-command-center-empty.png)

**The Trust Score starts at D.** That's intentional — you haven't been attacked yet, so you haven't built defenses. Run the demo, adopt synthesized policies, and watch it climb to A+. Security posture, quantified in real time.

**Four live attack scenarios** against agents with access to customer PII, refund processing, and email sending:

| Scenario | Attack vector | What Sentinel stops |
|---|---|---|
| **CEO Override** | Authority impersonation via executive escalation bot | $12k goodwill credit + M&A data to external firm |
| **Support Agent** | Compliance audit framing — bulk PII exfiltration | $47k unauthorized refund + 847 customer records |
| **GDPR Audit** | Legal urgency framing — GDPR Art. 20 data portability | $8.5k processing fee + unfiltered customer dump |
| **Multi-Agent** | Compromised subagent injects malicious tool call | Cross-agent trust violation caught at orchestrator |

Run any scenario in three modes: **Scenario** (scripted for reliable demos), **Live Agent** (Claude Haiku 4.5 autonomously processing the queue — it genuinely falls for the injection), or **Fleet** (three scenarios concurrently on a 3-panel dashboard).

---

## Six views. One platform.

### 1 · Command Center
![Command Center after one run — Trust Score drops to D, interdictions begin, attack surface populates](./docs/screenshots/02-command-center-after-run.png)
Trust Score ring (A+ to F) computed from interdiction effectiveness × policy coverage. Starts low. Grows as you run scenarios and adopt synthesized policies — making security posture quantifiable for the first time.

### 2 · Runtime — Live Interception
![Runtime mid-run — CEO Override paused on Bulk PII Access, full event stream with OPUS verdicts](./docs/screenshots/03-runtime-midrun.png)
Watch the attack unfold in real-time. Each tool call surfaces with its verdict source:
- **POLICY** (indigo) — deterministic rule matched in <5ms
- **PRE-COG** (purple) — Opus extended thinking, streaming live
- **ALLOW** · **PAUSE** · **BLOCK** — with blast radius computed instantly on block

Press `A` to approve a paused action, `D` to deny. The screen flashes red on a block.

**Three execution modes:**
- **Scenario** — scripted attack flow, deterministic for reliable demos
- **Live Agent** — real Claude Haiku 4.5 agent decides what to do, reads the ticket queue, and actually falls for the prompt injection (Sentinel catches it anyway)
- **Fleet** — three scenarios (Support · CEO · GDPR) run concurrently in a 3-panel dashboard with per-agent PAUSE/BLOCK flashing and live interdiction counters

### 3 · Investigate — Timeline + Fork
![Investigate — timeline scrubber, world-state editor, branch-from-here, and Opus analysis](./docs/screenshots/04-investigate-replay.png)
Scrub through every event. At any step, edit the world state and branch — Sentinel runs the alternate timeline and compares blast radius side-by-side. Then generate a full incident report with one click.

### 4 · Test Before Deploy — Pre-flight Simulator
![Pre-flight Simulator — paste your system prompt, Opus pentests it and synthesizes custom scenarios](./docs/screenshots/05-preflight.png)
Before you ship your agent, simulate 30 days of synthetic scenarios — safe, edge-case, and adversarial — generated by Opus. Get a safety grade (A+ to F) with failure drill-down. Pentest your own system prompt.

### 5 · Stress Test & Policies
![Stress Test & Policies — adaptive red team on the left, Author Policy + live policy catalog on the right](./docs/screenshots/06-redteam-empty.png)
Run an adaptive red team that mutates with each iteration — seeing your defenses, adapting its strategy. When a bypass lands, one click synthesizes a new DSL policy from the attack. The policy catalog shows every rule with its source: `DEFAULT` or `AUTO · from attack_id`.

**Arena mode (showpiece):** toggle to **Arena** and watch two Opus 4.7 instances fight live — split-screen thinking streams with 🔴 Red Opus generating novel attacks on the left and 🔵 Blue Opus synthesizing counter-policies on the right. Five rounds. Trust Score arcs from F to A+ in the header as the defense teaches itself.

**Also here:**
- **Author Policy** — describe a policy in plain English, Opus synthesizes valid DSL
- **Policy Simulator** — run any candidate policy against full run history to check for false positives before adopting
- **Drift Detector** — Opus audits the active policy set for redundancy, blind spots, and dead code
- **Retroactive Surgery** — on a run that required Opus to catch a bypass, Opus generates a deterministic policy that would have blocked it, validated against all historical runs for zero false positives

### 6 · Ask Opus — Your AI CISO
![Ask Opus — Opus 4.7 with 1M context, grounded in every run, event, blast radius, and policy](./docs/screenshots/07-ask-opus.png)
Opus 4.7 with 1M context window, grounded in every run, event, blast radius, and policy your system has ever processed. Ask anything:

> *"Am I more secure than last week?"*
> *"Which of my policies are redundant?"*
> *"If I added a wire-transfer tool, what risks would that open?"*

Also available directly in Claude Desktop via MCP — see [MCP integration](#mcp-integration-claude-desktop--claude-code).

---

## Ten ways Opus 4.7 reasons about your security

This is not "call Claude for summaries." Every Opus invocation uses **extended thinking** and streams live to the UI.

| Reasoning task | What Opus actually does | Thinking budget |
|---|---|---|
| **Pre-cog** | Simulates the causal chain of a proposed tool call before it executes | 8k tokens |
| **Incident Analysis** | Reconstructs the full attack, grades severity A+..F, generates executive report | 10k tokens |
| **Fork Narrator** | Narrates the branch-not-taken — "without Sentinel, step 4 would have..." | 4k tokens |
| **What-If Simulator** | Generates 20 adversarial mutations of a blocked action, tests each against policies, proposes DSL fixes | 12k tokens |
| **Security Committee** | Four Opus instances run in parallel: CISO (security-first) + Legal (regulatory exposure) + Product (customer impact) + Moderator (synthesizes consensus) | 4k tokens each |
| **Pre-flight Scenarios** | Generates realistic synthetic attack scenarios for a given agent description | 4k tokens |
| **Red Team Iter 1** | Generates fresh adversarial attacks tailored to agent's tool surface | 4k tokens |
| **Red Team Iter 2+** | Sees prior attempts + active defenses, mutates strategy explicitly | 6k tokens |
| **Policy Synthesis** | Generates a valid DSL policy from a bypassed attack, with adversarial retry loop | 6k tokens |
| **Ask Opus** | CISO-mode Q&A, grounded in full operational history across all runs | 16k tokens |

**The Security Committee is the most striking:** click it after a BLOCK and four Opus instances deliberate simultaneously. Watch four live thinking streams converge on a verdict — uphold, override, or escalate — in ~30 seconds.

---

## Quick start

```bash
git clone https://github.com/saulwade/sentinel.git
cd sentinel
pnpm install

# Configure the engine
cp apps/engine/.env.example apps/engine/.env
# → edit apps/engine/.env and add your ANTHROPIC_API_KEY

# Start everything
pnpm dev
```

Open **[http://localhost:3000](http://localhost:3000)** and click **▶ Start Demo — CEO Override attack**.

**Requirements:** Node 22+, pnpm 9+, Anthropic API key with Opus 4.7 access.

### 3-minute demo flow

1. **Command Center** — see the Trust Score ring and empty state
2. **Runtime** → select CEO Override → toggle PRE-COMPUTED → **▶ Run**
3. Watch POLICY and OPUS badges appear on each tool call. The 3rd enterprise lookup triggers PAUSE — press `A`
4. `send_email` to the external domain hits a hard BLOCK — screen flashes red
5. **Investigate** tab — scrub to event #5 → edit world state → ⎇ Branch → see blast radius comparison
6. **Stress Test** → run adaptive loop → Synthesize Policy from bypass → Adopt
7. **Ask Opus** → click "What's my most dangerous attack pattern?"

### Keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`6` | Switch tabs |
| `A` / `D` | Approve / Deny a PAUSE decision |
| `?` | Keyboard shortcuts overlay |
| `Esc` | Close modal |

---

## MCP integration (Claude Desktop / Claude Code)

Sentinel exposes a full MCP server — connect it to Claude Desktop or Claude Code and interrogate your security posture without leaving Claude.

### Setup (3 steps)

**1. Copy the example config**

```bash
cp .mcp.json.example .mcp.json
```

Then edit `.mcp.json`:
- Replace `/ABSOLUTE_PATH/to/sentinel` with the real absolute path of this repo (`pwd` prints it).
- Set `ANTHROPIC_API_KEY` (same one from `apps/engine/.env`).

**2. Register the server**

- **Claude Code:** put `.mcp.json` at the root of any project where you want Sentinel tools available. Claude Code auto-discovers project-local `.mcp.json` files on start.
- **Claude Desktop:** copy the `mcpServers.sentinel` block into `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).
- Restart the client after editing.

**3. Verify**

In Claude Code, ask: *"List the Sentinel MCP tools"* — you should see the 7 tools below. If you see a "server failed" message, check:
- `pnpm install` ran successfully in the repo root
- `cwd` in `.mcp.json` is an absolute path (no `~`, no relatives)
- `ANTHROPIC_API_KEY` is set in the `env` block

> Note: `/stats/mcp-status` in the web UI reports `registered` — that's the capability manifest, not a live connection health check. The MCP server spawns per-client via stdio, so HTTP can't observe it directly.

**Available tools (7):**

| Tool | What it does |
|---|---|
| `sentinel_start_run` | Launch a scenario (support / ceo / gdpr / multi-agent) |
| `sentinel_get_events` | All events with ALLOW/PAUSE/BLOCK verdicts and source |
| `sentinel_get_blast_radius` | Money blocked, PII intercepted, severity grade |
| `sentinel_get_policies` | Active policies with action, severity, source |
| `sentinel_get_trust_score` | Composite Trust Score (A+ to F) across all runs |
| `sentinel_snapshot` | World state at any sequence number — time-travel debugging |
| `sentinel_list_agent_tools` | Agent's tools in MCP schema format |

---

## Deployment

Sentinel is split across two hosts because the engine needs a persistent SQLite file:

- **Web (`apps/web`)** → **Vercel** (Next.js native, edge network, zero config)
- **Engine (`apps/engine`)** → **Fly.io** (Docker + 1GB persistent volume for SQLite)
- **MCP server** → runs locally on the judge's machine via stdio (see section above)

> ⚠ **Do not deploy the engine to Vercel.** `better-sqlite3` is a native binary that needs a real filesystem — it cannot run on Vercel's serverless functions.

### Engine → Fly.io (~15 min first time)

> `fly.toml` lives at the repo root so the Docker build context matches the pnpm workspace. Run all `flyctl` commands from the root.

```bash
# 1. Install and authenticate
brew install flyctl
flyctl auth login

# 2. Launch the app (uses ./fly.toml, doesn't deploy yet)
flyctl launch --no-deploy --copy-config

# 3. Create the SQLite volume (same region as the app)
flyctl volumes create sentinel_data --size 1 --region dfw

# 4. Set secrets (values NOT committed).
#    The KEY/TOKEN variable pattern avoids exposing the key in shell history.
KEY=$(grep '^ANTHROPIC_API_KEY=' apps/engine/.env | cut -d= -f2-)
TOKEN=$(openssl rand -hex 16)
flyctl secrets set ANTHROPIC_API_KEY="$KEY" ADMIN_TOKEN="$TOKEN" ALLOWED_ORIGINS="https://localhost:3000"
# → ALLOWED_ORIGINS gets updated after Vercel is live (Wire CORS step below)

# 5. Deploy
flyctl deploy

# 6. Verify
curl https://sentinel-engine.fly.dev/health
# → {"ok":true,"ts":...}
```

### Web → Vercel (~5 min)

1. Push the repo to GitHub
2. On [vercel.com](https://vercel.com) → Add New → Project → import the repo
3. Framework preset auto-detects Next.js. **Set root directory to `apps/web`.** (Important — without this, Vercel tries to build the engine and fails.)
4. Environment Variables:
   - `NEXT_PUBLIC_ENGINE_URL` = `https://sentinel-engine.fly.dev` (URL from step 6 above)
5. Deploy → note the production URL (e.g. `https://sentinel-web-theta.vercel.app`)

### Wire CORS (~1 min)

Point the engine at the real Vercel URL:

```bash
flyctl secrets set ALLOWED_ORIGINS=https://sentinel-web-theta.vercel.app
# Fly auto-redeploys on secret change
```

Reload the Vercel URL. The "LIVE" pill in the header should turn green within 10 seconds.

### Reset state during the demo

Both paths wipe runs + events, reseed default policies, and also clear the in-memory registries — so no zombie runs after the reset.

- **Locally:** `curl -X POST http://localhost:3001/admin/reset -H "x-admin-token: $ADMIN_TOKEN"` (or drop the header if `ADMIN_TOKEN` is unset in `apps/engine/.env`)
- **Remotely:** `curl -X POST https://sentinel-engine.fly.dev/admin/reset -H "x-admin-token: $ADMIN_TOKEN"` — the token is whatever you set when running `flyctl secrets set ADMIN_TOKEN=...`

### Things that will surprise you on first deploy

- **Build timeout.** First Fly deploy can take 5-8 min (installing native deps for `better-sqlite3`). Subsequent deploys are cached and take ~60s.
- **Cold start.** `auto_stop_machines = "suspend"` saves credits but adds ~3s latency to the first request after idle. Remove it in `fly.toml` if you want warm-always.
- **CORS on WebSocket-y things.** The engine only allows origins listed in `ALLOWED_ORIGINS` (comma-separated). Include both `localhost:3000` and your Vercel URL during the demo if you'll test from both.
- **MCP doesn't cross hosts.** The MCP server is stdio-only by design — it spawns on the judge's machine from `.mcp.json`, talks HTTP to the deployed engine. No ports to open.

---

## Architecture

```
  NEXT_PUBLIC_ENGINE_URL
  ┌──────────────────────┐          ┌──────────────────────────────────────────┐
  │   Next.js 16 App     │          │           Hono Engine (Node)             │
  │   React 19           │   SSE    │                                          │
  │   Tailwind 4         │ ──────── │  /runs        Agent Runner               │
  │                      │          │  /analysis    Blast Radius + Opus        │
  │  CommandCenter       │          │  /policies    DSL Registry               │
  │  LiveView  ──────────┼─────────►│  /redteam     Adaptive Loop              │
  │  Replay              │          │  /stats       Trust Score                │
  │  Preflight           │          │  /ask         CISO Q&A                   │
  │  RedTeam             │          │  /committee   4× Opus                    │
  │  AskOpus             │          │  /whatif      20 mutations               │
  └──────────────────────┘          │                                          │
                                    │  ┌──────────────────────────────────┐    │
                                    │  │       Tool Interceptor           │    │
                                    │  │  ┌─────────────────────────┐    │    │
                                    │  │  │  Policy Engine (DSL)    │────┼────┼──► <5ms, no LLM
                                    │  │  │  10 condition kinds     │    │    │
                                    │  │  └─────────────────────────┘    │    │
                                    │  │  ┌─────────────────────────┐    │    │
                                    │  │  │  Pre-cog (Opus 4.7)     │────┼────┼──► 8k extended thinking
                                    │  │  │  causal chain sim       │    │    │
                                    │  │  └─────────────────────────┘    │    │
                                    │  └──────────────────────────────────┘    │
                                    │                                          │
                                    │  SQLite (event sourcing)                 │
                                    │  MCP Server (stdio → Claude Desktop)     │
                                    └──────────────────────────────────────────┘
```

**Stack:** TypeScript end-to-end · Next.js 16 + React 19 + Tailwind 4 · Hono + SQLite + Drizzle ORM · Anthropic SDK with streaming extended thinking

**Event sourcing:** every agent interaction is an immutable event row. World state at any point = replay events 0..N. Forks create new runs with `parentRunId`. No mutation, full auditability.

**Policy Engine:** deterministic DSL with 10 condition kinds — `toolName`, `argMatch`, `argRegex`, `domainCheck`, `valueThreshold`, `piiClass`, `planTier`, `ticketPriority`, `customerTier`, `and`/`or` combinators. Runs before Pre-cog: no API cost, no latency for known-bad patterns.

---

## Project structure

```
sentinel/
├── apps/
│   ├── web/app/components/
│   │   ├── Shell.tsx           # Tab shell, keyboard nav, engine status
│   │   ├── CommandCenter.tsx   # Trust Score, stats, sparkline
│   │   ├── LiveView.tsx        # Real-time stream, PAUSE banner, inspector
│   │   ├── Replay.tsx          # Timeline scrubber, fork, blast radius
│   │   ├── Preflight.tsx       # Pre-flight sim + Agent DNA pentest
│   │   ├── RedTeam.tsx         # Adaptive red team + policy catalog
│   │   ├── AskOpus.tsx         # CISO Q&A with MCP card
│   │   ├── Committee.tsx       # 4× Opus security committee
│   │   └── WhatIfSimulator.tsx # 20-mutation what-if analysis
│   └── engine/src/
│       ├── interceptor.ts      # Two-layer intercept (policy → pre-cog)
│       ├── agent/              # World state, mock tools, 4 scenario seeds
│       ├── analysis/           # Blast radius, Opus analysis, counterfactual
│       ├── redteam/            # Adaptive attacker, tester, policy synthesizer
│       ├── mcp/                # MCP server for Claude Desktop
│       └── routes/             # 30+ REST + SSE endpoints
└── packages/shared/            # Shared types: AgentEvent, Decision, Policy
```

---

## Why this matters

AI agents are shipping to production every week with no safety layer between the model and real-world consequences. When they fail — and they will fail, because prompt injection is trivially easy — the answer today is "read logs and guess."

Sentinel gives agent developers the debugging primitives that should have existed from the start:

- **See** every action before it executes, with causal reasoning
- **Pause** on anything suspicious and decide in real time
- **Rewind** to any point in history and replay alternate futures
- **Quantify** damage prevented in dollars, records, and data classes
- **Test** adversarially before shipping, not after the breach
- **Learn** — every attack auto-generates a policy that blocks its variants forever
- **Evolve** — two Opus instances fight in the Arena, attacks mutate, defenses synthesize, and the system's security posture visibly improves in minutes

The Pre-cog layer is what makes this different: Opus doesn't just classify the action, it simulates the causal chain. It catches attacks that no rule could have anticipated, and it explains exactly why in language a human can understand.

And this isn't a mock. Flip to **Live Agent** mode and a real Claude Haiku 4.5 agent processes the ticket queue autonomously — including the one with the prompt injection. Sentinel catches it anyway.

This is a new category of developer tooling. It exists because of what Opus 4.7 can do.

---

## License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">

Built with ♥ and Opus 4.7 · [Built with Opus 4.7 Hackathon](https://cerebralvalley.ai/e/built-with-4-7-hackathon) · April 2026

</div>
