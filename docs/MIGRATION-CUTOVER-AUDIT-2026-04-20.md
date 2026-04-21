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

Phase 2A / Batch 1B-GRANT state:

- **Executed in-scope, not cleared**: GitHub-side installation access for target repo is visible, but Coolify-side provider grant/rebind is still not provable from current control surface.
- **Retry Batch 1B remains prohibited** until grant is explicitly fixed/verified in Coolify integration.

Phase 2A / Batch 1C state:

- **Completed (clean test app proof)**: a new temporary Coolify app was created from scratch (no source-switch on legacy app object), bound directly to:
  - Git Source: `brlabs-coolify`
  - Repo: `breachrabbit/brlabs.hrlab`
  - Branch: `main`
- **Validated**:
  - repo is selectable and bindable in clean app path;
  - `git ls-remote` and clone from target private repo succeed in deployment helper logs;
  - build/deploy finished successfully (`uj76bwxvjnoe6uxfbb0gsifx`);
  - app reached `running:healthy` (`kp89plobh43b17o0r1f6jrcn`).
- **Conclusion**:
  - target private repo access is functional in clean app path;
  - prior Batch 1B failure is most likely tied to legacy app integration state/mapping.

Phase 2A / Batch 1D-A state:

- **Completed (planning only)**: production recreate/canary cutover execution plan is defined.
- **No execution performed**:
  - no production source switch,
  - no runtime channel switch,
  - no cleanup,
  - no feature-work.

Phase 2A / Batch 1D-B state:

- **Executed (canary only), gate not passed**:
  - canary deploy finished and app runtime stayed `running:healthy`,
  - ingress smoke for canary domain failed with `HTTP 503` / `no available server`.
- **Production continuity preserved**:
  - production app/source binding was not switched in this batch.

Phase 2A / Batch 1D-B-INGRESS-DIFF state:

- **Executed (mismatch-fix verification), gate not passed**:
  - exact mismatch already captured before this step:
    - missing backend ingress labels,
    - `docker_compose_domains=null` on canary app object;
  - minimal patch with explicit backend Traefik labels was deployed;
  - redeploy `i9zxjfcku9gur6q3wq32r8k2` finished, app remained `running:healthy`;
  - post-deploy smoke result is still `HTTP 503` / `no available server` on canary `/panel/login`.
- **Conclusion for this batch step**:
  - current patch is insufficient to clear ingress gate;
  - unresolved mismatch remains in canary ingress backend mapping path (`Host -> router/service -> backend upstream`), with app-level domain binding still `docker_compose_domains=null`.

Phase 2A / Batch 1D-B-INGRESS-TRACE state:

- **Executed (trace-only), no config mutation**:
  - traced canary routing chain from host request to upstream selection;
  - compared live Coolify app state `production vs canary` (router labels, service labels, domain binding state, smoke outputs).
- **Observed facts**:
  - production smoke:
    - `https://tunnel.hiddenrabbit.net.ru/panel/login` -> `HTTP 200`;
  - canary smoke:
    - `https://kp89plobh43b17o0r1f6jrcn.dev.breachrabbit.ru/panel/login` -> `HTTP 503`,
    - body: `no available server`;
  - canary app remains `running:healthy` after deploy;
  - canary app keeps `docker_compose_domains=null`;
  - canary still carries app-level generated router/service labels in `custom_labels` for canary host (`http-0/https-0 ... -> port 80`) while explicit backend labels were added in compose.
- **Exact break point (trace result)**:
  - request reaches ingress/router layer (503 from router proves host rule is matched),
  - break occurs at **service selection -> backend upstream availability** stage:
    - selected canary service path resolves to **no available upstream server** for the matched host/rule.
- **Gate result**:
  - ingress gate remains blocked;
  - Batch 1D-B decision cannot resume.

Phase 2A / Batch 1D-B-UPSTREAM state:

- **Executed (upstream registration comparison), no config mutation**.
- **Compared live registration surfaces (production vs canary)**:
  1. Router/service label set seen in app-level generated state (`custom_labels`);
  2. Backend container label set rendered in live compose for each app;
  3. Service target naming, internal port declarations, network attachments, provider registration consistency.
- **Production (working path)**:
  - backend registration is coherent:
    - router rules, service names, and backend registration labels are aligned on the same routing model;
    - domain binding object is present (`docker_compose_domains` contains backend domain);
    - smoke `/panel/login` = `HTTP 200`.
