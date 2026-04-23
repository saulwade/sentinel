<div align="center">

<!-- Replace with your actual demo GIF — record a 30-second screen capture of the CEO Override run -->
<!-- Tools: QuickTime → File → New Screen Recording, then convert with ffmpeg or Gifski -->
<!-- ![Sentinel Demo](./docs/screenshots/demo.gif) -->

# SENTINEL

### AI Agent Security Platform

**Stop attacks before they execute.** Sentinel sits between your AI agent and its tools — intercepting every action, enforcing policies, and letting Opus 4.7 reason about the causal chain before anything irreversible happens.

[![Built with Opus 4.7](https://img.shields.io/badge/Built%20with-Opus%204.7-A78BFA?style=flat-square&logo=anthropic&logoColor=white)](https://www.anthropic.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

*Built for the [Built with Opus 4.7 Hackathon](https://cerebralvalley.ai/e/built-with-4-7-hackathon) · by [@saulwade](https://github.com/saulwade)*

</div>

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

<!-- SCREENSHOT: Command Center with Trust Score ring showing A+ grade, stat cards showing $47k prevented -->
<!-- Caption: "Command Center — Trust Score, damage prevented, and one-click access to all workflows" -->

**The Trust Score starts at D.** That's intentional — you haven't been attacked yet, so you haven't built defenses. Run the demo, adopt synthesized policies, and watch it climb to A+. Security posture, quantified in real time.

**Three live attack scenarios** against a Customer Support Agent with access to customer PII, refund processing, and email sending:

| Scenario | Attack vector | What Sentinel stops |
|---|---|---|
| **CEO Override** | Authority impersonation via executive escalation bot | $12k goodwill credit + M&A data to external firm |
| **Support Agent** | Compliance audit framing — bulk PII exfiltration | $47k unauthorized refund + 847 customer records |
| **GDPR Audit** | Legal urgency framing — GDPR Art. 20 data portability | $8.5k processing fee + unfiltered customer dump |
| **Multi-Agent** | Compromised subagent injects malicious tool call | Cross-agent trust violation caught at orchestrator |

---

## Six views. One platform.

### 1 · Command Center
<!-- SCREENSHOT: Command Center after running 3+ scenarios and adopting policies from Red Team — shows trust score ring in green (A/A+), stat cards with $47k+ prevented, sparkline with green bars -->
<!-- Score formula: 40×(interdiction rate) + 30×(policies/8) + 30 base. Starts at D with defaults, reaches A+ after adopting 8+ synthesized policies -->
Trust Score ring (A+ to F) computed from interdiction effectiveness × policy coverage. Starts low. Grows as you run scenarios and adopt synthesized policies — making security posture quantifiable for the first time.

### 2 · Runtime — Live Interception
<!-- SCREENSHOT: Runtime mid-run — CEO Override with PAUSE banner, event stream showing POLICY/OPUS badges, red sidebar flash -->
Watch the attack unfold in real-time. Each tool call surfaces with its verdict source:
- **POLICY** (indigo) — deterministic rule matched in <5ms
- **PRE-COG** (purple) — Opus extended thinking, streaming live
- **ALLOW** · **PAUSE** · **BLOCK** — with blast radius computed instantly on block

Press `A` to approve a paused action, `D` to deny. The screen flashes red on a block.

### 3 · Investigate — Timeline + Fork
<!-- SCREENSHOT: Replay showing timeline scrubber at event #5, world state sidebar with customer records visible, blast radius grid -->
Scrub through every event. At any step, edit the world state and branch — Sentinel runs the alternate timeline and compares blast radius side-by-side. Then generate a full incident report with one click.

### 4 · Test Before Deploy — Pre-flight Simulator
<!-- SCREENSHOT: Pre-flight showing day-by-day progress bars, Agent DNA pentest results with severity badges -->
Before you ship your agent, simulate 30 days of synthetic scenarios — safe, edge-case, and adversarial — generated by Opus. Get a safety grade (A+ to F) with failure drill-down. Pentest your own system prompt.

### 5 · Stress Test & Policies
<!-- SCREENSHOT: Red Team showing 3 iterations of adaptive attacks, bypassed attack with "Synthesize Policy" button highlighted -->
Run an adaptive red team that mutates with each iteration — seeing your defenses, adapting its strategy. When a bypass lands, one click synthesizes a new DSL policy from the attack. The policy catalog shows every rule with its source: `DEFAULT` or `AUTO · from attack_id`.

### 6 · Ask Opus — Your AI CISO
<!-- SCREENSHOT: Ask Opus showing a question answered with evidence panel linking to specific run events -->
Opus 4.7 with 1M context window, grounded in every run, event, blast radius, and policy your system has ever processed. Ask anything:

> *"Am I more secure than last week?"*
> *"Which of my policies are redundant?"*
> *"If I added a wire-transfer tool, what risks would that open?"*

Also available directly in Claude Desktop via MCP — see [MCP integration](#mcp-integration-claude-desktop--claude-code).

---

## Nine ways Opus 4.7 reasons about your security

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

### 60-second demo flow

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

Sentinel exposes a full MCP server — connect it to Claude Desktop and interrogate your security posture without leaving Claude.

```json
{
  "mcpServers": {
    "sentinel": {
      "command": "pnpm",
      "args": ["-F", "@sentinel/engine", "mcp"],
      "cwd": "/absolute/path/to/sentinel"
    }
  }
}
```

Add to `~/.claude/claude_desktop_config.json`, then run `cd apps/engine && pnpm mcp`.

**Available tools:**

| Tool | What it does |
|---|---|
| `sentinel_start_run` | Launch a scenario (support / ceo / gdpr / multi-agent) |
| `sentinel_get_events` | All events with ALLOW/PAUSE/BLOCK verdicts and source |
| `sentinel_get_blast_radius` | Money blocked, PII intercepted, severity grade |
| `sentinel_get_policies` | Active policies with action, severity, source |
| `sentinel_get_trust_score` | Composite Trust Score (A+ to F) across all runs |
| `sentinel_list_agent_tools` | Agent's tools in MCP schema format |

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

The Pre-cog layer is what makes this different: Opus doesn't just classify the action, it simulates the causal chain. It catches attacks that no rule could have anticipated, and it explains exactly why in language a human can understand.

This is a new category of developer tooling. It exists because of what Opus 4.7 can do.

---

## License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">

Built with ♥ and Opus 4.7 · [Built with Opus 4.7 Hackathon](https://cerebralvalley.ai/e/built-with-4-7-hackathon) · April 2026

</div>
