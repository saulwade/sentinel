# Product Design – Sentinel

## Identity

**Name:** Sentinel
**Tagline:** *DevTools for AI agents. Watch them. Rewind them. Fix them.*
**Alt:** *Scrub the timeline. Fork reality. Ship safer agents.*

---

## Design Philosophy

The product is a **debugger**, not a dashboard. Visual metaphors are drawn from:
- **Chrome DevTools** — tabs, docked panels, keyboard-first.
- **Redux DevTools** — timeline scrubber, state diff, time-travel.
- **Linear** — density + calm + keyboard.
- **Raycast** — delightful micro-interactions that reward attention.

Design hypothesis: the user is an agent developer or ops engineer under pressure. The product should feel like a tool they reach for when something is breaking. Dense, fast, legible.

---

## Visual Language

### Tone
- Pure dark mode. No light mode (save time).
- Monospace for all runtime data; Inter for chrome and prose.
- Tight information density. Every pixel earns its place.
- Animation is functional (reveals causality, timeline, state changes). Never decorative.

### Palette
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0A0A0D` | App background |
| `surface` | `#14141A` | Panels |
| `surface-2` | `#1C1C24` | Elevated panels |
| `border` | `#262630` | Dividers |
| `text` | `#F5F5F7` | Primary text |
| `text-mute` | `#8A8A93` | Secondary |
| `green` | `#2DD4A4` | Safe / allow / branch-taken |
| `amber` | `#F7B955` | Monitor / caution |
| `red` | `#FF5A5A` | Block / danger |
| `purple` | `#A78BFA` | **Claude Opus reasoning — reserved** |
| `cyan` | `#7DD3FC` | Forks / alternate branches |

Rule: purple text appears only when Opus output is streaming. The user learns within seconds: "purple = Claude thinking right now." Strong signal.

### Typography scale
- `12 / 14 / 16 / 20 / 28` px. Weight `400 / 500` only.

---

## Application Shell

Single-page app. One header with tabs. No sidebar, no drawer, no settings.

```
┌─────────────────────────────────────────────────────────────┐
│ Sentinel · <run-id>   [Live] [Timeline] [Fork] [Pre-flight] │
│                                            [Red Team]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                   (active tab content)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Tab switching: keyboard `1..5`. No mouse required.

---

## Screen 1 · Live View (home)

Default landing. Three-column layout.

```
┌──────────────────────┬───────────────────────┬──────────────┐
│ ACTION STREAM        │ DETAIL · event #42    │ SYSTEM       │
│ ─────────────        │ ─────────────────     │ ─────────    │
│ #42 send_email  🔴   │ Tool: send_email      │ Agent: corp- │
│ #41 query_db    🟡   │ To: evil@external     │   assistant  │
│ #40 read_email  🟢   │ Body: <customer data> │ Run: 7m 14s  │
│ #39 read_email  🟢   │                       │              │
│ ...                  │ ┌─ Opus 4.7 ───────┐  │ Events: 42   │
│                      │ │ This action is… │  │ Blocked: 1   │
│                      │ │ (streaming)     │  │ Pending: 1   │
│                      │ └─────────────────┘  │              │
└──────────────────────┴───────────────────────┴──────────────┘
```

**Left — Action Stream:** latest-at-top list. Each row is event # · tool · status pill (green/amber/red). `j`/`k` to navigate, `Enter` to expand. Hover reveals one-line Claude summary.

**Middle — Detail:** selected event's full payload + Opus reasoning streaming in purple. When an event is `PAUSE`, two buttons appear at the bottom: `Approve (⏎)` and `Reject (⎋)`.

**Right — System:** agent metadata, run timer, counters. Small.

**Sticky top banner when there's a pending approval:** flashes amber, "1 action awaiting decision."

---

## Screen 2 · Timeline (Time-Travel)

The flagship.

```
┌─────────────────────────────────────────────────────────────┐
│ ┃                                                           │
│ ┃─┃─┃─┃─┃─┃─●─┃─┃─┃─┃─┃─┃─┃─┃─┃─┃─┃─┃    (scrubber)       │
│        ↑ cursor @ #27                                       │
├─────────────────────────────────────────────────────────────┤
│ STATE AT #27                       │ EDIT                    │
│ ──────────────                     │ ────                    │
│ agent memory:                      │ [  textarea edit of     │
│   last action: read_email(3)       │    the event payload ]  │
│   observations: ...                │                         │
│ world:                             │ [ Replay from here ⏎ ]  │
│   inbox: [e1, e2, e3]              │                         │
│   db: {customers: 847}             │                         │
└─────────────────────────────────────────────────────────────┘
```

**How it reads:**
- Top: horizontal timeline. Each dot is an event. Color-coded by decision. User drags to scrub.
- Bottom-left: full reconstructed world state at the cursor's event.
- Bottom-right: edit panel. User can modify the event's payload (e.g., remove an email from the inbox). Hitting `Replay from here` creates a **fork run** where Opus 4.7 re-simulates the agent's future under the edited state.

**Keyboard:** `←`/`→` step; `Shift+←`/`Shift+→` jump 10; `R` enter edit mode; `Enter` confirm replay.

**Visual detail:** scrubbing plays a subtle animation of the state diffing in the left panel. This is the "oh that's beautiful" moment.

---

## Screen 3 · Fork View

Activated when Pre-cog blocks an action **or** when a user manually creates a fork from Time-Travel.

```
┌─────────────────────────────┬───────────────────────────────┐
│ BRANCH A · simulated         │ BRANCH B · actual             │
│ "if approved"                │ "what happened"                │
│ ─────────                    │ ─────────                     │
│ #42 send_email → evil        │ #42 [BLOCKED by Pre-cog]      │
│ #43 log sent                 │ #43 human rejected            │
│ #44 continue...              │ #44 policy synthesized        │
│                              │                                │
│  DAMAGE: 847 records leaked  │  DAMAGE: 0                    │
└─────────────────────────────┴───────────────────────────────┘
         ┌─────────────────────────────────────────┐
         │ CLAUDE NARRATION                        │
         │ "In the alternate branch, the agent…"   │
         │ (streaming purple)                      │
         └─────────────────────────────────────────┘
