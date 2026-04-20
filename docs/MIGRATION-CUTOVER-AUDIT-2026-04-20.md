# Migration Cutover Audit — 2026-04-20

Track: `BR Labs.hrlab`  
Model: `Product Cutover Event` (not rename)  
Scope: Audit-only phase (no cleanup/refactor wave)

---

## Executive Summary

Cutover audit is started and baseline evidence is collected.

Current status by required layer:

1. Remote/Repo Audit — **Closed (Phase 1 evidence captured)**
2. Identity Residue Sweep — **Closed (Phase 1 baseline captured)**
3. Runtime Dependency Audit — **Closed (Phase 1 dependency map captured)**
4. Production Continuity Audit — **Closed (constraints + gates captured)**
5. Rollback Plan — **Closed (v2 draft + rollout gates captured)**

Phase 2A / Batch 0 prerequisite state:

- **Completed**: target repo `breachrabbit/brlabs.hrlab` is populated from current codebase (`main` + tags).
- **Validated**: branches/tags/workflows/repo settings were externally verified.
- **Not executed yet**: Coolify source cutover, runtime source-path switch, cleanup, feature waves.

Phase 2A / Batch 1A state:

- **Completed**: workflow failure gate inspected and classified (non-blocking for cutover attempt).

Phase 2A / Batch 1B state:

- **Executed and rolled back**: Coolify source switch was attempted, deployment failed on target private repo access, rollback completed successfully.

---

## 1) Remote/Repo Audit

## 1.1 Git remotes (current fact)

```text
origin   https://github.com/breachrabbit/CELERITY-panel.git
brlabs   https://github.com/breachrabbit/brlabs.hrlab.git
upstream https://github.com/ClickDevTech/CELERITY-panel.git
```

### Assessment

- `origin` still points to legacy-named repo path.
- dedicated `brlabs` remote is now present and used for Batch 0 populate push.
- `upstream` still points to original ClickDevTech repository.
- This is expected in staged cutover, but origin/source binding switch is still pending.

### Action required in cutover phase

- rebind `origin` to `brlabs.hrlab` target remote;
- keep/adjust upstream policy explicitly (either retain for delta-audit only or freeze).

## 1.2 Workflows / release paths

Detected:

- `.github/workflows/docker.yml` still publishes image as:
  - `clickdevtech/hysteria-panel`
- release note text inside workflow still references Docker Hub legacy image name.

### Assessment

- Cutover risk is high if workflow remains on legacy image namespace while repo identity changes.

## 1.3 Secrets / deploy hooks / webhooks

Inside repo, references found:

- workflow secrets names: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.
- runtime webhook feature exists in app (product feature), but cutover deploy-hook inventory is external.

Not auditable from code-only context:

- GitHub repository secret values,
- Coolify deploy hook settings,
- external webhooks configured in infra consoles.

### Required follow-up

- perform external console audit checklist during Migration Cutover execution window.

## 1.4 External GitHub audit (owner-level API facts)

Checked via GitHub API for both repos:

- `breachrabbit/CELERITY-panel`
- `breachrabbit/brlabs.hrlab`

Observed counts:

```text
breachrabbit/CELERITY-panel:
- actions/secrets: 0
- actions/variables: 0
- hooks: 0
- environments: 0
- releases: 0

breachrabbit/brlabs.hrlab:
- actions/secrets: 0
- actions/variables: 0
- hooks: 0
- environments: 0
- releases: 1 (v1.1.0)
```

Additional repo facts:

- `breachrabbit/CELERITY-panel` is public and currently used by runtime/deploy paths.
- `breachrabbit/brlabs.hrlab` exists, is private, and now contains `main` + tags (`v1.0.0`, `v1.1.0`).
- workflow inventory in target repo:
  - `.github/workflows/docker.yml` (`Docker Hub`, active).
- actions settings in target repo:
  - `enabled=true`, `allowed_actions=all`.
- branch protection API for private repo returned `403` (`Upgrade to GitHub Pro...`) and cannot be used as a hard validation surface in current plan.

### Assessment

- No GitHub-side deployment secrets/variables/hooks are currently configured in either repo.
- Target repo baseline is now populated and auditable.
- Release-channel risk moved from “both repos empty” to “legacy source repo still has no releases while runtime channel still points to legacy path”.

## 1.5 External Coolify audit (source links/hooks/deploy bindings)

Target production app (stand):

- app UUID: `ymi9vwwf438y5ozeh0kwhklf`
- app name: `celerity-panel-tunnel`
- status: `running:healthy`
- source binding: `git_repository=breachrabbit/CELERITY-panel.git`, `git_branch=main`, `source_type=GithubApp`

Observed in deployment logs:

