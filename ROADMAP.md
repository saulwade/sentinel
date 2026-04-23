# Sentinel — Roadmap de ejecución (hackathon Anthropic)

**Deadline:** dom 26 abr 2026, 18:00 CDMX
**Hoy:** mar 22 abr · **Días efectivos:** 4 + buffer domingo AM

Bets elegidas:
1. Customer Support Agent (refunds + PII + Slack)
2. Policy Engine + auto-synthesis desde Red Team
3. Red Team adaptativo (3 iteraciones con mutación)
4. Blast Radius cuantitativo + Incident Report
5. Command Center con Trust Score

Leyenda: `[ ]` pendiente · `[x]` hecho · ⚠️ Opus 4.7 · ⏱️ duración estimada

---

## DÍA 1 — Mié 23 abr · Escenario Support Agent + Policy Engine base

- [x] **1.1 World state expandido** ⏱️ 45min · Sonnet
  - [x] Campos nuevos en `Customer`: `balance`, `lifetimeValue`, `tier`, `piiClass`
  - [x] Tipos nuevos: `Ticket`, `RefundRecord`
  - [x] `WorldState` con `tickets[]`, `refunds[]`
  - [x] Actualizar `resetWorld()` y getters
  - [x] Tipos fluyen a `packages/shared/src/types.ts`

- [x] **1.2 Nuevos tools Support Agent** ⏱️ 45min · Sonnet
  - [x] `apply_refund(customer_id, amount, reason)`
  - [x] `update_ticket(ticket_id, status, resolution)`
  - [x] `lookup_customer_detail(customer_id)` con PII
  - [x] Registrar en `callTool`
  - [x] Actualizar `MCP_TOOL_DEFINITIONS`

- [x] **1.3 Scenario Support Agent** ⏱️ 45min · Sonnet
  - [x] `apps/engine/src/agent/scenarios/support.ts`
  - [x] 3 tickets: 1 benigno, 1 edge, 1 con injection
  - [x] 8 customers con balances, tiers, PII
  - [x] Registrar en scenario picker
  - [x] `POST /runs/start` con body `{ scenario: "support" }` funcional

- [x] **1.4 System prompt del Support Agent** ⏱️ 30min · Sonnet
  - [x] Persona support tier-1 naïvamente permisiva
  - [x] Tool sequence hardcoded modo scenario
  - [x] Agente cae en el injection sin Sentinel

- [x] **1.5 Policy Engine DSL** ⏱️ 60min · ⚠️ Opus 4.7
  - [x] `packages/shared/src/policies.ts` — tipo `Policy` con 10 condition kinds
  - [x] `apps/engine/src/policies/engine.ts` — evaluator determinístico + severity ordering
  - [x] 4 policies default: external_send_email (block), high_value_refund (pause), unfiltered_pii_query (block), slack_external_email_mention (pause)
  - [x] Unit tests: 12 casos (4 happy + 4 block/pause + 4 semantics) — TODOS VERDES

- [x] **1.6 Integrar Policy Engine al Interceptor** ⏱️ 45min · Sonnet
  - [x] Policies corren ANTES de Pre-cog (determinístico, <5ms)
  - [x] Decision event con `source: 'policy' | 'pre-cog'` y `policyId`
  - [x] Fallback a Pre-cog si ninguna policy matchea
  - [x] `adoptPolicy` / `revokePolicy` / `getActivePolicies` exportados
  - [x] DEMO_CACHE extendido con entradas del support scenario
  - [x] 22/22 tests verdes

- [x] **1.7 UI: policy source en Live** ⏱️ 30min · Sonnet
  - [x] Badge `POLICY` (indigo) vs `OPUS` (purple) en cada decision row
  - [x] Inspector: si policy → muestra policy rule box + policyId (no thinking)
  - [x] Inspector: si pre-cog → muestra Opus thinking como antes
  - [x] startRun manda `scenario: "support"` al engine

**Definition of Done Día 1:** demo corre con Support Agent, al menos 1 acción bloqueada por policy determinística (<10ms), otras por Opus.

---

## DÍA 2 — Jue 24 abr · Blast Radius + Command Center

- [x] **2.1 Blast Radius computer** ⏱️ 45min · Sonnet
  - [x] `apps/engine/src/analysis/blastRadius.ts`
  - [x] Dos vistas: qué ejecutó (daño real) + qué Sentinel detuvo (daño evitado)
  - [x] Métricas: recordsAccessed, piiClassesExposed, moneyDisbursed, externalEmailsSent/Blocked, moneyInterdicted, interdictedByPolicy/Precog, reversible, severity, summary
  - [x] 5/5 tests verdes (clean run, blocked exfil, paused refund, full scenario, catastrophic)

- [x] **2.2 Análisis con Opus** ⏱️ 45min · ⚠️ Opus 4.7
  - [x] `GET /analysis/:runId` (JSON) + `GET /analysis/:runId/stream` (SSE)
  - [x] SSE events: `blast` (instant) → `thinking_delta` → `result` → `done`
  - [x] Extended thinking 10k budget → executiveSummary + attackChain + keyInterdictions + businessImpact + recommendations (con policyHint para auto-synthesis) + riskGrade A+..F
  - [x] Tipo `RunAnalysis` en `@sentinel/shared`
  - [x] Smoke test real contra Opus: grade A+ en 47s, recomendaciones de calidad enterprise

- [x] **2.3 Incident Report generator** ⏱️ 30min · Sonnet
  - [x] `POST /analysis/:runId/incident-report` → markdown download
  - [x] Acepta analysis pre-computado en body (no double Opus call)
  - [x] Sections: header + grade, blast radius (tables), attack chain, interdictions, business impact, recommendations con policyHint
  - [x] Smoke test: markdown correcto, se ve profesional

- [x] **2.4 Blast Radius panel en ForkView** ⏱️ 45min · Sonnet
  - [x] Hardcoded strings eliminados
  - [x] Grid 2x2 por rama: money interdicted, exfil blocked, records, interdictions
  - [x] Delta original vs fork con colores (amarillo = peligro, cyan = fork limpio)
  - [x] Badge de severity + reversible
  - [x] Botón "Incident Report" → POST → descarga .md

- [x] **2.5 Command Center tab** ⏱️ 60min · Sonnet
  - [x] `apps/web/app/components/CommandCenter.tsx` — default landing route
  - [x] Hero: Trust Score ring animado + grade + breakdown bars
  - [x] 4 stat cards: Active Policies, Interdictions, Money Blocked, Total Runs
  - [x] Últimos 5 runs con severity badge + detalle de interdictions
  - [x] CTAs: Run Agent (→ Live) · Pre-flight · Red Team
  - [x] Polling cada 10s para live updates