- **Canary (failing path)**:
  - registration is split across two models:
    - app-level generated labels in `custom_labels` reference services `http-0-*` / `https-0-*` on port `80`;
    - backend compose labels from patch define different service identity `backend-$UUID` on port `3000`;
    - canary keeps `docker_compose_domains=null` (unlike production).
- **Exact upstream mismatch**:
  - **provider registration state is inconsistent for canary**:
    - router/service selection path is not singular and resolves to an upstream set with no available server for the matched host;
    - break occurs at `service selection -> backend upstream availability`.
- **Batch result**:
  - mismatch is fixable (registration model must be unified);
  - smoke gate can be retried **only after** registration consistency is restored on canary.

Phase 2A / Batch 1D-B-PARITY-DIFF state (2026-04-21 follow-up):

- **Executed (parity-only fix/retry), gate not passed**:
  - applied minimal parity patch in repo:
    - commit `33f2b4a` (`fix: prioritize backend routers for canary host collision`);
    - patch adds explicit backend router priorities for canary compose backend labels.
  - forced canary deploy completed:
    - deployment `w100m82bw61dpk258ckxam6x` -> `finished`;
    - canary app stays `running:healthy`.
  - repeated canary smoke:
    - `https://kp89plobh43b17o0r1f6jrcn.dev.breachrabbit.ru/panel/login` -> `HTTP 503`,
    - response body: `no available server`.
- **Exact missing parity items (production vs canary)**:
  1. `docker_compose_domains`:
     - production: populated with backend domain binding;
     - canary: `null`.
  2. backend routing registration model:
     - production runtime stays on canonical model tied to populated compose-domain metadata;
     - canary still carries mixed routing metadata (`custom_labels` service graph + compose backend service graph).
  3. service target parity remains incomplete:
     - canary router path still resolves to a backend-upstream-unavailable state (`no available server`) despite healthy containers.
- **Conclusion for this batch step**:
  - parity patch was **insufficient**;
  - ingress gate remains blocked;
  - Batch 1D-B decision cannot resume yet.

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

Status: **Phase 1 closed + Phase 2A Batch 0/1A completed; Batch 1B failed on legacy app path and rolled back; Batch 1C proof passed; Batch 1D-A prepared; Batch 1D-B executed as canary but blocked by ingress smoke gate**.

---

## 11) Phase 2A / Batch 1D-B — Canary Cutover Execution (Result)

Scope executed:

1. controlled canary execution on clean recreated app path (no production source switch);
2. immediate smoke-check on canary endpoint;
3. keep/rollback decision according to gates.

### 11.1 Canary execution facts

- canary app: `brlabs-cutover-test-1c` (`kp89plobh43b17o0r1f6jrcn`);
- source binding (unchanged from proven clean path):
  - `breachrabbit/brlabs.hrlab:main`;
- latest deployment:
  - `l9lxwlmkkywo4233l2oqdw30`,
  - `status=finished`;
- app runtime status after deploy:
  - `running:healthy`.

### 11.2 Immediate smoke-check facts

Canary endpoint checks:

- `https://kp89plobh43b17o0r1f6jrcn.dev.breachrabbit.ru/panel/login`
  - response: `HTTP/2 503`
  - body: `no available server`.

Production endpoint control check:

- `https://tunnel.hiddenrabbit.net.ru/panel/login`
  - response: `HTTP/2 200`.

### 11.3 Gate decision

- Batch 1D-B pass: **No** (failed canary ingress smoke gate).
- Rollback needed: **No** for production path (no production traffic/source switch in this batch).
- Batch 2 readiness: **No** (blocked until canary ingress path is healthy).

### 11.4 Next required action (still in cutover scope)

1. fix canary ingress/routing binding for recreated app;
2. re-run Batch 1D-B smoke gates on canary endpoint;
3. only after clean canary smoke, open decision on production cutover continuation.

---

## 13) Phase 2A / Batch 1D-B-INGRESS — Canary Ingress/Router Binding (Result)

Scope executed (strict):

1. inspect canary ingress/router/service binding surfaces;
2. patch only ingress-related canary binding inputs;
3. rerun smoke-check only for `/panel/login`.

### 13.1 Facts captured

- Canary app: `brlabs-cutover-test-1c` (`kp89plobh43b17o0r1f6jrcn`).
- Canary runtime after deploy:
  - deployment `bti18wddqxc17kt4euv66hnp` -> `finished`;
  - app status -> `running:healthy`.
- Canary smoke (post-fix attempt):
  - `https://kp89plobh43b17o0r1f6jrcn.dev.breachrabbit.ru/panel/login`
  - result: `HTTP/2 503`
  - body: `no available server`.