- Coolify build/clone path still imports from:
  - `https://github.com/breachrabbit/CELERITY-panel.git`

Hook/binding surfaces:

- `manual_webhook_secret_github`: empty
- `manual_webhook_secret_gitlab/bitbucket/gitea`: empty
- `pre_deployment_command`: empty
- `post_deployment_command`: empty

Runtime source env (cutover-relevant):

- `CC_AGENT_RELEASE_BASE=https://github.com/breachrabbit/CELERITY-panel/releases`
- `CC_AGENT_RELEASE_TAG=latest`

### Assessment

- Coolify is still hard-bound to the old runtime repo identity (`breachrabbit/CELERITY-panel`).
- Source and runtime release channel are not cut over to `brlabs.hrlab`.
- This is a hard blocker for Phase 2 execution until micro-batch switch order is approved.

---

## 2) Identity Residue Sweep

Regex sweep confirmed substantial residue across repo metadata/docs/install surfaces.

High-signal findings:

- `package.json`:
  - name/description/homepage/repository/bugs still legacy (`ClickDevTech`, `hysteria-panel`).
- `README.md` + `README.ru.md`:
  - multiple legacy docker image references (`clickdevtech/hysteria-panel`);
  - clone/install examples still use legacy path naming.
- `docker-compose.hub.yml`:
  - backend image still `clickdevtech/hysteria-panel:latest`.
- `.github/workflows/docker.yml`:
  - `IMAGE_NAME: clickdevtech/hysteria-panel`.
- `src/docs/openapi.js`, `src/docs/i18n.js`:
  - API docs still point to `ClickDevTech/hysteria-panel`.

Total residue count snapshot (broad pattern sweep):

- `111` matches for legacy identity patterns in scanned project surfaces.

### Assessment

- Identity residue is confirmed as a cutover blocker for “clean identity mode”.
- This must be handled in controlled cutover batches, not ad-hoc cleanup.

---

## 3) Runtime Dependency Audit

## 3.1 Installer/runtime source paths

Confirmed:

- `scripts/quick-install.sh` defaults to:
  - `https://raw.githubusercontent.com/breachrabbit/CELERITY-panel/main`
  - `https://github.com/breachrabbit/CELERITY-panel/archive/...`
- `src/services/nodeSetup.js` default `CC_AGENT_RELEASE_BASE`:
  - `https://github.com/breachrabbit/CELERITY-panel/releases`
- hard guard exists against legacy ClickDevTech release URL fallback (already shipped).

### Assessment

- Runtime currently depends on `breachrabbit/CELERITY-panel` identity paths.
- During cutover these paths must be switched in one controlled migration wave.

## 3.2 External runtime dependencies (expected, non-identity)

Still expected and valid:

- Xray releases (`XTLS/Xray-core`)
- Hysteria releases (`apernet/hysteria`)

These are product dependencies and not identity blockers by themselves.

## 3.3 Legacy Docker Hub path usage

Still active in release/deploy surfaces:

- `clickdevtech/hysteria-panel` in workflow + hub compose + readmes.

### Assessment

- Must be migrated or explicitly deprecated under cutover plan.

## 3.4 Artifact / release / update source dependencies

Confirmed dependency points:

- CI workflow image path still points to:
  - `clickdevtech/hysteria-panel` (`.github/workflows/docker.yml`)
- Docker Hub compose/examples still point to:
  - `clickdevtech/hysteria-panel:latest` (`docker-compose.hub.yml`, `README*`)
- quick installer defaults still pull source from:
  - `breachrabbit/CELERITY-panel` (`scripts/quick-install.sh`)
- cc-agent release channel defaults still point to:
  - `https://github.com/breachrabbit/CELERITY-panel/releases` (`config.js`, runtime env)

Release inventory status (GitHub API):

- `breachrabbit/CELERITY-panel` releases: `0`
- `breachrabbit/brlabs.hrlab` releases: `1` (`v1.1.0`, agent assets published)

### Assessment

- Current runtime install channel has a structural cutover risk:
  - channel still points to legacy repo releases (`breachrabbit/CELERITY-panel/releases`) where release inventory is currently `0`.
- Cutover must explicitly define release strategy before switching default source path:
  - panel-bundle-first strategy, or
  - switch runtime channel to target repo releases after continuity gates.

---

## 4) Production Continuity Audit

Hard continuity constraints (must not break):

- existing subscriptions;
- node enrollment/onboarding;
- deployed nodes runtime;
- cascade links/topology behavior;
- cc-agent source and install path.

Current continuity posture:

- durable onboarding exists and is active;
- runtime verification/recovery hardening exists;
- cascade reconcile baseline exists;
- sidecar/hybrid behavior already reworked.