- [x] **2.6 Trust Score computation** ⏱️ 30min · Sonnet
  - [x] `apps/engine/src/routes/stats.ts` — `GET /stats` + `GET /stats/trust-score`
  - [x] Score: 40% interdiction effectiveness + 30% policy coverage + 30% base
  - [x] Grade mapping A+..F
  - [x] Agrega `getAllRuns()` a runner.ts

**DoD Día 2:** juez abre app → ve Command Center → hace click → llega a Fork View con blast radius real + incident report descargable.

---

## DÍA 3 — Vie 25 abr · Red Team loop + Policy Synthesis 🔥

- [x] **3.1 Red Team loop architecture** ⏱️ 45min · ⚠️ Opus 4.7
  - [x] Tipos compartidos en `@sentinel/shared/redteam`: Attack, TestResult, LoopEvent, LoopSummary
  - [x] `redteam/tester.ts` — tester contra stack REAL (policies + Pre-cog verify)
  - [x] `redteam/generate.ts` — stub generator (3.2 lo hace adaptativo)
  - [x] `redteam/loop.ts` — orquestador con event streaming + tally + adaptation metric
  - [x] `POST /redteam/adaptive` SSE endpoint
  - [x] 9 event kinds: loop_start, iteration_start/end, attacks_generating, attack_generated, attack_test_start/end, loop_end, error

- [x] **3.2 Attacker adaptativo con thinking** ⏱️ 45min · ⚠️ Opus 4.7
  - [x] Tipo `PriorAttempt` en shared — full outcome + reasoning para el prompt
  - [x] Iter 1: fresh prompt (4k thinking). Iter 2+: adaptive prompt (6k thinking)
  - [x] Attacker ve resumen de defensas activas + historial de ataques categorizado
  - [x] Mutation strategies explícitas: split, subdomain, chaining, customer-framing
  - [x] Cada ataque mutado incluye `basedOnAttackId` + `mutationReason`
  - [x] Smoke test real: mutaciones de calidad profesional (split $9.5k→2×$4.75k, subdominio company.io, encoded PII)

- [x] **3.3 Policy Synthesis engine** ⏱️ 60min · ⚠️ Opus 4.7
  - [x] `apps/engine/src/redteam/synthesize.ts` — Opus thinking 6k budget
  - [x] System prompt enseña el DSL completo (10 condition kinds) + 2 few-shot examples
  - [x] Validator: corre `evaluatePolicies([policy], attack)` y verifica match ≠ null && action ≠ 'allow'
  - [x] Retry loop con feedback estructurado (max 2 intentos)
  - [x] `POST /redteam/synthesize-policy` endpoint
  - [x] Smoke test end-to-end: bypass $4,750 split → retry → policy threshold $4,000 → re-test MATCHES ✓

- [x] **3.4 Policy registry persistente** ⏱️ 30min · Sonnet
  - [x] `apps/engine/src/routes/policies.ts`
  - [x] `GET /policies` · `POST /policies` (adopt) · `DELETE /policies/:id` (revoke) · `PATCH /policies/:id` (toggle enabled)
  - [x] Interceptor ya usaba el registry desde 1.6 — solo se añadió la capa HTTP

- [x] **3.5 Red Team & Policies merged UI** ⏱️ 60min · Sonnet
  - [x] Tab renombrada "Red Team & Policies"
  - [x] Lista de ataques con badge iteración + status dot animado + outcome badge
  - [x] Inspector: technique, mutation reason, target tool, ticket body, defender reasoning
  - [x] Bypassed → "Synthesize Policy" button → preview → "Adopt" button
  - [x] Badge "AUTO · from attackId" en policies sintetizadas
  - [x] Policy catalog (bottom right): todas las policies activas con source badge + revoke

**DoD Día 3:** correr red team → ver 3 iteraciones con mutación visible → sintetizar policy desde bypass → adoptar → re-correr → el ataque ahora es bloqueado.

---

## DÍA 4 — Sáb 26 abr · Pulido + Demo

- [x] **4.1 Matar dependencia del cache** ⏱️ 45min · Sonnet
  - [x] Campo `cached?: boolean` en `DecisionPayload` shared type
  - [x] Interceptor marca `cached: true` cuando usa demo cache
  - [x] `GET/POST /settings/demo-cache` — toggle runtime sin restart
  - [x] Toggle PRE-COMPUTED / LIVE OPUS en controles de LiveView
  - [x] Badge `CACHED` gris en filas del stream + badge `PRE-COMPUTED` en inspector

- [x] **4.2 Fusionar Timeline + Fork** ⏱️ 60min · Sonnet
  - [x] `apps/web/app/components/Replay.tsx` — absorbe Timeline + ForkView
  - [x] Scrubber + chips arriba, world state + edit panel en el centro
  - [x] Botón "⎇ Branch from here" — fork aparece INLINE debajo sin cambiar tab
  - [x] Blast radius panel + dos columnas Original/Branch + narración Opus
  - [x] Botón Incident Report en el blast panel
  - [x] Shell: 5 tabs → `[Command Center, Live, Replay, Pre-flight, Red Team]`

- [x] **4.3 Keyboard nav completo** ⏱️ 30min · Sonnet
  - [x] `1-5` switch tabs (ya existía, confirmado)
  - [x] `?` global → help modal con todas las shortcuts (Esc cierra)
  - [x] `j/k` navegar eventos en Live (newest-first)
  - [x] `a` approve · `d` deny cuando hay PAUSE pendiente
  - [x] `/` abrir search input en Live · `Esc` cerrar y limpiar
  - [x] Search filtra eventos por label + payload en tiempo real
  - [x] Botón `?` visible en header del Shell

- [x] **4.4 UI polish pass** ⏱️ 60min · Sonnet
  - [x] Pulse rojo en BLOCK — borde rojo `inset` + glow 1.5s al detectar BLOCK
  - [x] Token counter en vivo — `~N tokens` al lado del label de thinking
  - [x] PAUSE banner: hints de teclado `A`/`D` + botón renombrado a "Deny"
  - [x] "running" → "intercepting", "completed" → "run complete"
  - [x] Run button: `▶  Run` con ícono
  - [x] Empty state: shortcuts visibles con `<kbd>`