- Production control:
  - `https://tunnel.hiddenrabbit.net.ru/panel/login` -> `HTTP/2 200`.

### 13.2 Ingress-only remediation attempted

- Re-checked canary vs production app/env surfaces in Coolify.
- Added/verified canary binding env inputs:
  - `SERVICE_URL_BACKEND=https://kp89plobh43b17o0r1f6jrcn.dev.breachrabbit.ru`
  - `SERVICE_FQDN_BACKEND=kp89plobh43b17o0r1f6jrcn.dev.breachrabbit.ru`
- Forced redeploy completed successfully (`finished`) on target repo commit path.
- Post-deploy ingress behavior remained unchanged (`503 no available server`).

### 13.3 Gate decision

- Ingress gate cleared: **No**.
- Smoke gate passed: **No**.
- Batch 1D-B decision can resume: **No** (still blocked at canary ingress gate).
- Rollback required: **No** (production app/source binding unchanged).

### 13.4 Blocker classification (current)

- Blocker type: ingress/router-to-service mapping mismatch on canary app object.
- Observed pattern:
  - application is healthy at container level;
  - public ingress still has no available upstream server.
- This remains within Migration Cutover scope and is unresolved for Batch 1D-B continuation.

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

## 9) Phase 2A / Batch 1B-AUTH — Private Repo Access Gate

Scope: auth/integration verification only (no Batch 1B retry, no Batch 2).

### 9.1 Coolify integration facts (current)

From app `ymi9vwwf438y5ozeh0kwhklf`:

- `source_type = App\\Models\\GithubApp`
- `source_id = 0`
- `private_key_id = null`
- `manual_webhook_secret_github/gitlab/bitbucket/gitea = null`
- current binding remains rollback-safe:
  - `git_repository = breachrabbit/CELERITY-panel.git`
  - `git_branch = main`
  - app status `running:healthy`.

### 9.2 GitHub target repo facts

For `breachrabbit/brlabs.hrlab`:

- repo visibility: `private`;
- branch `main` exists;
- hooks: `0`;
- actions secrets: `0`;
- actions variables: `0`;
- environments: `0`;
- recent workflow runs exist and are unrelated to Coolify clone auth path (`Docker Hub` failures).

### 9.3 Direct access proof status

Previously captured hard failure on Coolify helper clone probe:

- `git ls-remote https://github.com/breachrabbit/brlabs.hrlab.git refs/heads/main`
- `fatal: could not read Username for 'https://github.com': No such device or address`

This remains the authoritative proof that private repo access is not yet configured for Coolify in current state.

### 9.4 Installation/scope introspection limits

Attempted GitHub API installation introspection:

- `GET /repos/breachrabbit/brlabs.hrlab/installation` -> `401` (`JSON web token could not be decoded`);
- `GET /user/installations` -> `403` (requires GitHub App-authorized token).

Meaning:

- current operator token can audit repo-level facts but cannot directly list/validate Coolify GitHub App installation scope.
- provider auth must be fixed/verified in Coolify GitHub integration UI (or with an app-authorized token).

### 9.5 Gate decision

- Batch 1B-AUTH gate: **Not cleared**
- Can we prove `Coolify can access breachrabbit/brlabs.hrlab` now? **No**
- Is retry Batch 1B ready? **No**

Required before retry:

1. ensure Coolify GitHub App/token has explicit access to private repo `breachrabbit/brlabs.hrlab`;
2. verify `git ls-remote` from Coolify helper path succeeds;
3. only then re-open Batch 1B retry.

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

---

## 10) Phase 2A / Batch 1B-GRANT — Private Repo Access Grant Repair

Scope: grant/auth repair only (no Batch 1B retry, no Batch 2, no cleanup, no feature-work).

### 10.1 GitHub-side access evidence

Using app installation visibility:

- installed account: `breachrabbit`;
- installation id: `109424007`;
- target repository is present in installation-search scope:
  - `breachrabbit/brlabs.hrlab` (private, `main`).

This confirms target repo availability at GitHub app installation surface used by current integration tooling.

### 10.2 Coolify-side binding facts (post-gate check)

For app `ymi9vwwf438y5ozeh0kwhklf`:

- source binding is still rollback-safe old path:
  - `git_repository=breachrabbit/CELERITY-panel.git`
  - `git_branch=main`;
