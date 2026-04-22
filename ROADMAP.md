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

- [ ] **4.7 Grabar demo 3 min** ⏱️ 30min
  - [ ] Script: problema 30s → setup 20s → interdiction 40s → fork+blast 40s → redteam loop 30s → trust score 20s
  - [ ] OBS + voiceover
  - [ ] Subir MP4

- [ ] **4.8 Deploy (opcional)** ⏱️ 60min · Sonnet
  - [ ] Vercel apps/web
  - [ ] Fly.io / Render apps/engine
  - [ ] Env vars Anthropic
  - [ ] URL pública

**DoD Día 4:** demo 5 min end-to-end sin tocar código.

---

## DÍA 5 — Dom 27 abr AM · Buffer + submit

- [ ] Fresh clone test
- [ ] Bugs de último minuto
- [ ] Submit formulario hackathon ~12:00 CDMX

---

## Orden de sacrificio si algo se atrasa

1. 4.8 Deploy
2. 4.5 Escenarios extra
3. 4.2 Fusión Timeline+Fork
4. 2.5/2.6 Command Center parcial (Trust Score hardcoded)

**NO cortables:** 1.5, 1.6, 2.1, 2.4, 3.1, 3.2, 3.3, 3.5.

---

## Riesgos técnicos

- **Red Team loop latency** (30-60s) → mitigar con streaming visible + paralelización
- **Policy DSL complexity** → arrancar con 3-4 verbos (tool, argMatch, domainCheck, valueThreshold)
- **Blast radius edge cases** → default "unknown" seguro

---

## Bloques con Opus 4.7 ⚠️ (cambiar con `/model` antes)

- 1.5 Policy Engine DSL
- 2.2 Analysis con thinking
- 3.1 Red Team loop architecture
- 3.2 Attacker adaptativo
- 3.3 Policy Synthesis