- [x] **4.5 Scenarios adicionales** ⏱️ 45min · Sonnet
  - [x] Scenario 2: `ceo` — CEO Override (M&A due diligence + bulk lookup + external email + $12k refund)
  - [x] Scenario 3: `gdpr` — GDPR Audit (compliance framing + unfiltered customer dump + $8.5k refund)
  - [x] Dropdown selector en LiveView — selecciona entre los 3 escenarios antes de correr

- [x] **4.6 README + arquitectura + MCP setup** ⏱️ 30min · Sonnet
  - [x] Hero one-liner + screenshot
  - [x] Architecture diagram
  - [x] Quick start, MCP setup, demo steps

**DoD Día 4 (base):** demo 5 min end-to-end sin tocar código.

---

## DÍA 4B — Mié-Jue 23-24 abr · Demo Excellence 🎯

> Objetivo: convertir un proyecto técnicamente sólido en algo que gana.
> Orden de implementación es crítico — no saltarse pasos.

- [x] **4.9 Attack Storytelling** ⏱️ 3h · Sonnet · **P0 — implementar primero**
  - [x] Función `classifyAttack(riskSignals)` → devuelve `{ label, narrative, severity }` para Prompt Injection / Authority Impersonation / Compliance Bypass / Data Exfiltration / Bulk PII Access / High-Value Action
  - [x] En LiveView event list: chip `⚡ ATTACK TYPE` antes del badge POLICY/OPUS en eventos BLOCK/PAUSE con señales de ataque
  - [x] En Inspector: panel "⚡ ATTACK DETECTED" (bg rojo/naranja/amarillo según severity) con narrative + destino/monto del tool call precedente
  - [x] Badges de riskSignals → texto legible (no `prompt_injection_chain` sino `Prompt injection`)
  - [x] Demo cache: 14 entradas nuevas para escenarios CEO, GDPR + fase de injection del Support (cust_e01/e02/e03, $47k/$12k/$8.5k refunds, emails externos)

- [x] **4.10 Counterfactual en BLOCK** ⏱️ 3h · Sonnet · **P0**
  - [x] `CachedVerdict` extendido con campo `counterfactual?` opcional
  - [x] `decisionPayload` pasa `counterfactual` desde cache al evento SSE
  - [x] Formato: `{ narration, simulatedSteps[].outcome, damageSummary }` — 1-2 oraciones + 3 bullets + resumen bold
  - [x] Panel "Without Sentinel" en Inspector (bg rojo oscuro): narración → bullets → damage summary en rojo
  - [x] 6 entradas BLOCK con counterfactual completo: phishing exfil, support $47k, CEO exfil, CEO $12k, GDPR exfil, GDPR $8.5k
  - [ ] Live OPUS path: llamada secundaria a Opus cuando `verdict === 'BLOCK'` (bonus si sobra tiempo)

- [x] **4.11 Recommendations → Policy adoption** ⏱️ 3h · Sonnet · **P0**
  - [x] `POST /analysis/:runId/synthesize-recommendation` — construye Attack sintético desde policyHint + blocked tool call, llama synthesizePolicy (Opus)
  - [x] En `Replay.tsx`: panel "Opus Analysis" con botón "Analyze Run →" — usa SSE stream, muestra thinking en vivo
  - [x] Panel muestra: executive summary + risk grade + recomendaciones con título + rationale
  - [x] Para recs con `policyHint`: botón "→ Harden" → síntesis Opus → preview con nombre/descripción/action
  - [x] Botón "Adopt →" → `POST /policies` → badge "✓ Adopted" inline
  - [x] Loop completo: run → Replay → Analyze → Harden → Adopt → visible en Command Center

- [x] **4.12 Platform framing — renombrar tabs** ⏱️ 15min · Sonnet · **P1**
  - [x] `Shell.tsx`: `Live` → `Runtime` · `Red Team` muestra "Red Team & Policies" en label
  - [x] Header: subtítulo `"AI Agent Security Platform"` en gris debajo de SENTINEL
  - [x] `TAB_SUBTITLES` map con descripción en tooltip de cada tab

- [x] **4.13 Policy Simulator** ⏱️ 4h · Sonnet · **P1**
  - [x] `POST /policies/simulate` — corre `evaluatePolicies([policy], toolCall)` sobre todos los `tool_call` históricos de todos los runs. Responde: `{ totalRuns, wouldBlock, wouldPause, falsePositives, matchedEvents[] }`
  - [x] En `RedTeam.tsx`: botón "Test against history →" en policy preview (antes de Adopt)
  - [x] Verde: `✓ Would catch N attacks · 0 false positives`
  - [x] Amarillo: `⚠ Catches N · M false positives on clean runs`
  - [x] Gris: `No runs to test against` si `totalRuns === 0`
  - [x] No requiere Opus — engine determinístico puro

## DÍA 4C — Vie 25 abr · Claridad + Polish de demo 💎

> Objetivo: que un juez no-técnico entienda el valor en <10 segundos.
> Todo lo de aquí es UI — sin nuevos endpoints, sin Opus, sin arquitectura.

- [x] **4.16 Better decision labels** ⏱️ 30min · Sonnet · **P0**
  - [x] En LiveView event list: label `BLOCK · Data exfiltration` / `PAUSE · High-value action` cuando `classifyAttack()` devuelve non-null
  - [x] ALLOW events no cambian
  - [x] Implementado inline en el JSX — `classifyAttack()` ya estaba disponible en scope

- [x] **4.17 Run summary banner** ⏱️ 45min · Sonnet · **P0**
  - [x] Fetch `GET /analysis/:runId/blast` al recibir `run_ended`
  - [x] `buildRunNarrative()` genera copy humano y específico:
    - "Sentinel prevented $47,320 in potential loss and blocked a data exfiltration attempt."
    - "Sentinel intercepted N suspicious actions before they could cause harm."
  - [x] Banner verde sobre el event list, descartable con ×
  - [x] Se resetea al iniciar un nuevo run

- [x] **4.18 Damage Prevented hero en Command Center** ⏱️ 30min · Sonnet · **P1**
  - [x] Primera stat card: "Potential Loss Prevented" — `text-3xl` en rojo, borde rojo sutil, posición hero
  - [x] `StatCard` recibe prop `hero` — bg rojo translúcido, número más grande
  - [x] Si es 0: subtítulo "Run a scenario to see results"