### Continuity risk hotspots during cutover

1. Agent source URL/channel switch drift.
2. Quick installer path switch causing mixed-version installs.
3. Workflow/image namespace switch affecting deploy reproducibility.
4. Identity cleanup touching live paths before compatibility shims are in place.

### Required control gates for cutover

- gate A: smoke Xray onboarding (fresh node) after each source/channel change;
- gate B: smoke Hysteria onboarding (fresh node, sidecar state covered);
- gate C: cascade link create/reconnect/delete + standalone restore check;
- gate D: subscription and user profile access sanity check.

---

## 5) Rollback Plan (Draft v1)

Rollback trigger conditions:

- onboarding regresses (`repairable` loops or runtime offline spike),
- agent install source mismatch,
- node add/delete path breaks,
- cascade reconcile breaks continuity.

Rollback sequence:

1. Freeze new cutover rollout commits.
2. Re-deploy last known healthy commit/image on stand.
3. Restore previous runtime source/channel env for agent installer.
4. Re-run minimal smoke set:
   - panel login,
   - nodes setup (xray/hysteria),
   - subscription fetch,
   - one cascade link operation.
5. Keep cutover changes quarantined in branch until root-cause is fixed.

Mandatory artifacts for rollback readiness:

- tagged “last known healthy” commit hash,
- environment snapshot (release base/tag settings),
- smoke log snapshot for comparison.

---

## 6) Final Cutover Micro-Batch Checklist (Phase 2 input)

Status: **Phase 2A / Batch 0 complete**.

### Batch 0 — Populate Target Repo (Prerequisite) — Completed

Executed:

- pushed current `main` to `breachrabbit/brlabs.hrlab`;
- pushed tags `v1.0.0` and `v1.1.0` to target;
- validated target repo branch/tag/workflow/settings surfaces via GitHub API.

Validation facts:

- branch: `main` exists and points to `47a8de29fa87843eb0c3339fe14b341b99e8c4be`;
- tags: `v1.0.0`, `v1.1.0` present in target repo;
- workflow: `.github/workflows/docker.yml` is present and active;
- repo settings:
  - `private=true`,
  - `default_branch=main`,
  - Actions enabled (`allowed_actions=all`),
  - hooks/environments/secrets/variables currently empty.

### Batch 1 — Coolify Source Binding Switch (next)

- Switch Coolify app source binding from:
  - `breachrabbit/CELERITY-panel.git`
  to:
  - `breachrabbit/brlabs.hrlab.git`
- Keep runtime env unchanged in this batch.
- Gate:
  - deploy from new repo succeeds;
  - `/panel/login` and `/panel/nodes` smoke pass.

### Batch 2 — Runtime Source Channel Switch

- Update runtime channel vars:
  - `CC_AGENT_RELEASE_BASE`
  - optional installer source defaults if required by strategy
- Only execute after release strategy is confirmed:
  - publish artifacts first, or keep panel-bundle-only path.
- Gate:
  - Xray onboarding smoke `completed`;
  - Hysteria onboarding smoke `completed`;
  - no legacy ClickDevTech URL in setup logs.

### Batch 3 — Identity Surface Switch (audit-safe)

- Switch metadata/docs/workflow references in controlled allow-list.
- Do not run broad cleanup; only cutover-required identity surfaces.
- Gate:
  - no deploy regression;
  - continuity smokes pass.

### Batch 4 — Stabilization Hold

- Keep monitor window with no new cleanup/feature wave.
- Re-run continuity checks:
  - subscriptions,
  - node enrollment/setup,
  - cascade link lifecycle,
  - delete-node cleanup path.

---

## 7) Rollback Gates and Cutover Blockers

## 7.1 Rollback gates (must be green before moving forward)

1. Last healthy deployment reference is documented.
2. Env/source snapshots are exported and stored.
3. Smoke checklist is executable end-to-end.
4. Operator can trigger redeploy from previous source binding within one step.

## 7.2 Cutover blockers (current)

1. Coolify stand is still bound to `breachrabbit/CELERITY-panel.git` (Batch 1 pending).
2. Runtime channel still points to legacy releases path (`breachrabbit/CELERITY-panel/releases`) with inventory `0`.
3. Identity residue remains high in workflow/docs/compose/package surfaces (to be handled after source cutover).
4. Workflow runs in target repo are currently failing; Batch 1A classified this as non-blocking for Batch 1B (Coolify cutover), but structural for CI/release path and still open for later fix batch.

Status: **Phase 1 closed + Phase 2A Batch 0 and Batch 1A completed; Batch 1B attempted and rolled back (blocked)**.

---

