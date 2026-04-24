# Sentinel — Plan de hardening pre-demo

**Objetivo:** pasar de "funciona en mi máquina" a "un juez lo prueba en una URL sin fricción".
**Regla de oro:** no agregar features. Solo estabilizar, aclarar y desplegar.

Leyenda: `[ ]` pendiente · `[x]` hecho · 🔴 crítico · 🟡 importante · 🟢 quick win · ⏱️ duración estimada

---

## 📊 Status (2026-04-23)

| Fase | Estado | Notas |
|------|--------|-------|
| −1 · Fix `thinking.adaptive` para Opus 4.7 | ✅ Hecho | 21 call sites migrados |
| 0 · Verificaciones previas | ✅ Hecho | `.env` seguro, cero secrets hardcoded |
| 1 · Bugs críticos en vivo | ✅ Hecho | 6/6 fixes |
| 1.5 · Pixel loaders + persistence | ✅ Hecho | 10 flujos con loader + sessionStorage en Arena/RedTeam |
| 2 · Determinismo del demo | ✅ Hecho | DEMO_CACHE 46/46 HIT, timestamps normalizados, demoCache forzado, `/ask` truncation |
| 3 · Empty states y UX | ✅ Hecho | Replay, Fleet, onboarding skip auto-nav, Author Policy al top |
| 4 · Silent catches | ✅ Hecho | 400 en body malformado, fetchJson + toasts globales, timeout 120s Opus |
| 5 · MCP (docs + wiring) | ✅ Hecho | `.mcp.json.example`, README "Setup (3 steps)", try/catch, status honest |
| 6 · Deploy a Fly.io + Vercel | 🟡 Archivos listos · falta ejecutar | Dockerfile + fly.toml + healthcheck + README Deployment listos. Pendiente: `flyctl launch`, Vercel, CORS wire |
| 7 · Validación final | ⏳ Pendiente | ~30min |

**Tiempo restante estimado:** ~3h en lo que falta.

---

## ✅ FASE −1 — Fix API de thinking (HECHO 2026-04-23)

- [x] Migrar `thinking: { type: 'enabled', budget_tokens: N }` → `thinking: { type: 'adaptive' } as any`
  - 21 ocurrencias en 17 archivos del engine
  - Validado end-to-end con `/ask/stream` devolviendo 200 OK

---

## ✅ FASE 0 — Verificaciones previas (HECHO 2026-04-23)

- [x] **0.1** `.env`, `.env.local`, `.env.*.local` en `.gitignore`. Ningún `.env*` commiteado
- [x] **0.2** Cero `sk-ant-` hardcoded en código/JSON
- [x] **0.3** Snapshot DEMO_CACHE (se cubre formalmente en 2.1)

---

## ✅ FASE 1 — Bugs críticos en vivo (HECHO 2026-04-23)

- [x] **1.1** Disable Approve/Deny durante fetch — `LiveView.tsx` con state `deciding`
- [x] **1.2** LRU cap caches — helper `cachePut()` con max 20 entries en `analysis.ts`
- [x] **1.3** Token en `/admin/reset` — guard condicional en `admin.ts` + UI manda `x-admin-token` + `.env.example` documentado
- [x] **1.4** SSE reconnect + heartbeat — backoff 1s/2s/4s en cliente + heartbeat 15s en `/runs/:id/events`
- [x] **1.5** Boot check `ANTHROPIC_API_KEY` — fail-fast en `index.ts`
- [x] **1.6** Error events mid-stream — verificado, ya existía en `analysis.ts`, `ask.ts`, `redteam.ts`

---

## ✅ FASE 1.5 — Retro pixel loaders + persistence (HECHO 2026-04-23)

- [x] Componente `PixelLoader.tsx` — 3 variantes Game Boy (knight/scroll/spark), CSS puro, SVG inline, steps() animation
- [x] Hook `usePersistentState` — sessionStorage-backed useState
- [x] Loaders aplicados en **10 flujos**:
  - WhatIfSimulator (knight + scroll, loader derecho dinámico según fase de evaluación/síntesis)
  - Committee (scroll antes de personas + scroll para el Moderator con label dinámico)
  - Arena (knight Red panel + scroll Blue panel)
  - RedTeam adaptive loop (knight)
  - Drift Detector (scroll)
  - Replay Intelligence (knight)
  - Replay Retroactive Surgery (knight)
  - ForkView (knight)
  - Preflight Agent DNA (knight)