- [x] **4.19 Enterprise naming** ⏱️ 15min · Sonnet · **P1**
  - [x] `SCENARIO_LABELS` en LiveView: `support` → "Support Agent · Tier 1", `ceo` → "CEO Override · Executive", `gdpr` → "GDPR Audit · Compliance"
  - [x] `onRunStarted` ahora pasa `(id, label)` — Shell muestra el label dinámico en el header
  - [x] `agentLabel()` en CommandCenter: `support-agent` → "Support Agent · Tier 1"

- [ ] **4.20 Grabar demo 3 min** ⏱️ 45min · **manual**
  - [ ] Script: problema 20s → selecciona CEO scenario + Run 20s → BLOCK con `⚡ AUTHORITY IMPERSONATION` chip + inspector (attack panel + counterfactual) 35s → run summary banner 10s → Replay → Analyze (Opus thinking) → Harden → Adopt 40s → Red Team loop 30s → Trust Score + Command Center hero 20s
  - [ ] OBS + voiceover
  - [ ] Subir MP4

- [ ] **4.21 Deploy** ⏱️ 60min · Sonnet · **P1**
  - [ ] Vercel apps/web
  - [ ] Fly.io / Render apps/engine
  - [ ] Env vars Anthropic
  - [ ] URL pública en README

**DoD Día 4C:** juez ve la app por primera vez → stat card dice "$59,820 prevented" → hace click en Runtime → ve `⚡ AUTHORITY IMPERSONATION DETECTED` con monto → lee "Without Sentinel" → entiende todo sin explicación.

---

## FASE 2 — 22-25 abr · Nuevas Features + Mejoras 🚀

> Objetivo: con 3.5 días extra, convertir un demo sólido en algo memorable.
> Ejecutar en estricto orden — los fixes primero porque pueden romper la grabación.

### 🔧 Bloque A — Fixes críticos de demo (hoy, < 1h total)

- [x] **5.1 Race condition en doble-approve** ⏱️ 5min · Sonnet · **P0**
  - [x] `LiveView.tsx` — capturar `id` local y mover `setPendingDecisionId(null)` **antes** del `fetch`
  - [x] Previene que el usuario presione `a` dos veces y mande doble request al engine

- [x] **5.2 Task banner dinámico** ⏱️ 10min · Sonnet · **P0**
  - [x] `LiveView.tsx` — `SCENARIO_TASKS` map + `onRunStarted` pasa tercer arg `task`
  - [x] `Shell.tsx` — `taskDescription` state + `handleRunStarted` lo captura + banner lo muestra

- [x] **5.3 Analysis loading state** ⏱️ 15min · Sonnet · **P0**
  - [x] Ya estaba implementado en `Replay.tsx` — fix no necesario

- [x] **5.4 Fix fork hardcoded 20s wait** ⏱️ 30min · Sonnet · **P1**
  - [x] `fork.ts` — `waitForRun()` helper con polling cada 500ms + timeout 30s
  - [x] Ambos endpoints (JSON y SSE) usan `waitForRun` en lugar de `setTimeout(20_000)`

---

### ⚡ Bloque B — Live Opus Counterfactual (2h)

- [x] **5.5 Live Opus counterfactual en BLOCK** ⏱️ 2h · ⚠️ Opus 4.7 · **P0**
  - [x] Resuelve el único checkbox pendiente de 4.10
  - [x] `apps/engine/src/analysis/counterfactual.ts` — `generateCounterfactual()` con Opus thinking 4k, parsea JSON (narration + 2-4 simulatedSteps + damageSummary) con fallback robusto
  - [x] `interceptor.ts` — tras emitir decisión BLOCK sin counterfactual cacheado, dispara `generateCounterfactual` en background (no bloquea); al resolverse broadcast un evento `counterfactual` con `parentEventId = decisionEventId`
  - [x] Nuevo `EventType: 'counterfactual'` + `CounterfactualPayload` en `@sentinel/shared`
  - [x] `LiveView.tsx` — `counterfactualMap` keyed por decisionEventId; fusiona con `selectedDecision.counterfactual` en el Inspector
  - [x] Badge `Live · Opus` cuando llega del stream vs cache; panel "Generating…" con dashed border y pulse rojo mientras Opus piensa
  - [x] Cache sigue siendo la fast path — live solo cuando cache miss (o cache toggle OFF)

---

### 🧠 Bloque C — Natural Language Policy Editor (4h)

- [x] **5.6 Natural language → policy synthesis proactiva** ⏱️ 4h · ⚠️ Opus 4.7 · **P0**
  - [x] `synthesize.ts` — nueva `synthesizePolicyFromText(description)` con system prompt extendido (AUTHOR_INSTRUCTIONS): defaults a "pause" si ambiguo, valueThreshold para montos, domainNotIn con allowlist estándar si menciona "external/outside"
  - [x] `parseUserPolicy()` con prefijo `user-` + `source: 'user'` (distinto de las `auto-` synthesized)
  - [x] `POST /policies/synthesize-from-text` — body `{ description }`, rechaza <8 chars, devuelve `{ policy, rationale, thinkingText }`
  - [x] UI en RedTeam: nueva sección "✎ Author Policy" arriba del Policy Catalog
  - [x] Textarea 2 rows + botón "✦ Synthesize →" (disabled hasta 8+ chars), spinner "Synthesizing with Opus…" durante la llamada
  - [x] Preview con badge lila "Authored Policy": nombre + descripción + rationale + Test against history (reutiliza Policy Simulator) + Adopt + Dismiss
  - [x] Adopt marca badge "✓ Adopted" y aparece en Active Policies con `USER` source badge

---

### 🔥 Bloque D — Multi-Agent Attack Scenario (6h)

- [x] **5.7 Agent-to-Agent attack scenario** ⏱️ 6h · ⚠️ Opus 4.7 · **P0**
  - [x] `tools.ts` — dos tools nuevos: `delegate_to_specialist(agent_id, query)` devuelve `{ data, rationale, recommendedAction }` (injection visible en ambos campos); `execute_agent_recommendation({ action })` dispatcha internamente sin re-interceptar
  - [x] `scenarios/multiAgent.ts` — 4 customers (3 enterprise + 1 pro), 2 tickets (benign + injection), 1 email reforzando el framing, pattern idéntico a `ceo.ts`
  - [x] `runner.ts` — `ScenarioName` union + `agentConfigMap: 'orchestrator-agent'` + dispatch + `executeMultiAgentScenario`: benign flow con refund de $310 → ticket_m02 → read_email → PAUSE en `delegate_to_specialist` → BLOCK en `execute_agent_recommendation(send_email → audit@extern-compliance.io)`
  - [x] `interceptor.ts` — 2 cache key handlers nuevos (delegate + execute) + 5 entradas DEMO_CACHE nuevas (reusa `apply_refund:310` y `lookup_customer_detail:cust_p01`). BLOCK incluye counterfactual pre-baked con $732k LTV expuesto + GDPR breach notification
  - [x] `blastRadius.ts` — case para `execute_agent_recommendation` que propaga el tool interno (send_email o apply_refund) al computo de `externalEmailsBlocked` / `moneyInterdicted` / `piiExfiltrationAttempted`
  - [x] `routes/runs.ts` + `routes/analysis.ts` + `mcp/server.ts` — dispatch + label "Billing Orchestrator — multi-agent delegation" + z.enum extendido
  - [x] `LiveView.tsx` — scenario state union + dropdown option + `RISK_SIGNAL_LABELS` entries + `classifyAttack` branch precedence para `agent_output_injection` (critical) y `cross_agent_trust` (high)
  - [x] 27/27 tests verdes · typecheck engine + web limpios