- integration markers remain:
  - `source_type=App\\Models\\GithubApp`
  - `source_id=0`
  - `private_key_id=null`
  - `manual_webhook_secret_* = null`.

### 10.3 Control-surface limitation found

Current available Coolify control surface provides:

- read application/deploy/env state;
- trigger deployment;
- env create/update.

Current available control surface does **not** provide:

- GitHub provider re-authorization action;
- repository grant assignment inside provider mapping;
- source integration rebind mutation endpoint.

Result: grant repair cannot be completed programmatically from the current automation channel alone.

### 10.4 Gate decision

- Batch 1B-GRANT gate: **Not cleared**
- Is retry Batch 1B ready? **No**
- Batch 2 readiness: **No**

### 10.5 Required operator action before retry Batch 1B

In Coolify UI/provider settings:

1. Re-authorize GitHub integration used by this app.
2. Ensure installation/repo selection explicitly includes:
   - `breachrabbit/brlabs.hrlab`.
3. Re-open app source selector and verify target repo is selectable.
4. Keep source unchanged until this check is complete, then re-open Batch 1B retry gate.

---

## 11) Phase 2A / Batch 1C — Clean Test App Proof

Scope: create isolated temporary app and validate target-repo deploy path without touching production app.

### 11.1 Temporary app created (clean path only)

Created new temporary Coolify application:

- app name: `brlabs-cutover-test-1c`
- app UUID: `kp89plobh43b17o0r1f6jrcn`
- project/env/server/destination:
  - `spnla5m89uta9ekk4pcssbbi` / `dhhkm1hgi6u0wu5gcj13ai0i`
  - server `b12livcyx9yv572q0fpgvi22`
  - destination `rzbup3wambhp8oxbpftvukki`
- source binding at creation:
  - Git Source (`GithubApp`): `brlabs-coolify` (`pv2un348vnk4ul5wc7wglze3`)
  - repo: `breachrabbit/brlabs.hrlab.git`
  - branch: `main`

No source-switch action was performed on the production app object.

### 11.2 Validation checklist (Batch 1C target)

Validated by API/log evidence:

1. Branches/tags/workflow/settings in target repo:
   - branches: `main`
   - tags: `v1.1.0`, `v1.0.0`
   - workflows: `.github/workflows/docker.yml`
   - actions settings: `enabled=true`, `allowed_actions=all`
2. Repo selectable/bindable in Coolify clean app path: **Yes**
3. Git access and clone: **Success**
   - helper log includes successful:
     - `git ls-remote ... breachrabbit/brlabs.hrlab.git refs/heads/main`
     - `git clone ... breachrabbit/brlabs.hrlab.git`
4. Build/deploy path: **Success**
   - deployment UUID: `uj76bwxvjnoe6uxfbb0gsifx`
   - status: `finished`
5. Minimal smoke proof: **Success**
   - app status: `running:healthy`
   - startup logs show panel boot and listener on `:3000`

### 11.3 Batch 1C conclusion

1. Batch 1C passed: **Yes**
2. Legacy app-state bug hypothesis: **Supported by evidence**
   - old app source-switch path failed on private repo auth;
   - clean new app path with same target repo/source succeeds end-to-end.
3. Safest next migration path:
   - **Recreate path (recommended)** for production cutover;
   - retrying old app source-switch path is higher risk and not recommended as primary strategy.

---

## 12) Phase 2A / Batch 1D-A — Production Recreate / Canary Cutover Plan (Planning Only)

Scope: plan only, no production modifications.

### 12.1 Controlled recreate path design

Primary strategy (based on Batch 1C proof):

1. Create new production-target app object (clean path) using:
   - Git Source: `brlabs-coolify`;
   - Repo: `breachrabbit/brlabs.hrlab`;
   - Branch: `main`.
2. Mirror production app configuration as a parity baseline:
   - Docker compose location/build pack;
   - env and secret set;
   - health-check profile;
   - network/destination/server placement.
3. Keep legacy production app live and untouched during canary stage.
4. Run full canary validation on new app before any traffic switch.

### 12.2 Canary cutover checklist

#### A) Domain / ingress handling

- [ ] define canary FQDN and verify TLS issuance;
- [ ] ensure no host-rule collision with current production router;
- [ ] verify ingress labels/middlewares parity;
- [ ] predefine traffic-switch method (DNS/host rule swap) and TTL strategy.

#### B) Env/secrets parity

- [ ] export current production env key inventory (names only + required/optional classification);
- [ ] replicate all required secrets to canary app;
- [ ] explicitly compare security-sensitive keys:
  - `SESSION_SECRET`,
  - `ENCRYPTION_KEY`,
  - `MONGO_PASSWORD`,
  - `REDIS_PASSWORD`;