## 8) Phase 2A / Batch 1B — Coolify Cutover Execution (Result)

Scope executed (and only this scope):

1. rollback snapshot of current Coolify app state;
2. source switch to target repo/branch;
3. post-switch binding verification;
4. immediate deploy smoke;
5. rollback on failure.

### 8.1 Rollback snapshot (pre-switch)

Captured from Coolify app `ymi9vwwf438y5ozeh0kwhklf`:

- source repo: `breachrabbit/CELERITY-panel.git`
- source branch: `main`
- source type: `GithubApp`
- deploy status: `running:healthy`
- webhook/deploy bindings:
  - `manual_webhook_secret_* = null` (no manual webhook secrets configured)
- env continuity:
  - environment variables present and unchanged during this batch.

### 8.2 Source switch performed

Applied switch in Coolify:

- repo: `breachrabbit/brlabs.hrlab.git`
- branch: `main`

Binding verification confirmed target values were applied before smoke deploy.

### 8.3 Immediate smoke deploy result

Triggered deploy UUID:

- `e7u39hapu2o42d96p0xworwc`

Result:

- `failed`

Primary failure evidence:

- `git ls-remote https://github.com/breachrabbit/brlabs.hrlab.git refs/heads/main`
- `fatal: could not read Username for 'https://github.com': No such device or address`

Classification:

- `structural` for Batch 1B (private target repo access path from Coolify `GithubApp` binding is not ready).

### 8.4 Rollback execution

Rollback action:

- restored Coolify source binding to:
  - repo: `breachrabbit/CELERITY-panel.git`
  - branch: `main`

Rollback verification deploy UUID:

- `iduyvwk8ib6nm7e86ai4mtgl`

Rollback deploy result:

- `finished`
- app status remains `running:healthy`.

### 8.5 Batch 1B gate decision

- Batch 1B pass: **No**
- rollback required: **Yes** (executed)
- Batch 2 readiness: **No** (blocked until Coolify target-repo auth/binding path is fixed and Batch 1B re-run passes).

---

## Cutover Audit Output (This Session)

Completed now:

- closed external audit evidence for:
  - GitHub secrets/variables/webhooks/environments/releases,
  - Coolify source links/hooks/deploy bindings,
  - artifact/release/update source dependency map;
- updated production continuity constraints and rollback gates;
- prepared and executed Batch 0 prerequisite (target repo populate + validation).

Still required before Phase 2 (Migration Cutover):

1. approve Batch 1 (Coolify source binding switch) with rollback gates;
2. approve runtime release strategy for agent/install channels (legacy release path still `0`);
3. run Batch 1 smokes and confirm continuity before moving to Batch 2.

## Batch 1 (Coolify cutover) readiness decision

Decision: **Ready with gates**.

Ready conditions met:

- target repo populated and validated (`main`, tags, workflows, settings);
- rollback/checklist framework is documented;
- scope separation is explicit (runtime path switch deferred).

Hard gates to enforce during Batch 1:

1. Do not touch runtime release-path in same batch.
2. Capture pre-switch source binding snapshot and last healthy deployment pointer.
3. Immediately run minimal smokes after switch:
   - `/panel/login`,
   - `/panel/nodes`,
   - node setup page open/render.
4. If smoke fails, rollback source binding immediately.

## Batch 1A — Workflow Failure Gate (Target Repo)

Scope: inspect failed workflows in `breachrabbit/brlabs.hrlab` and classify impact on Batch 1B.

### Inspected evidence

- workflow: `.github/workflows/docker.yml` (`Docker Hub`)
- latest failed run:
  - run id: `24656401704`
  - job: `build-and-push` (`72090934579`)
  - failing step: `Login to Docker Hub`
  - log error: `Username and password required`
- supporting API facts:
  - target repo Actions secrets: `0`
  - target repo Actions variables: `0`

### Root cause classification

Primary cause:

- **missing secret** (`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`) for docker/login action.

Secondary characteristics:

- workflow assumption/config coupling:
  - workflow expects Docker Hub credentials on every push;
  - image namespace is still legacy-oriented (`clickdevtech/hysteria-panel`) and not aligned with cutover target identity.

Not observed as root cause:

- GitHub Actions permissions issue;
- artifact publish failure in `build-agent` job (that job is green in inspected run).

### Gate decision

- For **Batch 1B (Coolify source cutover)**:
  - classification: **benign / non-blocking with explicit acceptance**.
  - rationale:
    - Batch 1B scope is Coolify git source binding + stand continuity smokes;
    - this workflow failure affects Docker Hub publish pipeline, not stand runtime source binding itself.
- For broader CI/release hygiene:
  - classification: **structural debt** and must be addressed in later dedicated batch.