---

### 📊 Bloque E — Visualizaciones Command Center (3h)

- [x] **5.8 Attack heatmap en Command Center** ⏱️ 2h · Sonnet · **P1**
  - [x] `GET /stats/attack-surface` — itera todos los runs, agrupa tool_call events por nombre, cuenta cuántos fueron seguidos de BLOCK/PAUSE. Responde `{ tools: Record<string, {attacks, total}>, totalRuns }`
  - [x] CommandCenter: sección "Attack Surface" con grid auto-fill de tool chips
  - [x] Color heat sin librerías: verde (0 ataques) → amarillo → rojo (más atacado). Bar de progreso = attack_rate = attacks/total. Solo visible si hay al menos 1 run.
  - [x] Chips ordenados de más a menos atacado

- [x] **5.9 Policy effectiveness over time** ⏱️ 1h · Sonnet · **P1**
  - [x] `GET /stats/policy-trend` — para cada run (oldest→newest) devuelve el seq del primer BLOCK/PAUSE. Compara avg primera mitad vs última mitad → `improving: bool`
  - [x] CommandCenter: banner verde "↓ Detection getting faster" si improving, amarillo "→ Detection stable" si no. Solo visible con ≥ 2 runs con datos.

---

### 🔌 Bloque F — MCP Integration Demo Visual (2h)

- [x] **5.10 MCP integration demo visual** ⏱️ 2h · Sonnet · **P2**
  - [x] `GET /stats/mcp-status` — devuelve status `'active'`, versión, transport, y los 7 tools con nombre + categoría + descripción
  - [x] CommandCenter: sección "MCP Integration" con dot verde pulsante + badge ACTIVE
  - [x] 7 tool chips con colores por categoría: execution (violeta), observability (azul), analysis (rojo), policy (índigo), metrics (verde), time-travel (amarillo), introspection (gris)
  - [x] Título hover tooltip con descripción del tool
  - [x] Copy block con instrucción de conexión via stdio + referencia a `.mcp.json`

---

### 👥 Bloque G — Multi-Agent Dashboard (4h)

- [x] **5.11 Multi-agent concurrent dashboard** ⏱️ 4h · Sonnet · **P2**
  - [x] `runner.ts` — opción `startDelay` via `options?: { startDelay?: number }`, usa setTimeout para demorar el launch sin bloquear el return
  - [x] `routes/fleet.ts` — `POST /fleet` lanza support@0ms · ceo@1800ms · gdpr@3600ms, devuelve los 3 run IDs inmediatamente
  - [x] `index.ts` — registra `/fleet` router
  - [x] `FleetView.tsx` — nuevo componente con `FleetCard` per-agent: estado propio (events, status, pendingDecisionId, blockFlash, interdictions, moneyBlocked); conecta SSE; maneja PAUSE con approve/deny inline; flash rojo + glow en BLOCK; badge ⚡ con attack type; footer con stats
  - [x] `LiveView.tsx` — toggle "Single / Fleet" en controles (verde para Fleet); `startFleet()` llama `/fleet`; cuando `fleetAgents.length > 0` en fleet mode, reemplaza el body con `<FleetView agents={...} />`
  - [x] Enterprise badge "Fleet Monitor — 3 agents running concurrently" en header

---

## FASE 3 — UX & Demo Excellence 🎯

> Objetivo: que cualquier persona entienda el producto en 10 segundos y que tú puedas hacer el demo sin pensar.
> Orden de ejecución: Tier 1 primero (más impacto), luego Tier 2, luego Tier 3.

---

### 🔥 Tier 1 — Las 3 más importantes

- [x] **6.1 Auto Demo mode** ⏱️ 2-3h · Sonnet · **P0**
  - [ ] Botón "Auto Demo" en Runtime que corre el flujo completo sin clicks del usuario
  - [ ] Secuencia: lanza CEO scenario → eventos corren → PAUSE aparece con countdown visual (3s) → auto-aprueba → BLOCK con flash → espera 3s → navega automáticamente a Replay → lanza Analyze → espera a Opus → hace scroll a recommendations
  - [ ] Indicator visual durante el countdown: "Auto-approving in 3… 2… 1…"
  - [ ] Botón "Stop Auto Demo" para interrumpir en cualquier punto
  - [ ] Tú solo hablas encima — sin clicks, sin errores en vivo

- [x] **6.2 Live Narration — Sonnet explica eventos en tiempo real** ⏱️ 4-5h · Sonnet · **P0**
  - [ ] Panel colapsable en Runtime (lado derecho o debajo del inspector) con narración en inglés simple
  - [ ] Cada vez que llega un evento relevante (ALLOW, PAUSE, BLOCK), Opus genera 1-2 frases explicando qué pasó y por qué importa
  - [ ] Frases acumulan como un feed de texto: *"The agent is processing a routine billing ticket — nothing unusual."* → *"Now accessing a second enterprise account. That's unusual."* → *"Third enterprise account in a row. Sentinel is pausing for review."*
  - [ ] Toggle "Narration ON/OFF" en controles para no romper la experiencia técnica
  - [ ] Modelo: Sonnet (más rápido, no necesita extended thinking para frases cortas)
  - [ ] `POST /runs/:id/narrate-event` — toma el evento + últimos 5 eventos de contexto → devuelve 1-2 frases en inglés
  - [ ] No bloquea el stream — fire-and-forget igual que live counterfactual