- [x] Backdrop click bloqueado mientras modal está running (What-If, Committee)
- [x] State persistence: Arena + RedTeam sobreviven tab switch + reload
- [x] Botones "Clear" en Arena y RedTeam para wipe manual

---

## ✅ FASE 2 — Determinismo del demo (HECHO 2026-04-23)

- [x] **2.1** Script `apps/engine/scripts/audit-cache.ts` + comando `pnpm -F @sentinel/engine audit:cache`. Audit reporta **46/46 HIT (100%)** en 5 scenarios (phishing/support/ceo/gdpr/multi-agent). Exports `getDemoCacheSnapshot()` y `getCacheKeyForAudit()` en `interceptor.ts` para uso del audit.
- [x] **2.2** `BASE_TIME = Date.now()` añadido a `ceo.ts`, `gdpr.ts`, `multiAgent.ts`. Todos los `Date.now() - <delta>` reemplazados por `BASE_TIME - <delta>` (datos de scenario estables dentro del process lifetime). `support.ts` y `phishing.ts` ya tenían el patrón.
- [x] **2.3** `LiveView.startAutoDemo()` ahora hace `POST /settings/demo-cache {enabled:true}` antes de lanzar el run.
- [x] **2.4** `askOpus.ts` — truncation loop: si `userPrompt` >800k tokens, elimina runs más viejos uno por uno hasta caber. Devuelve `{truncated, droppedRuns}` al cliente. Log de warning en el engine.

---

## ✅ FASE 3 — Empty states y UX (HECHO 2026-04-23)

- [x] **3.1** Replay empty state ya existía — card centrada con "No incident to investigate" + botón "Run Agent →". Verificado: `onNavigate` correctamente wired desde `Shell.tsx:457`.
- [x] **3.2** Fleet empty state — `PixelLoader` variante `spark` con "Launching fleet" cuando `agents.length === 0`.
- [x] **3.3** Onboarding Skip — ahora además de cerrar el overlay, navega a Runtime y pulsa el botón "Run" con anillo animado (`animate-pulse-ring` + keyframe en `globals.css`) por 3s. Start Demo ya navegaba correctamente desde antes.
- [x] **3.4** Author Policy movido al top del column derecho de RedTeam (arriba del Inspector). Visible sin scroll. Keyframe de pulse añadido a `globals.css`.

---

## ✅ FASE 4 — Silent catches y validación (HECHO 2026-04-23)

- [x] **4.1a** `routes/runs.ts` — body vacío usa defaults; body no vacío malformado → 400 con `{error: 'invalid JSON body'}`.
- [x] **4.1b** `routes/whatif.ts` — parse JSON con try/catch separado; errores de sintaxis → 400 claro.
- [x] **4.1c** `db/client.ts` — `mkdirSync` ahora log explícito + `process.exit(1)` en vez de crash opaco en `new Database()`.
- [x] **4.1d** Nuevo `lib/engine.ts:fetchJson()` — wrapper que dispatch `sentinel:toast` CustomEvent en 4xx/5xx/network errors y tira exception. Extrae `error`/`message` del body JSON si existe.
- [x] **4.1e** Nuevo `components/Toasts.tsx` — stack de toasts bottom-right, autodismiss 5s, 3 kinds (error/warn/info). Montado globalmente en `Shell.tsx`.
- [x] **4.2** 21 lugares de `new Anthropic()` → `new Anthropic({ timeout: 120_000 })` via sed (120s porque Opus thinking+response puede tomar 60-90s legítimamente).

---

## ✅ FASE 5 — MCP (HECHO 2026-04-23)

- [x] **5.1** `.mcp.json.example` creado en el root con bloque `mcpServers.sentinel`, placeholder de `ABSOLUTE_PATH`, slot para `ANTHROPIC_API_KEY`.
- [x] **5.2** README sección "MCP integration" reescrita: "Setup (3 steps)" con copiar config → registrar (Claude Code vs Desktop) → verificar. Troubleshooting para los 3 errores comunes. Nota honesta sobre qué reporta `/stats/mcp-status`.
- [x] **5.3** `startMcpServer()` en `mcp/server.ts` — try/catch explícito en `server.connect(transport)`, loguea causa probable y `process.exit(1)`.
- [x] **5.4** `/stats/mcp-status` ahora devuelve `status: 'registered'` + `kind: 'capability-manifest'` + `note` explicativo. Comment en código clarifica que no es healthcheck. UI actualizada: `McpStatus` type acepta `registered`, pill verde aplica igual. **Backwards-compat:** el endpoint mantiene el mismo path.