- [ ] verify no fallback to legacy repo URLs in runtime vars.

#### C) Volume / persistent state review

- [ ] list current production persistent volumes and their functional purpose;
- [ ] classify each state object:
  - shared-safe,
  - must-migrate,
  - must-not-share;
- [ ] define canary data strategy (isolated vs reused) per volume type;
- [ ] define backup snapshot timing before traffic switch.

#### D) Deploy gates (technical)

- [ ] target repo clone success from helper logs;
- [ ] image build success;
- [ ] containers start and health status = `running:healthy`;
- [ ] app startup logs show expected services initialized.

#### E) Smoke gates (functional)

- [ ] `/panel/login` reachable;
- [ ] `/panel/nodes` renders and data loads;
- [ ] one Xray onboarding smoke reaches `completed/ready`;
- [ ] one Hysteria onboarding smoke reaches `completed/ready`;
- [ ] cascade create/reconnect/delete + standalone auto-restore sanity;
- [ ] subscription access sanity.

### 12.3 Rollback plan (instant revert model)

#### Instant revert conditions

- canary deploy fails any technical gate;
- smoke gates show onboarding/runtime regression;
- ingress switch introduces login/API instability;
- unexpected node/cascade continuity drift.

#### Rollback trigger points

1. Pre-switch (canary validation stage) -> abort canary, keep legacy production unchanged.
2. During traffic switch -> immediate route/DNS rollback.
3. Post-switch soak window -> revert to legacy production app if SLO/error gates fail.

#### Rollback procedure

1. stop traffic shift and restore previous ingress binding;
2. re-activate last healthy production deploy pointer if needed;
3. confirm legacy production health (`/panel/login`, `/panel/nodes`);
4. capture incident diff:
   - deploy ids,
   - failing smoke step,
   - logs snippet;
5. freeze cutover execution and return to planning gate.

### 12.4 Go / No-Go gates for Batch 1D-B execution

Go only if all are true:

- [ ] clean new production-target app is created and fully configured;
- [ ] env/secrets parity checklist is complete and reviewed;
- [ ] domain/ingress plan is conflict-free and reversible;
- [ ] canary technical + functional smokes are green;
- [ ] rollback path is tested and operator-ready;
- [ ] production continuity constraints explicitly signed off.

No-Go if any is true:

- [ ] missing secret/env parity;
- [ ] unknown persistent-state sharing behavior;
- [ ] unresolved onboarding smoke fail on canary;
- [ ] rollback path not testable within target RTO.

---

## 2026-04-21 — Phase 2A / Batch 1D-B-REGISTRY-CONSISTENCY (execution result)

Scope (strict):
- determine canonical registration model from production truth;
- normalize canary to one registration model;
- re-register backend;
- retry canary smoke `/panel/login`.

### Production truth (canonical model)

From live production app (`ymi9vwwf438y5ozeh0kwhklf`) inspection:
- `docker_compose_domains` is populated (`{"backend":{"domain":"https://tunnel.hiddenrabbit.net.ru"}}`);
- backend service carries concrete host router/service labels generated for `backend` target;
- ingress/service routing is anchored to backend service registration (not only app-level generic labels).

Canonical conclusion:
- production-consistent model is **compose-domain backed service registration** (backend-bound routers/services).

### Canary normalization executed

Canary app (`kp89plobh43b17o0r1f6jrcn`) was normalized to a single model by removing compose-level backend label set from repo compose and redeploying:
- code commit: `bafa619` (`fix: remove conflicting compose-level backend registration labels`);
- deployment: `zzgc3er4fhe07itupo5nus0v` (finished, app healthy).

### Smoke result

Canary smoke after deploy:
- `curl -I https://kp89plobh43b17o0r1f6jrcn.dev.breachrabbit.ru/panel/login`
- result: **HTTP 503**.

### Exact remaining mismatch

After normalization and redeploy:
- canary still has `docker_compose_domains=null`;
- canary backend does not receive production-style backend host registration set;
- live trace remains breaking at `router -> service -> upstream availability` for canary host.

So, current canary model is still not production-equivalent for backend registration path.

### Gate status

- Registration normalized: **partially** (single-model canary state achieved, but not production-canonical model).
- Smoke became HTTP 200: **No** (still 503).
- Batch 1D-B decision resume: **No** (ingress smoke gate remains blocked).