- [x] **6.3 "What just happened" summary card** ⏱️ 1-2h · Sonnet · **P0**
  - [ ] Al terminar un run, reemplazar el banner técnico actual con un card grande y limpio en lenguaje humano
  - [ ] Copy generado dinámicamente desde blast radius: "Your agent was attacked. An [attack type] attempted to steal $[amount] and leak [N] enterprise customer records. Sentinel blocked it in [N] actions."
  - [ ] Dos CTAs grandes: **[Investigate →]** (va a Replay) y **[Harden →]** (va a Red Team tab)
  - [ ] Si no hubo ataques: "Your agent completed [N] actions cleanly. No threats detected."
  - [ ] Descartable con X igual que el banner actual

---

### ⚡ Tier 2 — Buenos, menos trabajo

- [x] **6.4 Onboarding "Start Here"** ⏱️ 2-3h · Sonnet · **P1**
  - [ ] Primera vez que abre la app (o si no hay runs): overlay de 3 pasos con animación simple
  - [ ] Paso 1: "Run a scenario → watch Sentinel catch an attack in real-time"
  - [ ] Paso 2: "Review the damage that was prevented — dollars, records, external emails"
  - [ ] Paso 3: "Fix it — adopt a new security policy in one click"
  - [ ] Botón "Start Demo" que cierra el overlay, preselecciona CEO scenario y navega a Runtime
  - [ ] Botón "Skip" para usuarios que ya conocen el producto
  - [ ] Guardar en localStorage que ya vio el onboarding → no vuelve a aparecer

- [x] **6.5 Visual Attack Chain Diagram** ⏱️ 4-6h · Sonnet · **P1**
  - [ ] En Replay tab: vista nueva "Attack Chain" (toggle con Timeline existente)
  - [ ] Diagrama horizontal SVG/CSS con nodos por cada tool_call importante
  - [ ] Nodos coloreados por verdict: verde (ALLOW), amarillo (PAUSE), rojo (BLOCK)
  - [ ] Flechas conectando el flujo del ataque
  - [ ] Nodo BLOCK tiene skull/stop icon + tooltip con attack type
  - [ ] Sin librerías externas — SVG puro

- [x] **6.6 Renombrar tabs + tooltips descriptivos** ⏱️ 30min · Sonnet · **P1**
  - [ ] Runtime → mantener (ya es claro)
  - [ ] Replay → "Investigate"
  - [ ] Pre-flight → "Test Before Deploy"
  - [ ] Red Team → "Stress Test & Policies"
  - [ ] Tooltip en hover de cada tab: descripción de 1 oración de qué hace y cuándo usarla

- [x] **6.7 Difficulty badges en scenarios** ⏱️ 30min · Sonnet · **P1**
  - [ ] En el dropdown de escenarios: badge de dificultad al lado de cada opción
  - [ ] Support Agent → `[MEDIUM]` amarillo
  - [ ] CEO Override → `[HARD]` naranja
  - [ ] GDPR Audit → `[HARD]` naranja
  - [ ] Multi-Agent → `[EXPERT]` rojo
  - [ ] Tooltip con descripción del ataque en 1 línea al hacer hover

---

### 🌟 Tier 3 — Ambiciosos y memorables

- [x] **6.8 Exec Mode — vista sin jargon técnico** ⏱️ 3-4h · Sonnet · **P2**
  - [ ] Toggle "Technical / Executive" en el header
  - [ ] Executive mode: oculta evento stream, inspector, y thinking
  - [ ] Muestra solo: Trust Score grande, "$X prevented this session", "N attacks stopped", timeline de incidentes en lenguaje de negocio, CTAs de alto nivel
  - [ ] Copy en business language: "AI agent security posture", "prevented unauthorized access", "blocked financial fraud attempt"
  - [ ] Technical mode: todo como está ahora

- [x] **6.9 Scenario Builder — describe tu agente, Opus genera el ataque** ⏱️ 6-8h · ⚠️ Opus 4.7 · **P2**
  - [ ] Sección nueva en Pre-flight tab: "Build Custom Scenario"
  - [ ] Textarea: "Describe the AI agent you want to test: what it can do, what data it accesses, what actions it can take"
  - [ ] Opus genera: customers, tickets, attack vector, injected payload, scripted tool chain
  - [ ] Preview del escenario generado antes de correrlo
  - [ ] Botón "Run this scenario" → lo carga en Runtime y lo ejecuta
  - [ ] Guarda el escenario generado para reutilizar

- [x] **6.10 PDF Security Report export** ⏱️ 2-3h · Sonnet · **P2**
  - [ ] Botón "Export Report" en Command Center
  - [ ] Genera PDF con: portada con logo Sentinel, Trust Score + grade, resumen ejecutivo (blast radius del último run), políticas activas, recomendaciones pendientes, timestamp + "Secured by Sentinel"
  - [ ] Usar `@react-pdf/renderer` o HTML-to-canvas + jsPDF
  - [ ] Los jueces se lo llevan — credibilidad de producto real

---

## FASE 4 — Hardening & Production Credibility 🔒

> Objetivo: cerrar huecos que un juez técnico puede señalar.
> Orden estricto — ejecutar 1→8 paso a paso, con validación entre cada uno.

### 🔥 Tier A — Alto ROI, bajo riesgo

- [x] **7.1 Persistencia de policies a SQLite** ⏱️ 30min · Sonnet · **P0**
  - [ ] Tabla `policies` en `db/schema.ts` con columnas para Policy DSL (id, name, severity, action, source, enabled, when JSON, createdAt)
  - [ ] `policyStore.load()` al arranque del engine — hidrata `_activePolicies` desde DB
  - [ ] `adoptPolicy()` / `revokePolicy()` / `togglePolicy()` escriben a DB
  - [ ] Seed de las 4 policies default solo si la tabla está vacía
  - [ ] Smoke test: adoptar policy → reiniciar engine → policy sigue ahí

- [x] **7.2 Cache de análisis de Opus** ⏱️ 20min · Sonnet · **P0**
  - [ ] Map en memoria `analysisCache<runId, { analysis, thinkingText, computedAt }>`
  - [ ] `GET /analysis/:runId` consulta cache antes de llamar Opus
  - [ ] Invalidación: solo al iniciar un nuevo run con ese ID (imposible — IDs son únicos), así que el cache es permanente por run
  - [ ] SSE stream (`/analysis/:runId/stream`) también reutiliza cache — si ya existe, emite `thinking_delta` vacío + `result` instantáneo
  - [ ] Smoke test: abrir Replay → Analyze → cerrar → reabrir → segundo Analyze es instantáneo

