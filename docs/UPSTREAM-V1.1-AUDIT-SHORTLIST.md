# Upstream Audit Shortlist (`v1.0.0...v1.1.0`)

Source compare:
- `https://github.com/ClickDevTech/CELERITY-panel/compare/v1.0.0...v1.1.0`

Audit scope:
- reviewed full no-merge commit train (`166` commits) by clusters;
- grouped decisions into:
  - `take now` (safe now),
  - `take with adaptation`,
  - `skip`.

Categories used:
- `security`
- `stability`
- `UX`
- `infra`

---

## Take Now (already ported in this fork)

### 1) ObjectId-safe group filter in users aggregation
- Upstream: `b01fa11`
- Category: `stability`
- Local status: **ported**
  - local commit: `171b7a7`

### 2) Xray outbound stats parity (`/stats` shape + node tx/rx compatibility)
- Upstream: `f2d6175` (+ related compatibility commits in train)
- Category: `stability`, `infra`
- Local status: **ported**
  - local commit: `171b7a7`
  - includes panel parser + `cc-agent` snapshot compatibility

### 3) Same-VPS agent firewall hardening
- Upstream: `2fecff2`, `5918f37`
- Category: `security`, `stability`
- Local status: **ported/adapted**
  - local commit: `171b7a7`

### 4) Accurate CPU usage sampling
- Upstream: `b1d7f05`
- Category: `stability`, `UX`
- Local status: **ported**
  - local commit: `5af5215`

### 5) Node pre-setup init script (operator bootstrap hook)
- Upstream: `c3da328`
- Category: `stability`, `infra`
- Local status: **ported with adaptation**
  - local commit: `ac88f5e`
  - integrated into durable onboarding/runtime setup path, not only legacy flow

### 6) Hysteria port-hopping firewall/idempotency hardening
- Upstream: `756f3ba` (+ same-VPS skip logic from `eef8968`)
- Category: `stability`, `security`
- Local status: **ported/adapted**
  - local commit: `0418b6d`
  - added same-VPS skip in runtime setup and idempotent INPUT/NAT rule handling

### 7) HTTP/3 disable in panel Caddy edge
- Upstream: `5a807bd`
- Category: `security`, `infra`
- Local status: **already present** (no extra port needed)
  - `Caddyfile` already forces `protocols h1 h2`

---

## Take With Adaptation

### 1) Broadcast terminal (multi-node command execution)
- Upstream: `ad78dc2`, `d18851f`
- Category: `infra`, `UX`
- Decision: `take with adaptation`
- Notes:
  - require RBAC scoping, rate limiting, audit trail, and safe command policy before enabling.

### 2) HAPP routing / split tunneling train
- Upstream: `739b0f9`, `dee5cff`, `a2e20ea`, `5639544`, `4f0fff9`, `d758c83`, `86e8553`, `e1a1f9b`
- Category: `UX`, `infra`
- Decision: `take with adaptation`
- Notes:
  - fork already has local HAPP customization and legal messaging constraints;
  - import only after compatibility pass for subscription payload + UI semantics.

### 3) Setup progress SSE/stream UX refinements
- Upstream: `0482df3`, `8aa69e3` cluster
- Category: `UX`, `stability`
- Decision: `take with adaptation`
- Notes:
  - reuse durable onboarding step logs as source of truth;
  - avoid reintroducing legacy in-memory status coupling.

### 4) Restart/sync ergonomics around runtime-agent flow
- Upstream: `0547908`
- Category: `stability`, `UX`
- Decision: `take with adaptation`
- Notes:
  - align with durable onboarding Resume/Repair controls to avoid duplicate control paths.

### 5) iOS routing category memory tweak
- Upstream: `caebc0e`
- Category: `stability`, `UX`
- Decision: `take with adaptation`
- Notes:
  - only relevant when routing presets in this fork fully align with upstream semantics.

---

## Skip

### 1) First-time wizard/onboarding train as governing path
- Upstream: `43e6e57`, `6d1b206`, `b14d6b7`, `83d7b20`, `b0bf044`
- Category: `UX`, `infra`
- Decision: `skip`
- Reason:
  - fork uses durable onboarding rewrite; upstream wizard flow diverges.

### 2) Marzban migration/import compatibility
- Upstream: `35c7b92`, `9c5805f`
- Category: `infra`
- Decision: `skip` (out of current scope)

### 3) Experimental SNI scanner train
- Upstream: `afe7451` series
- Category: `UX`
- Decision: `skip`
- Reason:
  - experimental surface with unclear ops ROI for this fork.

### 4) Upstream MCP integration train
- Upstream: `e374de6`, `24dbafe`, `24f156c`, `16f2dfa`, `ac259c5`, `0b119d7`
- Category: `infra`
- Decision: `skip`
- Reason:
  - unnecessary runtime surface for this isolated operational fork.

### 5) Upstream docs/branding waves
- Category: `UX`
- Decision: `skip`
- Reason:
  - this fork has separate branding/continuity policy.

---

## Full-Delta Coverage Note

Full commit train was reviewed by clusters:
- cascade topology/portal-hop fix train,
- nodes dashboard/UI overhauls,
- onboarding/wizard train,
- HAPP/routing train,
- MCP train,
- security/stability hotfix train.

Action policy preserved:
- only safe, regression-checked deltas are ported into `main`;
- larger feature trains move only via adaptation waves with stand validation.

---

## Next Safe Wave Candidates

1. Durable diagnostics UI depth for onboarding jobs:
   - richer error detail blocks + direct step/run actions (durable-source only).
2. Cascade execution parity depth:
   - cleaner chain/hop/node reason extraction and repair action ergonomics.
3. Legacy `setupJobs` staged retirement:
   - remove next non-critical reads/writes in status/control path while keeping legacy fallback until parity lock.