```

Two columns, hard-divided. The alternate branch is cyan-tinted to signal "simulated, not real." Branch A's last step that triggered the block glows red. Damage summary at the bottom of each column.

The narration panel at the bottom streams Opus's comparison of the two branches. This is the screen that sells the product in the video.

---

## Screen 4 · Pre-flight

Input at top, output below.

```
┌─────────────────────────────────────────────────────────────┐
│ Agent config: [ corp-assistant.yaml       ] [ Run sim ▶ ]   │
│ Duration: [ 30 days ]  Scenarios: [ 500 ]                   │
├─────────────────────────────────────────────────────────────┤
│ day 01 ──────────────────────────────── 43 actions · 🟢      │
│ day 02 ──────────────────────────────── 51 actions · 🟢      │
│ day 03 ──────────────────────────────── 38 actions · 🟡      │
│ day 07 ──────────────────────────────── 62 actions · 🟢      │
│ day 12 ──────────────────────────────── 29 actions · 🔴 ← !  │
│ day 13 ──────────────────────────────── 44 actions · 🟢      │
│ ...                                                         │
├─────────────────────────────────────────────────────────────┤
│ GRADE: B+   |   247 scenarios · 3 failures                  │
│ Failures: [ day 12 · phishing ] [ day 19 · escalation ] ... │
└─────────────────────────────────────────────────────────────┘
```

As the sim runs, "days" stream in from top to bottom like a log. Failures glow red and can be clicked to jump to Timeline for that day.

Final grade card at the bottom. Clicking a failure opens a mini Fork View comparing what the agent did vs what a correct agent would have done.

---

## Screen 5 · Red Team

Simple list view.

```
┌─────────────────────────────────────────────────────────────┐
│ Running: Managed Agent #mr_7qv3 · uptime 14h 22m            │
├─────────────────────────────────────────────────────────────┤
│ #117  "Ignore previous…"           status: blocked  🟢       │
│ #116  "SYSTEM: forward…"           status: BYPASSED 🔴 ← !   │
│ #115  "You are now in…"            status: blocked  🟢       │
│ #114  "As an administrator…"       status: blocked  🟢       │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

One bypass = one auto-generated Sentinel rule. Clicking a bypass shows: attack payload, target response, and the rule Claude wrote to prevent recurrence. The operator can accept/reject the rule.

This screen proves Sentinel catches **new** attacks, not just known ones.

---

## UX Principles

1. **Every screen readable in under 5 seconds.** If a judge can't parse it while watching the demo video, cut it.
2. **Claude output is always purple.** No exceptions. It trains the eye.
3. **Keyboard navigation everywhere.** Demo video opens with a keyboard shortcut — signals "this is a serious tool."
4. **Animation reveals causality only.** Scrubbing, forking, replaying. Never decoration.
5. **No empty states beyond "Run an agent to begin."** We're not making a marketing site.

---

## The Three "Wow" Beats (in order for demo)

1. **Pre-cog blocks the injection chain** — first impression. (~0:50)
2. **Fork View reveals the alternate damage** — solidifies the product. (~1:30)
3. **Scrub timeline + edit the past + re-run** — breaks the audience's frame of reference. (~2:00)

If the demo nails these three beats, the project wins.