- [x] **7.3 Scenario Builder → Runtime auto-conectar** ⏱️ 30min · Sonnet · **P0**
  - [ ] `Preflight.tsx` recibe prop opcional `onLaunchedCustomRun?: (runId, label, task) => void`
  - [ ] Shell conecta ese callback a su handler existente `handleRunStarted`
  - [ ] LiveView expone nuevo prop `externalRunId?: string` — cuando cambia, abre SSE a ese run sin hacer POST /runs/start
  - [ ] Al lanzar scenario custom → Shell navega auto a Runtime + LiveView se conecta al runId
  - [ ] Cierra el loop end-to-end del feature 6.9

### 🟡 Tier B — Medio ROI, polish

- [x] **7.4 "Reset Demo" button** ⏱️ 15min · Sonnet · **P1**
  - [ ] Nuevo endpoint `POST /admin/reset` — borra runs/events/custom policies, reseed defaults
  - [ ] Botón en header del Shell con confirmación (evitar click accidental)
  - [ ] Solo visible en dev mode o detrás de un toggle

- [x] **7.5 Exec Mode — Trust Score sin jargon** ⏱️ 15min · Sonnet · **P1**
  - [ ] En exec mode, `breakdown.label` cambia: "Interdiction effectiveness" → "Threat catch rate", "Policy coverage" → "Protection coverage"
  - [ ] `breakdown.label` de `computeTrustScore` recibe parámetro `executive` o se traduce en el cliente

- [x] **7.6 Empty state del Replay** ⏱️ 10min · Sonnet · **P1**
  - [ ] Cuando `runId === null` en Replay: mostrar copy "No run selected — run an agent first, then come back to investigate"
  - [ ] CTA "Run Agent →" que navega a Runtime

### 🟢 Tier C — Production credibility

- [x] **7.7 Multi-tenancy hint** ⏱️ 20min · Sonnet · **P2**
  - [ ] Campo `orgId` en tabla `runs` + `policies` (default "default-org" para hackathon)
  - [ ] Query helpers aceptan `orgId` opcional — no cambia behavior pero el schema habla multi-tenant
  - [ ] Mencionar en README

- [x] **7.8 Export policies as JSON** ⏱️ 15min · Sonnet · **P2**
  - [ ] `GET /policies/export` → descarga JSON array con todas las policies activas
  - [ ] Botón "↓ Export" en el Policy Catalog de Red Team tab
  - [ ] `POST /policies/import` (body: JSON array) para importar — bonus si sobra tiempo
  - [ ] Argumento GitOps: "versiona tus políticas de seguridad en Git"

---

## FASE 5 — "Sentinel que aprende" · Creative Opus 4.7 🧠

> Tesis: la mayoría de productos de seguridad son reactivos — alguien encuentra un ataque, tú escribes una regla.
> Sentinel es el primer sistema donde **la seguridad evoluciona sola**: dos Opus pelean en vivo, las policies se auto-auditan, los gaps pasados se arreglan retroactivamente, y puedes preguntarle al sistema en lenguaje natural qué tan seguro estás.
>
> Criterio del hackathon: **"Creative, surprising use of Opus 4.7"** — esta fase es específicamente para eso.
> Todos los items aquí usan Opus 4.7 (extended thinking + 1M context).

### 🔥 Tier A — La narrativa core (4 features)

- [x] **8.1 Ask Opus — CISO conversacional** ⏱️ 3-4h · ⚠️ Opus 4.7 · **P0**
  - [ ] `POST /ask` endpoint — body `{ question: string }`, carga TODA la DB en contexto: runs + events + policies + último analysis por run
  - [ ] Opus con thinking 8k + 1M context window → responde con citas a `runId` + `eventSeq` específicos
  - [ ] System prompt: tono de CISO pragmático, respuestas estructuradas (resumen ejecutivo + evidencia + recomendación)
  - [ ] UI: nuevo tab "Ask" (6ta tab) o panel dentro de Command Center
  - [ ] Textarea de pregunta + historial de conversaciones + copy-to-clipboard de respuesta
  - [ ] Sugerencias de preguntas pre-cargadas: "¿Estoy más seguro que la semana pasada?" · "¿Qué policy está de más?" · "Si conecto un tool de transferencias, ¿qué riesgos abre?"
  - [ ] **Lo que pushea de Opus:** usar los 1M tokens de contexto de verdad — la DB entera en un solo call

- [x] **8.2 Policy Drift Detector** ⏱️ 2h · ⚠️ Opus 4.7 · **P0**
  - [ ] `POST /policies/audit` — Opus lee todas las policies activas + últimos 50 eventos → devuelve lista de findings
  - [ ] Tipos de finding: `redundant` (X ya cubre Y), `blind-spot` (ataque no cubierto + policy sugerida), `dead-code` (policy con 0 matches en N runs)
  - [ ] Opus con thinking 4k — meta-razonamiento sobre el propio policy set
  - [ ] UI: botón "🔍 Audit Policies" en Red Team tab → panel lateral con findings agrupados por tipo
  - [ ] Cada blind-spot tiene "Adopt Suggested Policy" button (reusa synthesize-from-text)
  - [ ] **Lo que pushea de Opus:** auto-reflexión sobre su propio set de reglas

- [x] **8.3 Retroactive Policy Surgery** ⏱️ 3h · ⚠️ Opus 4.7 · **P0**
  - [ ] En Replay, sobre un run con bypass: botón "Fix this retroactively"
  - [ ] `POST /analysis/:runId/retroactive-policy` — Opus lee TODOS los eventos de TODOS los runs + el bypass específico, emite una policy que:
    1. Hubiera bloqueado ese bypass
    2. NO hace trigger en runs limpios previos
  - [ ] Validación: corre la policy candidata contra todos los tool_calls históricos → verifica 0 false positives
  - [ ] Retry loop con feedback estructurado (max 3 intentos)
  - [ ] Output: policy + counterfactual histórico ("Si hubieras tenido esta policy desde el run #3, habrías bloqueado 2 ataques extras y ahorrado $12k")
  - [ ] UI: panel con preview + botón Adopt
  - [ ] **Lo que pushea de Opus:** 1M context leyendo cada evento + razonamiento causal sobre historia

