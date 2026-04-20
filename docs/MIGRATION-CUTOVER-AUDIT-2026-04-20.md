# Migration Cutover Audit — 2026-04-20

Track: `BR Labs.hrlab`  
Model: `Product Cutover Event` (not rename)  
Scope: Audit-only phase (no cleanup/refactor wave)

---

## Executive Summary

Cutover audit is started and baseline evidence is collected.

Current status by required layer:

1. Remote/Repo Audit — **In Progress** (initial findings captured)
2. Identity Residue Sweep — **In Progress** (high residue confirmed)
3. Runtime Dependency Audit — **In Progress** (critical paths identified)
4. Production Continuity Audit — **In Progress** (continuity constraints mapped)
5. Rollback Plan — **Drafted** (v1 rollback skeleton prepared)

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

## Cutover Audit Output (This Session)

Completed now:

- initial evidence collection for all 5 required audit layers;
- documented blocker surfaces and continuity constraints;
- drafted rollback skeleton.

Still required before Phase 2 (Migration Cutover):

1. external console audit (GitHub/Coolify hooks/secrets/webhooks);
2. final cutover execution checklist with ordered micro-batches;
3. explicit allow-list of temporary legacy residues (if any) during transition.