---

## 🟡 FASE 6 — Deploy (parte 1 HECHO · parte 2 pendiente en vivo)

### ✅ Parte 1 — Archivos preparados (HECHO 2026-04-23)

- [x] **6.1** Healthcheck mejorado en `Shell.tsx`: poll cada 10s (antes 30s), banner rojo tras 2 fallos consecutivos, toast verde "Engine reconnected" al recuperar. Usa `emitToast` del wrapper de FASE 4.
- [x] **6.2a** `apps/engine/Dockerfile` — Node 22-slim, corepack/pnpm@10.33.0, build deps para better-sqlite3 (python3/make/g++), `pnpm install --filter @sentinel/engine...`, `/data` dir para volume, CMD `pnpm start`
- [x] **6.2b** `apps/engine/fly.toml` — app `sentinel-engine`, region `dfw`, mount `sentinel_data → /data`, `/health` check, `auto_stop_machines = suspend`, 512mb RAM
- [x] **6.2c** `.dockerignore` en root — excluye `apps/web`, node_modules, `.env`, data, docs
- [x] **6.5** README sección "Deployment" completa — topology, Fly.io step-by-step, Vercel step-by-step, CORS wire, reset DB, gotchas conocidas (build timeout, cold start, CORS, MCP cross-host)
- [x] **6.6** Reset DB instrucciones (local + remoto) incluidas en la sección Deployment

### ⏳ Parte 2 — Ejecutar en vivo contigo (restante)

- [ ] **6.2d** `brew install flyctl && flyctl auth login`
- [ ] **6.2e** `flyctl launch --no-deploy --config apps/engine/fly.toml --copy-config`
- [ ] **6.2f** `flyctl volumes create sentinel_data --size 1 --region dfw --config apps/engine/fly.toml`
- [ ] **6.2g** `flyctl secrets set ANTHROPIC_API_KEY=... ADMIN_TOKEN=$(openssl rand -hex 16) ALLOWED_ORIGINS=https://localhost:3000 --config apps/engine/fly.toml`
- [ ] **6.2h** `flyctl deploy --config apps/engine/fly.toml` + curl `/health` confirmar 200
- [ ] **6.3** Conectar repo a Vercel, root `apps/web`, env `NEXT_PUBLIC_ENGINE_URL=https://<fly>.fly.dev`, deploy
- [ ] **6.4** `flyctl secrets set ALLOWED_ORIGINS=https://<vercel-url> --config apps/engine/fly.toml` — Fly redeploya solo
- [ ] **6.7** Fresh-clone test — clonar en `/tmp/sentinel-test` y correr `pnpm install && pnpm dev` siguiendo solo el README

---

## ⏳ FASE 7 — Validación final (~30min)

### 🟡 7.1 Recorrido completo en URL pública ⏱️ 15min
- [ ] Command Center → Trust Score carga
- [ ] Run CEO → PAUSE → Approve → BLOCK con flash
- [ ] Inspector: attack chip + counterfactual
- [ ] Replay → Analyze → thinking stream → Harden → Adopt
- [ ] Red Team: synthesize from text → Test against history → Adopt
- [ ] What-If en BLOCK: 20 variations
- [ ] Arena: 3 rounds completos
- [ ] Navegación 1-5, `?` abre help
- [ ] Empty states correctos

### 🟡 7.2 DevTools abierto ⏱️ 10min
- [ ] Console: 0 errores rojos
- [ ] Network: ningún 4xx/5xx inesperado
- [ ] Memory: snapshot antes y después de 3 runs → no crece >100MB

### 🟢 7.3 Browser incógnito ⏱️ 5min
- [ ] Onboarding dispara · localStorage se popula · segundo refresh no re-muestra

---

## Orden de sacrificio si no alcanza el tiempo

1. **5.4** — `/stats/mcp-status` real
2. **3.4** — Policy authoring sin scroll
3. **4.2** — Timeouts en Opus
4. **2.4** — Contexto `/ask`
5. **FASE 5 entera** — si cortas MCP, quita el claim del README

**NUNCA cortar:** 1 entera, 2.1 (cache audit), 6.1-6.5 (deploy).

---

## Regla final

Después de cada checkbox marcado, **probar en el browser** antes de seguir. No hacer 5 cambios juntos y rezar.