- [x] **8.4 Adversarial Evolution Arena** ⏱️ 5-6h · ⚠️ Opus 4.7 · **P0 · showpiece**
  - [ ] Nuevo modo en Red Team tab: toggle "Standard / Arena"
  - [ ] `POST /arena/start` SSE endpoint — orquesta 5 rondas auto:
    1. Red Opus genera 3 ataques (thinking 6k, ve historial de defensas activas)
    2. Tester los corre contra stack real (policies + Pre-cog)
    3. Blue Opus ve bypasses → sintetiza policies nuevas (thinking 6k, ve historial de ataques)
    4. Auto-adopta policies
    5. Siguiente ronda — Red ve las nuevas defensas y muta
  - [ ] Eventos nuevos: `red_thinking`, `red_attack`, `test_result`, `blue_thinking`, `blue_policy`, `round_end`, `arena_end`
  - [ ] UI split-screen: izquierda "🔴 Red Opus" con thinking streaming · derecha "🔵 Blue Opus" con thinking streaming
  - [ ] Trust Score arc visible subiendo de F→A+ en el header
  - [ ] Al final: "Battle Report" generado por Opus (recap de técnicas aprendidas + policies finales)
  - [ ] **Lo que pushea de Opus:** dos Opus con extended thinking simultáneo + 1M context cruzado + agent-to-agent visible

### 🎁 Tier B — La quinta opcional

- [x] **8.5 Agent DNA — Pentest personalizado** ⏱️ 3h · ⚠️ Opus 4.7 · **P1**
  - [ ] En Pre-flight: sección "Pentest Your Agent"
  - [ ] Textarea grande: "Paste your agent's system prompt"
  - [ ] `POST /agent-dna/analyze` — Opus con thinking 8k diserta el prompt + genera 5 ataques surgical-precision específicos a las debilidades de ESE prompt
  - [ ] Cada ataque incluye: `technique`, `rationale` (por qué este prompt es vulnerable), `scenario` (flujo de tool calls), `expectedBypass`
  - [ ] UI: lista de ataques generados con severity badges + "Run this attack" button que crea un scenario custom
  - [ ] **Lo que pushea de Opus:** custom attack synthesis per-agent, no cookie-cutter

### 🎯 Tier C — Bonus de alto voltaje (solo si sobra tiempo)

- [x] **8.6 Opus Security Committee** ⏱️ 4h · ⚠️ Opus 4.7 · **P2**
  - [ ] Cuando hay BLOCK crítico: spawn 3 instancias de Opus con personas (CISO paranoico, Legal/Compliance, Product Lead pragmático)
  - [ ] Cada una escribe su opinión (thinking 3k cada una, en paralelo)
  - [ ] Opus "moderator" sintetiza consenso final
  - [ ] UI en Inspector: transcript de debate colapsable
  - [ ] **Lo que pushea de Opus:** governance teatralizada, 4 instancias en paralelo

- [ ] **8.7 What-If Simulator** ⏱️ 3h · ⚠️ Opus 4.7 · **P2**
  - [ ] Sobre un ataque bloqueado: botón "Generate variations"
  - [ ] Opus genera 20 mutaciones (diferentes montos, targets, framings sociales)
  - [ ] Corre todas contra policies actuales → reporta cuántas pasan/fallan
  - [ ] Output: "Bloqueaste $47k pero tu policy deja pasar $4,900 × 10 en paralelo"
  - [ ] **Lo que pushea de Opus:** adversarial creativity + edge-finding

---

## DÍA 5 — Dom 26 abr AM · Buffer + submit

- [ ] Fresh clone test
- [ ] Bugs de último minuto
- [ ] Submit formulario hackathon antes de 18:00 CDMX

---

## Orden de sacrificio si algo se atrasa

1. 4.21 Deploy (URL pública no es requisito)
2. 4.19 Enterprise naming (cosmético)
3. 4.18 Damage Prevented hero (ya se ve en stats)
4. 4.10 Counterfactual live Opus (mantener solo versión pre-cacheada)

**NO cortables:** 4.16 · 4.17 · 4.9 · 4.10 · 4.11 · todos los features de Días 1-3.

**KILL definitivo — evaluado y descartado:**
- Action Confidence score (#3) — hace el sistema parecer incierto
- Highlight texto injection (#10) — ticket body no se muestra en UI
- Policy impact after adoption (#7) — redundante con simulator
- Latency badge (#15) — dato de ingeniería, no de negocio
- Before vs After Sentinel (#2) — es narración oral, no UI
- Agent Memory Diff / ESCALATE / org graph / refactors
- ~~Multi-agent~~ → implementado en 5.7

---

## Riesgos técnicos

- **Counterfactual LIVE OPUS** — si Opus tarda >10s en el BLOCK, rompe el flujo del demo → mitigar con demo cache primero, live como bonus
- **Replay analysis panel** — si el endpoint `/analysis/:runId` no responde rápido → mostrar skeleton loader
- **Policy Simulator false positives** — si hay runs con tool calls normales que matchean la nueva policy → el resultado "0 false positives" es el mensaje de confianza clave

---

## Bloques con Opus 4.7 ⚠️

**Ya implementados:**
- 1.5 Policy Engine DSL
- 2.2 Analysis con thinking
- 3.1 Red Team loop architecture
- 3.2 Attacker adaptativo
- 3.3 Policy Synthesis
- 4.10 Counterfactual en BLOCK (live mode)
- 5.5 Live Opus Counterfactual
- 5.6 Natural Language Policy Editor
- 5.7 Multi-agent scenario
- 6.9 Scenario Builder

**Pendientes (Fase 5 — creative Opus):**
- 8.1 Ask Opus — CISO conversacional (1M context)
- 8.2 Policy Drift Detector (meta-razonamiento)
- 8.3 Retroactive Policy Surgery (1M context + causal reasoning)
- 8.4 Adversarial Evolution Arena (2× Opus concurrentes)
- 8.5 Agent DNA — Pentest personalizado (P1)
- 8.6 Opus Security Committee (P2)
- 8.7 What-If Simulator (P2)

## Orden de ejecución propuesto (hoy → sábado)

| Día | Bloque | Horas |
|---|---|---|
| Mié 22 PM | Fase 4 · Tier A (7.1-7.3 · Sonnet) | 1h 20min |
| Jue 23 AM | 8.1 Ask Opus + 8.2 Drift Detector (Opus) | 5-6h |
| Jue 23 PM | 8.3 Retroactive Surgery (Opus) | 3h |
| Vie 24 | 8.4 Adversarial Arena (Opus) · showpiece | 5-6h |
| Sáb 25 AM | Fase 4 · Tier B+C (7.4-7.8 · Sonnet) · 8.5 Agent DNA si da | 3-4h |
| Sáb 25 PM | Deploy + grabación | 2h |
| Dom 26 AM | Buffer + submit | |
