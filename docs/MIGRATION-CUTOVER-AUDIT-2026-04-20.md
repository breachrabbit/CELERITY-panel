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

No migration/cutover actions were executed in this step.
No cleanup actions were executed in this step.

---

## 1) Remote/Repo Audit

## 1.1 Git remotes (current fact)

```text
origin   https://github.com/breachrabbit/CELERITY-panel.git
upstream https://github.com/ClickDevTech/CELERITY-panel.git
```

### Assessment

- `origin` still points to legacy-named repo path.
- `upstream` still points to original ClickDevTech repository.
- This is expected pre-cutover, but must be controlled in Migration Cutover phase.

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
- releases: 0
```

Additional repo facts:

- `breachrabbit/CELERITY-panel` is public and currently used by runtime/deploy paths.
- `breachrabbit/brlabs.hrlab` exists and is private, but currently empty.

### Assessment

- No GitHub-side deployment secrets/variables/hooks are currently configured in either repo.
- Target repo readiness is currently blocked by emptiness (`brlabs.hrlab` has no content/workflows/releases yet).
- Release-channel reliance on GitHub Releases cannot be considered ready for cutover because both repos currently report `releases=0`.

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
- `breachrabbit/brlabs.hrlab` releases: `0`

### Assessment

- Current runtime install channel has a structural cutover risk:
  - channel points to a releases feed that currently has no published artifacts.
- Cutover must explicitly define release strategy before switching default source path:
  - panel-bundle-first strategy, or
  - publish releases before channel switch.

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

Status: draft-ready, execution not started.

### Batch 0 — Freeze + Snapshot

- Freeze non-cutover changes.
- Capture:
  - current stand app UUID, last healthy deployment id/commit,
  - current Coolify env snapshot (redacted),
  - current git remotes and repo metadata snapshot.
- Gate:
  - documented rollback baseline exists.

### Batch 1 — Repo Binding Cutover (no runtime switch yet)

- Push current working tree to `breachrabbit/brlabs.hrlab`.
- Rebind local `origin` to `breachrabbit/brlabs.hrlab`.
- Keep `upstream` policy explicit (retain for diff-only or freeze).
- Gate:
  - `brlabs.hrlab` contains full code and history baseline required for deployment.

### Batch 2 — Coolify Source Binding Switch

- Switch Coolify app source binding from:
  - `breachrabbit/CELERITY-panel.git`
  to:
  - `breachrabbit/brlabs.hrlab.git`
- Keep runtime env unchanged in this batch.
- Gate:
  - deploy from new repo succeeds;
  - `/panel/login` and `/panel/nodes` smoke pass.

### Batch 3 — Runtime Source Channel Switch

- Update runtime channel vars:
  - `CC_AGENT_RELEASE_BASE`
  - optional installer source defaults if required by strategy
- Only execute after release strategy is confirmed:
  - publish artifacts first, or keep panel-bundle-only path.
- Gate:
  - Xray onboarding smoke `completed`;
  - Hysteria onboarding smoke `completed`;
  - no legacy ClickDevTech URL in setup logs.

### Batch 4 — Identity Surface Switch (audit-safe)

- Switch metadata/docs/workflow references in controlled allow-list.
- Do not run broad cleanup; only cutover-required identity surfaces.
- Gate:
  - no deploy regression;
  - continuity smokes pass.

### Batch 5 — Stabilization Hold

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

1. `brlabs.hrlab` is currently empty (cannot be deployment source yet).
2. Coolify stand is still bound to `breachrabbit/CELERITY-panel.git`.
3. Runtime channel still points to `breachrabbit/CELERITY-panel/releases`.
4. Releases inventory is empty in both repos (`releases=0`) — release strategy must be explicit before source switch.
5. Identity residue remains high in workflow/docs/compose/package surfaces.

Status: **Phase 1 complete with blockers identified**.

---

## Cutover Audit Output (This Session)

Completed now:

- closed external audit evidence for:
  - GitHub secrets/variables/webhooks/environments/releases,
  - Coolify source links/hooks/deploy bindings,
  - artifact/release/update source dependency map;
- updated production continuity constraints and rollback gates;
- prepared final micro-batch cutover checklist with explicit blockers.

Still required before Phase 2 (Migration Cutover):

1. populate `breachrabbit/brlabs.hrlab` with deployment-ready code baseline;
2. approve runtime release strategy for agent/install channels (because releases are currently empty);
3. approve ordered execution of Batch 0..5 with rollback readiness confirmed.
