# Development Log

## 2026-04-20 Migration Cutover Audit — External Surface Closure

- Completed the external verification part of Phase 1 (audit-only scope, no cleanup/feature work):
  - GitHub endpoint checks for both repositories:
    - `breachrabbit/CELERITY-panel`
    - `breachrabbit/brlabs.hrlab`
  - verified counts for:
    - Actions secrets,
    - Actions variables,
    - webhooks,
    - environments,
    - releases.
- Captured cutover-critical GitHub facts:
  - target repo `breachrabbit/brlabs.hrlab` exists and is private, but currently empty;
  - both repos currently report `releases=0` (release-channel strategy is a hard gate).
- Completed external Coolify audit for production stand binding:
  - app UUID `ymi9vwwf438y5ozeh0kwhklf` (`celerity-panel-tunnel`) is still bound to `breachrabbit/CELERITY-panel.git` (`main`);
  - deployment logs still clone from old source path;
  - cutover-relevant env still points runtime channel to:
    - `CC_AGENT_RELEASE_BASE=https://github.com/breachrabbit/CELERITY-panel/releases`
    - `CC_AGENT_RELEASE_TAG=latest`.
- Updated audit artifacts:
  - `docs/MIGRATION-CUTOVER-AUDIT-2026-04-20.md`
    - added external GitHub/Coolify evidence,
    - added artifact/release dependency closure,
    - added final cutover micro-batch checklist,
    - added explicit rollback gates and cutover blockers.
  - `docs/CUTOVER-RISK-REGISTER.md`
    - refreshed risk impact/likelihood/status with blocker-level rows for:
      - empty target repo,
      - old Coolify source binding,
      - release-channel zero-artifact state.
- Scope guard respected:
  - no cleanup wave,
  - no builder/UI/Hysteria feature wave,
  - docs/audit-only update.

Change types:

- `docs` — external cutover evidence closure and risk/checklist hardening
- `ops` — rollback-gate and blocker formalization

## 2026-04-20 Migration Cutover Audit Kickoff (Phase 1)

- Updated continuity governance to cutover-first model:
  - added `docs/START-HERE.md`;
  - updated `docs/ISOLATED-PROJECT-RULE.md` with:
    - cutover critical rule,
    - fixed active order,
    - permanent operating laws;
  - updated `docs/SESSION-HANDOFF.md` with mandatory session output template and new cutover stop-point block;
  - aligned `docs/PROJECT-BASELINE.md` and `docs/ROADMAP.md` with cutover-first constraints.
- Added mandatory cutover risk register:
  - `docs/CUTOVER-RISK-REGISTER.md` (Risk/Impact/Likelihood/Mitigation/Rollback/Status).
- Started and documented Phase-1 Migration Cutover Audit:
  - `docs/MIGRATION-CUTOVER-AUDIT-2026-04-20.md`;
  - completed initial pass of required layers:
    - Remote/Repo Audit;
    - Identity Residue Sweep;
    - Runtime Dependency Audit;
    - Production Continuity Audit;
    - Rollback Plan (draft v1).
- Collected hard evidence of unresolved cutover blockers:
  - remotes still point to legacy-named repo and ClickDevTech upstream;
  - workflow/image/package/readme surfaces still contain legacy identity traces;
  - installer/runtime source defaults still use `breachrabbit/CELERITY-panel` path and require controlled migration.

Change types:

- `docs` — cutover governance and audit artifact layer
- `ops` — migration risk framing + rollback-first planning

## 2026-04-20 Master Report Consolidation (Full Fork Delta)

- Added a full consolidated report of fork evolution vs original Celerity:
  - file: `docs/HIDDEN-RABBIT-FORK-FULL-REPORT-2026-04-20.ru.md`;
  - report includes:
    - full delta baseline and metrics (`243` commits, changed files/LOC),
    - subsystem-by-subsystem breakdown (onboarding, cascades, builder, UI, HAPP, security, ops),
    - original/early bugs fixed with commit references,
    - implemented innovations and current in-progress areas,
    - upstream `v1.1.0` audit status and planned adaptation waves,
    - chronological milestone appendix.
- Report prepared as a standalone source document for the next rules/governance phase and future planning.

Change types:

- `docs` — full project retrospective and technical/product delta capture

## 2026-04-18 Hybrid-by-default + Topology Reconcile Automation + Remote Cleanup

- Shipped automation wave to reduce manual operator actions around cascade/node lifecycle:
  - commit: `19d8e6a` (`feat: automate cascade topology reconcile and cleanup flows`).
- Hybrid cascade sidecar behavior normalized to always-on policy:
  - removed operational dependence on per-node sidecar enable toggle in form/settings paths;
  - runtime/cascade service paths now enforce hybrid behavior by default where feature is enabled.
- Added topology reconcile orchestration after cascade link changes:
  - create/reconnect/delete link APIs and builder commit now queue background topology reconcile;
  - reconcile updates roles, auto-restores detached nodes to standalone runtime, and deploys affected chain/runtime updates.
- Added remote node cleanup before panel delete:
  - new cleanup path removes/stops `cc-agent`, cascade sidecar/bridge artifacts, stale dirs and reloads systemd;
  - related cascade links are undeployed/deleted and neighbor reconcile is queued.
- Users-page UX:
  - added delete button/action to users list/cards with in-app confirm.
- Local validation:
  - syntax checks passed on modified backend/frontend JS;
  - locale JSON validation passed.
- Operational note:
  - commit is in `main`; stand requires final visual/regression verification pass for this exact wave.

Change types:

- `stability fix` — automated role/runtime transitions and delete-time cleanup
- `local patch` — sidecar always-on policy + users delete action
- `ops` — reduced manual reconfigure/redeploy steps after cascade topology edits

## 2026-04-18 Agent Source Guardrail (Legacy URL Auto-Rewrite)

- Closed ambiguity where installer logs could still show legacy ClickDevTech release URL in some runs.
- Hardened `cc-agent` install script generation in:
  - `src/services/nodeSetup.js`
- Added second-layer safety net directly in generated shell script:
  - if resolved `GITHUB_URL` matches legacy source
    (`github.com/ClickDevTech/(CELERITY-panel|hysteria-panel)/releases`),
    it is force-rewritten to Hidden Rabbit fork release URL.
- Added deterministic mirror URL generation from the final resolved `GITHUB_URL`
  (so mirrors cannot remain pointed to legacy source if primary URL gets rewritten).
- Kept this as isolated code-only patch for quick rollout and verification.
- Code commit:
  - `6c10ce5` — `fix: enforce hidden rabbit fallback for legacy agent release urls`

Change types:

- `stability fix` — remove legacy source leakage at runtime
- `local patch` — installer-side URL sanitization and mirror regeneration

## 2026-04-18 Agent Source Fix + Onboarding Completed-State Cleanup

- Fixed cc-agent install source to use Hidden Rabbit fork release channel by default:
  - `config.js`:
    - added `CC_AGENT_RELEASE_BASE` (default `https://github.com/breachrabbit/CELERITY-panel/releases`);
    - added `CC_AGENT_RELEASE_TAG` (default `latest`).
  - `src/services/nodeSetup.js`:
    - replaced hardcoded upstream download URLs (`ClickDevTech/...`) with config-driven release URL;
    - retained proxy mirrors only when base URL is GitHub-based;
    - added explicit setup log line:
      - `Agent release source: ...`
    - this removes ambiguous installer logs pointing to original repository.
- Fixed misleading onboarding diagnostics for completed jobs:
  - `src/services/nodeOnboardingService.js`:
    - `completeJob(...)` now clears both `readyState.lastError` and `job.lastError`.
  - `src/routes/panel/nodes.js`:
    - setup-status now suppresses error payload when mapped state is `success`;
    - onboarding payload also receives sanitized `lastError` for success state.
  - `views/partials/node-form/scripts.ejs`:
    - completed onboarding jobs no longer render stale red error banner in jobs summary;
    - diagnostic copy text no longer prints top-level error line for completed jobs.
- Added env docs for operator control:
  - `docker.env.example` now includes `CC_AGENT_RELEASE_BASE` and `CC_AGENT_RELEASE_TAG`.

Change types:

- `stability fix` — remove stale error state leakage into completed onboarding UX
- `local patch` — switch installer source to fork-controlled agent releases
- `ops` — configurable agent release channel/tag

## 2026-04-18 Live Smoke Verification (Xray + Hysteria) and Deploy Source Check

- Revalidated stand asset versioning on live endpoints:
  - `/panel/login` and `/panel/nodes` both serve versioned assets:
    - `/css/style.css?v=1776518691049`
    - `/js/app.js?v=1776518691049`
- Forced Coolify deployment trigger path rechecked:
  - direct API checks to `http://89.125.188.83:8000/api/v1/version` with available tokens returned `Unauthenticated`;
  - operational note: forced redeploy is currently token-blocked, not runtime-blocked.
- Executed fresh durable onboarding smoke via API (Xray):
  - node: `69e205b5ab80ea2b34cdf1c5`;
  - created job: `69e38b4802ba24c7ddbbefee`;
  - `run-full` result: `completed`, `ready`;
  - `verify-runtime-local`: `completed`, attempt `1`, no offline loop.
- Executed fresh durable onboarding smoke via API (Hysteria/problem node):
  - node: `69e013bee8728d388e89c4df`;
  - created job: `69e38adc02ba24c7ddbbef49`;
  - `run-full` result: `completed`, `ready`;
  - `verify-runtime-local`: `completed`, attempt `1`, no step hang.
- Verified panel setup-status now returns success for the previously problematic node after rerun.

Change types:

- `validation` — live Xray/Hysteria onboarding parity recheck
- `ops` — deploy trigger auth-path verification

## 2026-04-18 Onboarding UX + Runtime Offline Hardening (Wave 2, local patch prepared)

- Removed accidental form-submit behavior from node management actions:
  - updated `views/partials/node-form/management.ejs` to use explicit `type="button"` for setup/onboarding/log/status actions.
- Refined auto-setup confirmation UX:
  - `views/partials/node-form/scripts.ejs` now calls `hrConfirm` with explicit modal title/confirm/cancel texts for setup start.
- Added static asset cache-busting to avoid stale JS/CSS after deploy:
  - `index.js`: added `assetVersion` local;
  - versioned static includes in:
    - `views/layout.ejs`,
    - `views/login.ejs`,
    - `views/setup.ejs`,
    - `views/totp-verify.ejs`,
    - `views/cascade-builder.ejs`.
- Hardened Xray log permission fallback for onboarding/setup:
  - `src/services/nodeSetup.js`: fallback to permissive log-file mode when ownership cannot be applied;
  - `src/services/nodeOnboardingHandlers.js`: same fallback in `prepare-host` and verify recovery path.
- Improved runtime failure diagnostics:
  - `verify-runtime-local` now appends recent runtime journal tail (`xray`/`hysteria`) when status remains offline.
- Nodes page fit tuning:
  - `public/css/style.css` and `views/nodes.ejs` updated to keep node table inside viewport with cleaner horizontal overflow handling.

Change types:

- `stability fix` — runtime offline/permission handling hardening
- `local patch` — setup/onboarding action UX behavior cleanup
- `ux` — in-app setup confirm polish + nodes table fit adjustments

## 2026-04-18 In-App Confirmation Layer + Onboarding Runtime Verify Hardening

- Replaced native browser confirm/alert interactions with in-app modal UX:
  - added global `hrConfirm/hrAlert` in `public/js/app.js`;
  - added modal styles in `public/css/style.css`;
  - migrated node setup/onboarding, node delete, settings maintenance, API keys, webhook validation, group delete, dashboard restore, user-detail actions, network actions, and outbounds actions.
- Hardened Xray onboarding runtime verification:
  - `src/services/nodeSetup.js`:
    - status checks now use cleaned `systemctl is-active ... 2>/dev/null` and robust state parsing;
    - status methods return structured `{ online, status, error }`.
  - `src/services/nodeOnboardingHandlers.js`:
    - increased verify retries (`12`);
    - added runtime self-heal path for xray log permission/startup errors with before/after state telemetry.
- Hardened Xray log file ownership/permissions:
  - moved to dynamic service user/group detection and tighter file mode (`640`) in install/repair paths.
- Nodes page fit improvement:
  - tightened nodes table min-width and wrapper overflow behavior.
- Code commit:
  - `d005be8` — `fix: replace native confirms and harden onboarding runtime checks`.

Change types:

- `local patch` — unified in-app confirms/alerts across panel actions
- `stability fix` — reduced false-negative runtime verify failures for Xray onboarding
- `ux` — table fit and confirmation flow consistency

## 2026-04-18 Cascade Builder UX Wave: Smooth Links + Internet Egress + Fullscreen

- Refined builder canvas rendering/interaction:
  - file: `public/js/cascade-builder.js`;
  - switched hop links to smooth bezier edges with port endpoint alignment;
  - restored virtual `Internet` node directly on canvas and auto-built virtual egress links for terminal nodes;
  - pinned `Internet` node to viewport anchor (not drifting with node drag);
  - added active link flow animation (`builder-flow-animated` + dash offset update timer);
  - added connect-error canvas tooltip with fix hint mapping by validation code;
  - added bounded fit function for real topology only (ignores virtual internet decorations);
  - wired fullscreen mode for builder workspace and `Esc` exit.
- Updated builder UI shell:
  - file: `views/cascade-builder.ejs`;
  - added fullscreen button in canvas toolbar;
  - added canvas-level error tooltip container;
  - reordered inspector blocks to surface validation/internet/preview ahead of deep inspector content.
- Updated builder styles:
  - file: `public/css/cascade-builder.css`;
  - bounded workspace height with viewport clamp;
  - fullscreen overlay style and body scroll lock;
  - tooltip visuals for light/dark themes.
- Locale additions:
  - files: `src/locales/ru.json`, `src/locales/en.json`;
  - new keys for fullscreen labels and connect helper prompts.
- Released code commit:
  - `1c09545` — `feat: refine cascade canvas flow lines and internet egress UX`.
- Deployed to stand:
  - deployment UUID: `n4dzgdhmg8wpekxttn45gmx7`;
  - status: `finished`;
  - app state: `running:healthy`.

Change types:

- `local patch` — cascade builder interaction/rendering improvements
- `ux` — bounded canvas/fullscreen/error tooltip and internet egress visibility
- `deployment` — stand redeploy with healthy verification

## 2026-04-18 UDP Verify Hardening + Live Smokes to Completed + Builder Port Anchors

- Hardened Hysteria UDP runtime verification in onboarding runtime setup:
  - file: `src/services/nodeSetup.js`;
  - strengthened UDP/TCP listener probe matching (`ss`/`netstat`);
  - added UDP fallback path:
    - if socket probe is inconclusive but service is `active` and no bind/listen errors are found in diagnostics, runtime step proceeds;
  - added explicit port-hopping decision log line:
    - `enabled/sameVps/range`;
  - added fallback acceptance log line for easier operator diagnostics.
- Fixed cascade builder connector anchoring/behavior:
  - file: `public/js/cascade-builder.js`;
  - removed lock on synthetic port nodes so they can follow node position sync;
  - switched rendered hop edges to port endpoints:
    - source -> `out` port,
    - target -> `in` port.
- Released code commit:
  - `07ed7a7` — `fix: harden hysteria udp verify and bind builder ports to nodes`.
- Deployed to stand:
  - deployment UUID: `e4abcg0hscy1oo82it561ln8`;
  - status: `finished`;
  - app state: `running:healthy`.
- Re-ran required live onboarding smokes (durable `onboarding-full`):
  1. remote Hysteria smoke (`194.50.94.149`, `portRange=23000-23080`):
     - onboarding job: `69e30aae68f673fa6df1dba3`;
     - final status: `completed`;
     - no `repairable`.
  2. same-VPS Hysteria smoke (`89.125.188.83`, auto port `8443`, `portRange=22000-22050`):
     - onboarding job: `69e30f0268f673fa6df1dca0`;
     - final status: `completed`;
     - no `repairable`.
- Verified expected log behavior:
  - remote run shows port-hopping apply path;
  - same-VPS run shows explicit skip line;
  - both runs can now pass runtime step without false UDP-listener fail.
- Stand cleanup:
  - removed temporary smoke nodes created for this run.

Change types:

- `stability fix` — Hysteria UDP runtime verification false-negative elimination
- `local patch` — builder connector anchoring and edge endpoint mapping
- `validation` — two live onboarding smokes completed without repairable status

## 2026-04-18 Live Onboarding Smokes + Parser Crash Fix

- Fixed onboarding live-log parsing crash in panel setup route:
  - removed undefined helper usage during step detection for bracket-prefixed log lines;
  - file: `src/routes/panel/nodes.js`;
  - code commit: `2d3d12c`.
- Deployed commit to stand:
  - deployment UUID: `gfh5tc7t040l9x96ne3b184t`;
  - status: `finished`, app `running:healthy`.
- Ran two live durable onboarding smokes (Hysteria):
  1. remote node with portRange (`194.50.94.149`, `23000-23080`);
  2. same-VPS node with portRange (`89.125.188.83`, `22000-22050`).
- Practical log observations:
  - remote smoke confirmed port-hopping apply path:
    - `Setting up port hopping (...)`,
    - INPUT/NAT apply lines in logs;
  - same-VPS smoke did not show explicit skip-port-hopping line yet.
- Both smokes currently stop at `install-runtime` with:
  - `UDP port <port> is not listening after service start`,
  while node runtime status can still become `online` afterward.
- Cleanup:
  - removed temporary smoke nodes from panel after run.

Change types:

- `stability fix` — onboarding log parser crash fix in panel setup path
- `validation` — live smoke verification for remote/same-VPS Hysteria onboarding

## 2026-04-17 Upstream Audit Finalized + Safe-Port Batches #2/#3

- Completed full categorized shortlist for upstream release train:
  - `docs/UPSTREAM-V1.1-AUDIT-SHORTLIST.md` now contains final decisions:
    - `take now`,
    - `take with adaptation`,
    - `skip`,
    with category tags `security/stability/UX/infra`.
- Safe-port batch #2 delivered:
  - pre-setup `initScript` field for nodes (adapted for durable onboarding/runtime path);
  - local code commit: `ac88f5e`.
- Safe-port batch #3 delivered:
  - hardened Hysteria port-hopping rule application:
    - idempotent INPUT/NAT rules (`-C` checks + clean old INPUT rules),
    - same-VPS skip for port-hopping in runtime setup;
  - local code commit: `0418b6d`.
- Deployment/verification:
  - forced deploy `l3lbf0a84t4qtlk031uat7nk` finished;
  - stand status: `running:healthy`;
  - regression checks:
    - `/panel/login` -> HTTP 200,
    - `/panel/nodes/add` -> HTTP 200,
    - `/panel/cascades/builder` -> HTTP 200,
    - `/api/cascade-builder/state` -> HTTP 200,
    - `/api/nodes/:id/onboarding/jobs` -> HTTP 200.

Change types:

- `stability fix` — upstream safe-port reliability wave for node setup
- `infra` — finalized upstream audit shortlist and migration queue
- `deployment` — forced redeploy + stand regression verification

## 2026-04-17 Upstream v1.1.0 Audit Execution Started + Safe-Port Batch #1

- Started practical upstream delta execution for:
  - `https://github.com/ClickDevTech/CELERITY-panel/compare/v1.0.0...v1.1.0`.
- Implemented first safe backport batch:
  - users group filter cast to `ObjectId` in panel users route (`src/routes/panel/users.js`);
  - enabled outbound Xray stats collection in generated runtime config (`src/services/configGenerator.js`);
  - added panel compatibility with both agent `/stats` shapes in sync layer (`src/services/syncService.js`);
  - upgraded `cc-agent` stats endpoint to emit:
    - `users` traffic map;
    - node-level outbound totals (`node.tx/node.rx`);
  - hardened same-VPS Xray agent firewall mode (`src/services/nodeSetup.js`) for local/container subnet reachability.
- Released code commit:
  - `171b7a7` — `fix: backport v1.1 stats and harden same-vps agent firewall`.
- Forced stand deployment:
  - UUID: `bmx12mg6g80olqrzx6jpwd7z`;
  - status: `finished`;
  - app state: `running:healthy`;
  - endpoint check: `https://tunnel.hiddenrabbit.net.ru/panel/login` -> `HTTP 200`.
- Validation:
  - `node --check` for modified JS modules;
  - `go test ./...` for `cc-agent`.

Change types:

- `stability fix` — upstream v1.1.0 reliability/stats/firewall backport batch
- `deployment` — stand redeploy + health verification

## 2026-04-17 Upstream Delta Audit Task Queued (v1.0.0...v1.1.0)

- Added explicit upstream review checkpoint to continuity docs:
  - compare target: `https://github.com/ClickDevTech/CELERITY-panel/compare/v1.0.0...v1.1.0`.
- Port policy fixed for this fork:
  - prioritize stability/security fixes,
  - allow adaptation-only imports when safe,
  - skip noisy/non-useful upstream deltas.

Change type:

- `continuity` — upstream audit queue hardening

## 2026-04-17 Hysteria Onboarding Runtime Rewrite + Hybrid Always-On

- Reworked Hysteria runtime installation path in `src/services/nodeSetup.js`:
  - replaced legacy `INSTALL_SCRIPT` with hardened `HYSTERIA_INSTALL_SCRIPT`;
  - added installer retries across multiple sources;
  - added binary fallback downloads with mirror retries and executable sanity checks;
  - added fallback `hysteria-server.service` generation if no service unit exists.
- Added dedicated `setupHysteriaNode(...)` with:
  - live log streaming support (`onLogLine`) parity with Xray setup path;
  - stronger command error handling and explicit restart checks;
  - UDP listener verification after restart (`waitForListeningSocket`).
- Durable onboarding runtime step now explicitly calls `setupHysteriaNode(...)`:
  - `src/services/nodeOnboardingHandlers.js`.
- Setup default mode switched to durable onboarding for both entrypoints:
  - panel route default (`src/routes/panel/nodes.js`);
  - API route default (`src/routes/nodes.js`).
- Removed weak first-pass agent tolerance in legacy setup path:
  - switched Xray setup in panel/API routes from `strictAgent:false` to `strictAgent:true`.
- Moved hybrid cascade to always-on runtime policy:
  - `config.js`: `FEATURE_CASCADE_HYBRID` defaults enabled unless env explicitly false;
  - `index.js`: runtime settings reload now forces hybrid enabled;
  - `src/models/settingsModel.js`: hybrid flag default set to `true`;
  - settings save path now persists hybrid flag as enabled;
  - settings UI now shows hybrid as always enabled (informational state).
- Locale updates:
  - added RU/EN `settings.hybridCascadeAlwaysOnHint`.

Change types:

- `stability fix` — durable onboarding/runtime installer hardening for Hysteria
- `local patch` — setup mode defaults + strict agent checks + hybrid policy/UI cleanup

## 2026-04-17 Live Mixed-Run Validation + Hop-Focus Diagnostics

- Ran a real mixed cascade execution on stand (`success + failed` in the same run).
- Verified parity against persisted execution snapshot:
  - filters `All / Failed / Success` correctly scope chain cards;
  - failed-only TXT contains only failed chains;
  - failed-only JSON contains only failed chains and full `errorDetails`.
- Restored stand topology after QA run:
  - removed temporary mixed-run links and test fail node;
  - restored baseline active link state.
- Diagnostics depth increment (`4a48a53`):
  - improved node mention detection in chain errors;
  - expanded action mapping for faster repair/re-run workflow;
  - trimmed another safe non-critical legacy setup read in setup-status path.
- Hop-focus diagnostics increment (`23dd5f8`):
  - attached hop context (`hopId`/`hopName`) in `errorDetails` when message allows hop-level resolution;
  - added backend suggested action `focus-hop`;
  - wired frontend `focus-hop` action to canvas edge selection;
  - added RU/EN locale keys for hop-focus action and error feedback.
- Deployments:
  - `c11uk70kbde8fy6147kh72bh` (commit `4a48a53`) — finished, stand healthy;
  - `v1k0npe0ff1qk1gr8t7x4c6y` (commit `23dd5f8`) — finished, stand healthy.

Change types:

- `local patch` — cascade execution diagnostics precision and operator actions
- `stability fix` — safe staged retirement increment for legacy setup status reads

## 2026-04-17 Setup-Status Source Split + Cascade Failure Classifier Expansion

- Onboarding staged retirement increment (`src/routes/panel/nodes.js`):
  - added mode-aware onboarding job selector for setup-status;
  - setup-status now separates source preference:
    - onboarding-full -> durable onboarding state/logs,
    - legacy running setup -> legacy in-memory setup state/logs;
  - added explicit `statusSource` in setup-status API response (`onboarding` / `legacy` / `none`) to simplify UI diagnostics and future decoupling.
- Cascade diagnostics depth increment (`src/routes/cascadeBuilder.js`):
  - added new deploy failure classes:
    - `tls-handshake-failed`,
    - `agent-api-timeout`,
    - `port-bind-failed`,
    - `resource-limits`;
  - added localized hint mapping and suggested-action mapping for these classes;
  - updated critical-severity mapping for high-impact classes.
- Locale updates:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - new hint strings for the added error classes.
- Operational validation:
  - code commit: `891965a`;
  - forced Coolify deploy: `kcmqx0qbbogrwyz3ehms5u1a`;
  - deployment status: `finished`;
  - stand status: `running:healthy`.

Change types:

- `stability fix` — cleaner setup-status source resolution for durable vs legacy setup paths
- `local patch` — deeper cascade execution diagnostics and recovery hints/actions

## 2026-04-17 Real Mixed-Run Validation + Execution Diagnostics Deepening II

- Ran a real mixed execution on the live builder with both outcomes in one run:
  - at least one chain deployed successfully;
  - at least one chain failed with enriched diagnostics.
- Validated parity against persisted execution snapshot:
  - filter semantics (`All / Failed / Success`) align with result counts;
  - failed-only TXT export includes failed chains only;
  - failed-only JSON export includes failed chains only with full `errorDetails`.
- Backend diagnostics enrichment (`src/routes/cascadeBuilder.js`):
  - expanded failure classification for SSH/network/offline classes:
    - `ssh-timeout`,
    - `ssh-auth-failed`,
    - `ssh-connect-failed`,
    - `node-offline`;
  - added localized hint mapping for these classes;
  - enriched node-scope error payload with `nodeStatus`;
  - expanded suggested action generation (`check-ssh`, `check-network`) with dedupe.
- Frontend diagnostics rendering (`public/js/cascade-builder.js`, `views/cascade-builder.ejs`):
  - renders localized suggested actions in execution error-details;
  - displays node status in node-level diagnostic blocks.
- Locale coverage updated:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added suggested action labels and new hint families.
- Onboarding staged-retirement increment:
  - `src/routes/panel/nodes.js` now uses legacy-specific setup lookup in onboarding-full setup start log branch.
- Operational validation:
  - code commit pushed: `0f95459`;
  - forced Coolify deployment triggered for stand app;
  - stand health endpoint check via `/panel/login` returned HTTP 200.

Change types:

- `local patch` — deeper cascade execution diagnostics and operator guidance
- `stability fix` — safe incremental decoupling of onboarding-full from generic legacy setup mirror reads

## 2026-04-17 Cascade Failure Diagnostics Enrichment + Repair Action + Onboarding Guard Trim

- Cascade builder diagnostics were deepened for failed chain execution analysis.
- Backend (`src/routes/cascadeBuilder.js`):
  - added deploy failure classification (`code`, `severity`) with localized hints;
  - added suggested action generation for operator recovery;
  - enriched `errorDetails` structure for failed chains;
  - failed-only JSON export now includes `errorDetails` per failed chain.
- Frontend (`public/js/cascade-builder.js`, `views/cascade-builder.ejs`, `public/css/cascade-builder.css`):
  - execution cards now render failure code + hint + critical severity state;
  - added quick actions for failed chains:
    - `Repair node` (calls onboarding repair endpoint),
    - `Open node`.
- Locale updates:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added labels/messages for repair/open actions and hint families.
- Onboarding staged retirement increment (`src/routes/panel/nodes.js`):
  - durable/onboarding path now avoids accidental `setupJobs` bridge writes on live log append;
  - onboarding setup runner resolves legacy setup mirror only through legacy-specific lookup in setup-status/control path touches.
- Live stand verification:
  - commit `951f452` deployed via Coolify;
  - deployment finished successfully;
  - app state confirmed `running:healthy`.

Change types:

- `local patch` — cascade diagnostics depth + failed-chain repair UX
- `stability fix` — onboarding durable path further isolated from legacy in-memory setup mirror

## 2026-04-17 Cascade Diagnostics Deepening + Chain Rerun + Onboarding Guard Retirement Increment

- Expanded cascade execution diagnostics payload and UI with deeper context:
  - backend now emits structured `errorDetails` for deploy failures:
    - scope (`node` / `chain`);
    - parsed node context;
    - related hop hints where detectable.
- Added builder quick actions for failed chains:
  - `Focus node` (jump to start node in canvas);
  - `Retry chain` (one-click rerun via new API call).
- Added API endpoint:
  - `POST /api/cascade-builder/rerun-chain`
  - triggers `deployChain(startNodeId)` for selected chain;
  - returns enriched chain result;
  - persists rerun snapshot into `lastExecution.reruns` and `deployment.results[].lastRerun` where match exists.
- Extended execution card rendering:
  - error-details section;
  - inline actions block;
  - last rerun status block.
- Locales updated (`ru/en`) for new actions/status labels.
- Onboarding staged retirement increment (`src/routes/panel/nodes.js`):
  - removed legacy `setupJobs` running-guard influence from onboarding-full endpoints:
    - resume,
    - repair,
    - rerun-step;
  - in `/nodes/:id/setup`, legacy `setupJobs` duplicate-run guard now applies only when selected mode is `legacy`.

Change types:

- `local patch` — cascade execution diagnostics depth + operator quick actions
- `stability fix` — onboarding-full control-path less coupled to in-memory legacy guards

## 2026-04-17 Cascade Builder Compact Failed-Chains Export

- Added compact diagnostics export focused only on failed chain deploy results.
- UI updates:
  - `views/cascade-builder.ejs`: new execution action `Failed only`.
  - `public/js/cascade-builder.js`: new compact exporter that includes only failed chains with first error per chain.
- Existing exports preserved:
  - `Copy TXT` (full human-readable report),
  - `Copy JSON` (structured payload).
- Locale coverage:
  - `src/locales/ru.json`
  - `src/locales/en.json`

Change types:

- `local patch` — faster operator incident export for failed cascade chains

## 2026-04-17 Cascade Builder Diagnostics Export Modes (TXT/JSON)

- Extended execution diagnostics export in builder panel with dual operator-friendly modes:
  - `Copy TXT` (human-readable runbook text),
  - `Copy JSON` (structured payload for issue/automation pipelines).
- `views/cascade-builder.ejs`:
  - split export action into two separate buttons in execution panel.
- `public/js/cascade-builder.js`:
  - added `buildExecutionDiagnosticsPayload(...)` for stable JSON envelope;
  - extracted shared clipboard writer helper;
  - added explicit handlers for text/json export actions.
- `public/css/cascade-builder.css`:
  - execution header actions now wrap cleanly on narrow widths.
- Locale updates:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added labels and success message for JSON export.

Change types:

- `local patch` — cascade diagnostics export usability for operators

## 2026-04-17 Cascade Builder Execution Diagnostics Copy Action

- Added one-click diagnostics copy action in builder execution panel.
- UI updates:
  - `views/cascade-builder.ejs`: added copy button in execution box header;
  - `public/js/cascade-builder.js`: added text snapshot builder + clipboard copy handler;
  - `public/css/cascade-builder.css`: added compact header-actions layout.
- Locale coverage:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added copy button/feedback strings.

Change types:

- `local patch` — operator-friendly copy/export path for cascade execution diagnostics

## 2026-04-17 Onboarding-Full Status Path Decoupled from setupJobs

- Reduced in-memory `setupJobs` dependency for durable onboarding control path.
- `src/routes/panel/nodes.js`:
  - onboarding-full setup start no longer creates a `setupJobs` running state;
  - onboarding runner no longer writes onboarding success/failure into `setupJobs`;
  - onboarding branch in `/panel/nodes/:id/setup-status` now uses durable `stepLogs` directly and does not merge `setupJobs` logs;
  - added durable live-log appender to onboarding jobs (`appendStepLog`) with basic noise filtering for installer output.
- Legacy behavior preserved:
  - legacy setup flow still uses `setupJobs` and remains unchanged in this increment.

Change types:

- `stability fix` — onboarding-full status/control-path no longer depends on in-memory setup mirror
- `local patch` — durable live log append route for onboarding jobs

## 2026-04-17 Cascade Builder Commit/Deploy Execution Diagnostics

- Expanded commit/deploy diagnostics depth for the experimental cascade builder.
- Backend (`src/routes/cascadeBuilder.js`):
  - enriched deploy results with chain-level metadata:
    - chain mode,
    - start node,
    - hop names,
    - node actions,
    - deploy warnings/errors;
  - added normalized execution snapshot object (`execution`) returned by commit endpoint;
  - persisted `execution` as builder draft `lastExecution`.
- Draft storage/state:
  - `src/services/cacheService.js` now stores `lastExecution` in builder draft payload.
  - `src/domain/cascade-builder/flowNormalizer.js` now exposes `draft.lastExecution`.
- UI (`views/cascade-builder.ejs`, `public/js/cascade-builder.js`, `public/css/cascade-builder.css`):
  - added dedicated execution diagnostics panel under deploy preview;
  - panel shows run summary + per-chain details + failed draft items;
  - state survives reload because execution snapshot is persisted.
- Locales:
  - added execution-panel strings in `src/locales/ru.json` and `src/locales/en.json`.

Change types:

- `local patch` — richer cascade commit/deploy diagnostics payload and UI
- `stability fix` — persisted builder execution context across page refresh

## 2026-04-17 Docker-Safe Cascade Vendor Sync + Deploy Recovery

- Fixed deployment blocker introduced by local graph-vendor bundling:
  - Docker build installed dependencies before repo scripts were copied;
  - `postinstall` previously attempted to run `scripts/sync-cascade-vendors.js` too early and could fail.
- `package.json`:
  - made `postinstall` safe when sync script is not yet available in pre-copy Docker stage.
- `Dockerfile`:
  - added explicit `RUN npm run sync:cascade-vendor` after `COPY . .` to guarantee local builder graph assets in image.
- Deployment:
  - pushed commit `b43f75a`;
  - forced Coolify deploy completed successfully (`cnl0sdtlje3bzsojvqn6xpeq`);
  - application returned to `running:healthy`.

Change types:

- `stability fix` — Docker/Coolify build-order compatibility for cascade builder local vendor assets
- `local patch` — explicit post-copy vendor sync in container build

## 2026-04-17 Cascade Builder TLS/REALITY Draft Security Settings

- Extended draft-hop inspector with security-level fields:
  - common TLS/REALITY: `realitySni`, `realityFingerprint`;
  - REALITY-only: `realityDest`, `realityShortId`.
- Backend (`src/routes/cascadeBuilder.js`):
  - draft update path now validates/saves security fields and returns localized validation errors for invalid fingerprint/shortId;
  - commit bridge now maps security fields into resulting legacy `CascadeLink`;
  - commit path now has safe REALITY keypair/shortId fallback generation when security is `reality` and draft keys are missing/invalid.
- Domain (`src/domain/cascade-builder/*`):
  - normalizer and suggestion defaults now include security fields;
  - commit preview payload now includes security fields;
  - assumptions now report auto-generation behavior for REALITY key material when applicable.
- UI (`public/js/cascade-builder.js`, `views/cascade-builder.ejs`):
  - added security sections that toggle by selected tunnel security;
  - wired security fields into draft save payload.
- Locales (`src/locales/ru.json`, `src/locales/en.json`):
  - added labels for security fields and new validation/assumption messages.

Change types:

- `local patch` — TLS/REALITY draft security controls in cascade builder inspector
- `stability fix` — REALITY shortId/fingerprint validation + commit-time key fallback

## 2026-04-17 Cascade Builder Local Graph Assets (No CDN Runtime)

- Replaced external graph-library CDN usage on builder page with local vendor assets.
- `views/cascade-builder.ejs` now loads:
  - `/vendor/cascade/cytoscape.min.js`
  - `/vendor/cascade/dagre.min.js`
  - `/vendor/cascade/cytoscape-dagre.js`
  - `/vendor/cascade/cytoscape-edgehandles.js`
- Added deterministic vendor sync pipeline:
  - `scripts/sync-cascade-vendors.js`
  - `npm run sync:cascade-vendor`
  - `postinstall` hook now runs vendor sync automatically.
- Added runtime dependencies for bundled graph stack:
  - `cytoscape`
  - `dagre`
  - `cytoscape-dagre`
  - `cytoscape-edgehandles`
- Added `public/vendor/cascade/` to `.gitignore` because assets are generated deterministically from pinned npm packages during install/build.

Change types:

- `stability fix` — removed runtime CDN dependency from cascade builder graph layer
- `local patch` — local vendor asset sync script and npm lifecycle integration

## 2026-04-17 Cascade Builder Advanced Transport Draft Settings

- Extended builder draft-hop settings from base fields to transport-specific fields:
  - WS: path/host;
  - gRPC: service name;
  - XHTTP/splithttp: path/host/mode.
- Backend (`src/routes/cascadeBuilder.js`):
  - draft update endpoint now validates/saves advanced fields;
  - added strict XHTTP mode allowlist and localized invalid-mode error;
  - draft creation from connect now seeds advanced defaults;
  - draft commit bridge now writes advanced values into resulting `CascadeLink` payload.
- Domain (`src/domain/cascade-builder/*`):
  - normalizer carries advanced fields in draft/live DTO shape;
  - draft suggestion defaults include advanced transport fields;
  - commit preview payload includes advanced fields;
  - commit assumptions no longer claim defaults when advanced values were explicitly changed.
- UI (`public/js/cascade-builder.js`, `public/css/cascade-builder.css`, `views/cascade-builder.ejs`):
  - inspector now renders transport-specific configuration sections;
  - transport blocks dynamically switch by selected transport;
  - advanced values are sent through existing draft save flow.
- Locales (`src/locales/ru.json`, `src/locales/en.json`):
  - added labels/messages for advanced transport editor fields and XHTTP mode validation.

Change types:

- `local patch` — advanced transport controls in cascade builder draft inspector
- `stability fix` — strict backend validation for XHTTP mode and sanitized advanced fields
- `local patch` — commit bridge payload parity for WS/gRPC/XHTTP fields

## 2026-04-17 Cascade Builder Draft Hop Settings Editor

- Added draft-hop editing API to the builder backend:
  - `PATCH /api/cascade-builder/drafts/:hopId`
  - `DELETE /api/cascade-builder/drafts/:hopId`
- Backend (`src/routes/cascadeBuilder.js`):
  - strict normalization for editable hop fields (`mode`, `tunnelProtocol`, `tunnelTransport`, `tunnelSecurity`, `tunnelPort`, `muxEnabled`, `name`);
  - explicit allowlists and user-facing validation messages for invalid payloads;
  - pre-save flow validation guard so invalid draft edits are rejected before persistence;
  - draft deletion endpoint for per-hop cleanup without resetting all drafts.
- UI (`public/js/cascade-builder.js`, `public/css/cascade-builder.css`, `views/cascade-builder.ejs`):
  - hop inspector now switches to editable form for draft hops;
  - added save/remove draft actions directly in inspector;
  - selection is now restored after state reload so operator focus is not lost after edits;
  - added responsive form styling for dark/light themes and mobile inspector layout.
- Locales (`src/locales/ru.json`, `src/locales/en.json`):
  - added draft-hop editor labels, toasts, and backend validation strings.

Change types:

- `local patch` — per-hop draft settings edit flow in builder inspector
- `stability fix` — strict server-side normalization/validation for editable hop payload
- `local patch` — per-hop draft delete endpoint

## 2026-04-17 Cascade Builder Commit+Deploy Bridge

- Added a practical `commit + deploy` path to the experimental builder so draft hops can be applied and chain deployment can be triggered in one operator action.
- Backend (`src/routes/cascadeBuilder.js`):
  - `POST /api/cascade-builder/commit-drafts` now accepts `deployAfterCommit`;
  - commit flow now uses planner checks before mutation and blocks draft hops that are already invalid in commit plan;
  - when `deployAfterCommit=true`, touched chains are deployed through `cascadeService.deployChain(...)`;
  - response now includes `deployment` details (`chains`, `deployedChains`, `failedChains`, per-chain errors).
- Planner (`src/domain/cascade-builder/commitPlanner.js`):
  - added `nodeIds` into chain preview payload so backend can map draft changes to deterministic deploy targets.
- UI (`views/cascade-builder.ejs`, `public/js/cascade-builder.js`):
  - added a separate `Commit and deploy` action next to regular draft commit;
  - front-end now shows deployment issues in validation panel and surfaces deployment outcome in toasts;
  - kept regular `commit-only` action for safer staged workflows.
- Locales (`src/locales/ru.json`, `src/locales/en.json`):
  - added labels/messages for `commit + deploy` action and blocked-by-plan draft feedback.

Change types:

- `local patch` — builder commit+deploy operator bridge
- `stability fix` — pre-commit plan blocking for invalid draft hops
- `local patch` — builder deployment diagnostics in UI

## 2026-04-16

- Started the first live experimental `Cascade Builder` implementation inside this fork.
- Added a separate builder route/page/API instead of extending the legacy `Nodes -> Network Map` surface:
  - `/panel/cascades/builder`
  - `/api/cascade-builder/state`
  - `/api/cascade-builder/validate`
  - `/api/cascade-builder/connect`
  - `/api/cascade-builder/layout`
  - `/api/cascade-builder/drafts`
- Introduced a small builder domain layer:
  - `flowNormalizer` converts current topology into a flow-shaped DTO;
  - `flowValidator` applies structural/protocol/runtime-lite validation rules.
- Chose a transitional persistence model for v1:
  - live topology remains the read-source through `cascadeService.getTopology()`;
  - builder drafts/layout are now a separate Redis-backed draft-source in `cacheService`;
  - draft state is operator-scoped and intentionally not treated as shared topology truth.
- Added the first transitional write bridge back into the existing system:
  - builder can now commit accepted draft hops into legacy `CascadeLink` records;
  - commit uses safe defaults and intentionally skips auto-deploy in this step;
  - this makes the builder a real experimental workflow, not only a visual overlay.
- Added the first pure planning layer above that bridge:
  - `/api/cascade-builder/deploy-preview`
  - `/api/cascade-builder/plan-commit`
  - `commitPlanner` now returns per-hop readiness, chain grouping, affected-node runtime actions, role transitions, and legacy-default assumptions;
  - this intentionally keeps planning separate from mutation and is the first builder layer designed to transfer cleanly into Hidden Rabbit.
- Explicitly separated what v1 is and is not:
  - yes: experimental flow canvas, inspector, validation, draft drag-connect, draft layout persistence;
  - yes: transitional `draft -> legacy link` bridge;
  - yes: draft-state deploy preview / commit plan parity;
  - no: final Hidden Rabbit UX, shared flow storage, versioning, branching, rollback, executable synthetic deploy.
- Added an explicit UI fallback when Cytoscape assets are unavailable so the page fails loudly instead of appearing empty.

Change types:

- `local patch` — experimental cascade builder scaffold
- `local patch` — Redis-backed builder draft state
- `local patch` — builder deploy-preview / commit-plan layer
- `stability fix` — explicit canvas fallback and clearer state boundaries

- Added isolated continuity documentation layer under `docs/`.
- Added `ISOLATED-PROJECT-RULE.md` and formalized hard project isolation.
- Added baseline continuity documents:
  - `PROJECT-BASELINE.md`
  - `ROADMAP.md`
  - `SESSION-HANDOFF.md`
  - `SESSION-LEDGER.md`
  - `KNOWN-ISSUES.md`
  - `DEPLOYMENT-NOTES.md`
- Classified this repo's local docs set as the primary source of truth for future sessions.
- Added interactive smooth traffic chart on the dashboard with hover states and point tooltip.
- Added user-level operational stats to the panel detail view:
  - traffic progress;
  - active device sessions from Redis;
  - effective node coverage;
  - partial live-node hints using backward-compatible device activity metadata.
- Refreshed upstream comparison against current `upstream/main` and captured the main divergence areas:
  - our fork is ahead in deployment, hybrid cascade, setup hardening, HAPP layer, and redesign work;
  - upstream is ahead in onboarding, broadcast tooling, Marzban migration, and client statistics experiments.
- Continued the admin redesign with:
  - collapsible sidebar;
  - moved/iterated language controls;
  - flatter shell styling;
  - dashboard line charts;
  - circular metric experiments;
  - subscription page visual cleanup.
- Investigated persistent page-width / layout drift that still appears after navigation in some views.
- Started a shell-level CSS fix attempt in `public/css/style.css`:
  - switched desktop shell toward `grid + sticky sidebar`;
  - this fix is only partial and remains uncommitted / undeployed.
- Captured additional user-requested UI follow-ups for the next session:
  - fewer graph points;
  - dashboard period switcher;
  - language controls near theme switcher;
  - clearer sidebar collapse affordance;
  - visible Settings icon;
  - more neutral background;
  - segmented ring style;
  - blue QR presentation;
  - further removal of visible `Celerity` branding.
- Finished and deployed the paused shell rewrite:
  - grid shell + sticky sidebar committed and shipped;
  - added overflow guards for page headers, table wrappers, charts, cards, and dashboard columns;
  - moved language controls into the topbar next to theme controls;
  - made sidebar collapse affordance clearer with labeled control.
- Reduced stats chart point density adaptively and improved time-axis readability.
- Recolored subscription/user-detail/TOTP QR presentation to the project palette.
- Improved node attribution path:
  - auth endpoint now accepts several `x-node-*` header aliases;
  - user detail view enriches session entries from effective-node lookup when only `nodeId` is available.
- Replaced the most visible `Celerity` branding on layout/login/setup/TOTP surfaces with `Hidden Rabbit`.

Change types:

- `local override` — isolated project continuity model
- `local patch` — dashboard traffic chart UX
- `stability fix` — continuity and handoff discipline
- `local patch` — operator-facing user stats
- `upstream sync review` — divergence audit baseline
- `investigation` — persistent shell/layout drift
- `local patch (paused)` — uncommitted shell CSS rewrite attempt
- `stability fix` — deployed shell rewrite and overflow containment
- `local patch` — chart readability and period UX polish
- `local patch` — node attribution enrichment
- `local override` — visible branding shift toward Hidden Rabbit
- `stability fix` — extra shell overflow containment and dashboard/topbar localization cleanup

## 2026-04-17

- Polished the experimental `Cascade Builder` page instead of leaving it half-localized:
  - added fuller `ru/en` locale coverage for builder labels and route-level API errors;
  - localized validation/planning surfaces coming from the builder API;
  - fixed a route response bug where `summary` after draft commit pointed to a missing field;
  - added true dark-theme Cytoscape styling so the canvas itself matches the panel theme, not only the surrounding CSS;
  - tightened responsive behavior for hero controls, summary cards, library/inspector spacing, and mobile canvas heights.
- Captured a practical audit of the current node auto-setup / agent onboarding flow.
- Documented the direction for replacing the legacy onboarding path with a Hidden Rabbit-specific pipeline:
  - durable onboarding jobs;
  - explicit step state;
  - pinned installer channel;
  - local runtime verification;
  - real panel-to-agent handshake;
  - resume/repair semantics.
- Added a dedicated design note:
  - `docs/node-onboarding-rewrite-blueprint.ru.md`
- Stopped intentionally before writing onboarding-rewrite code:
  - builder polish is already committed, pushed, and deployed;
  - next step should start from implementing the durable onboarding model/service layer, not from repeating the audit.

Change types:

- `local patch` — cascade builder theme/i18n/responsive polish
- `stability fix` — builder API localization and commit-summary correction
- `investigation` — node onboarding / installer fragility audit
- `design note` — Hidden Rabbit onboarding rewrite blueprint

## 2026-04-17 Onboarding Rewrite Scaffold (Phase 1)

- Started the first real code implementation for the new Hidden Rabbit onboarding pipeline without replacing legacy auto-setup yet.
- Added a dedicated onboarding state-machine domain layer:
  - `src/domain/node-onboarding/stateMachine.js`
  - canonical step list (`preflight -> ready`);
  - job/step status enums;
  - transition helpers (`canTransitionStatus`, next-step navigation, active/terminal checks).
- Added a durable onboarding job model in Mongo:
  - `src/models/nodeOnboardingJobModel.js`
  - persistent `stepStates`, `stepLogs`, `lastError`, `resultSnapshot`, trigger metadata;
  - partial unique index for one active onboarding job per node.
- Added onboarding service scaffold:
  - `src/services/nodeOnboardingService.js`
  - create/list/get active jobs;
  - start/resume semantics;
  - step transitions (`running/completed/failed/blocked/repairable`);
  - heartbeat/log appends;
  - terminal completion/failure handling.
- Added a lightweight runner scaffold:
  - `src/services/nodeOnboardingRunner.js`
  - executes step handlers in order;
  - persists transitions step by step;
  - defaults to repairable fail mode on handler error.
- Added isolated onboarding API endpoints (separate from legacy setup flow):
  - `GET /nodes/:id/onboarding/active`
  - `GET /nodes/:id/onboarding/jobs`
  - `POST /nodes/:id/onboarding/jobs`
  - `POST /nodes/:id/onboarding/jobs/:jobId/start`
  - `POST /nodes/:id/onboarding/jobs/:jobId/resume`
  - `POST /nodes/:id/onboarding/jobs/:jobId/steps/:step/start`
  - `POST /nodes/:id/onboarding/jobs/:jobId/steps/:step/complete`
  - `POST /nodes/:id/onboarding/jobs/:jobId/steps/:step/fail`
  - `POST /nodes/:id/onboarding/jobs/:jobId/complete`
- Kept legacy auto-setup path untouched:
  - no replacement of `/nodes/:id/setup` yet;
  - no change to current in-memory `setupJobs` behavior in panel route at this stage.

Change types:

- `local patch` — durable onboarding model and state-machine scaffold
- `local patch` — isolated onboarding API scaffold
- `stability fix` — explicit transition guards and bounded onboarding logs

## 2026-04-17 Onboarding Bridge Integration (Phase 2 start)

- Started the staged integration of durable onboarding jobs into existing setup flows (without hard switch-off of legacy path).
- Updated panel setup flow bridge in `src/routes/panel/nodes.js`:
  - `/panel/nodes/:id/setup` now initializes a durable onboarding job on setup start;
  - background setup runner now receives/stores `onboardingJobId`;
  - legacy setup success/failure now mirrors into onboarding step/job status as a bridge;
  - `/panel/nodes/:id/setup-status` now includes durable onboarding payload and can fall back to onboarding state when in-memory setup job is absent.
- Updated API setup flow bridge in `src/routes/nodes.js`:
  - `/api/nodes/:id/setup` now creates/starts onboarding job in staged mode;
  - setup success/failure mirrors into onboarding status;
  - setup responses now include `onboardingJobId`.
- Important scope guard:
  - legacy execution (`nodeSetup.*`, in-memory setup job map, finalization path) is still active;
  - new onboarding layer is currently acting as durable state mirror + integration seam.

Change types:

- `local patch` — staged onboarding integration bridge for panel/API setup flows
- `stability fix` — durable setup-status read model fallback from onboarding jobs

## 2026-04-17 Onboarding First Real Handlers (Phase 2.1)

- Added first executable onboarding handlers instead of pure synthetic step transitions:
  - `src/services/nodeOnboardingHandlers.js`
  - `runPreflight`:
    - validates SSH availability;
    - validates required tools (`bash`, `systemctl`, `curl`, `openssl`);
    - captures basic OS/kernel/uptime snapshot.
  - `runPrepareHost`:
    - prepares base runtime directories;
    - ensures Xray log file paths exist;
    - returns prepared-path snapshot.
- Added pipeline entrypoint:
  - `src/services/nodeOnboardingPipeline.js`
  - `runUntilInstallRuntime(jobId)` runs real handlers for:
    - `preflight`
    - `prepare-host`
    - then stops before `install-runtime`.
- Added API trigger for these real steps:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-preflight`
- Scope guard:
  - full runtime/agent install is still handled by legacy setup flow;
  - onboarding pipeline currently executes only early deterministic checks/preparation.

Change types:

- `local patch` — first executable onboarding handlers
- `stability fix` — deterministic preflight/prepare-host checkpoint

## 2026-04-17 Onboarding Runtime Handler Layer (Phase 2.2)

- Extended onboarding handlers beyond preflight/prepare-host:
  - `install-runtime` handler adapter:
    - uses existing `nodeSetup` routines by node type/role;
    - keeps current runtime-install logic centralized;
    - returns compact install result snapshot + log tail.
  - `verify-runtime-local` handler:
    - validates runtime is actually online using existing runtime status checks;
    - fails onboarding step if runtime is still offline.
- Extended pipeline service:
  - `runUntilAgentInstall(jobId)` executes:
    - `preflight`
    - `prepare-host`
    - `install-runtime`
    - `verify-runtime-local`
    - then stops before `install-agent`.
- Added API trigger:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-runtime`
  - allows staged runtime-phase execution under the durable onboarding state machine.

Change types:

- `local patch` — runtime install/verify onboarding handlers
- `stability fix` — explicit runtime-online gate before agent step

## 2026-04-17 Setup Logs UX + Live Streaming Stabilization

- Fixed false “error-red” rendering in node setup console:
  - frontend log classifier no longer marks every `[STDERR]` line as critical;
  - added separate neutral stderr color;
  - critical/error highlighting now targets actual failure patterns (`failed`, `fatal`, `exit code`, etc.).
- Added near real-time setup output delivery for Xray onboarding path:
  - `execSSH` now supports line callbacks (`onStdoutLine` / `onStderrLine`);
  - Xray runtime setup and cc-agent install now stream remote output line-by-line;
  - panel setup status now merges durable onboarding logs with live in-memory streaming buffer while job is running.
- Added live onboarding stream propagation:
  - onboarding runner emits step start/completion/failure lines into panel live log channel;
  - runtime/agent onboarding handlers now forward live setup output into that channel.

Change types:

- `stability fix` — setup logs severity classification
- `local patch` — live setup log streaming for Xray onboarding

## 2026-04-17 Onboarding Agent Handler Layer (Phase 2.3)

- Extended pipeline with agent-focused handlers:
  - `install-agent`:
    - uses `setupOrRepairXrayAgent` with strict mode for Xray non-bridge nodes;
    - returns compact install details and log tail;
    - explicitly skips unsupported node roles/types.
  - `verify-agent-local`:
    - validates local `cc-agent` service state;
    - validates agent port listener state.
  - `verify-panel-to-agent`:
    - validates panel-to-agent handshake using existing sync-service agent request path.
- Extended pipeline stage:
  - `runUntilSeedNodeState(jobId)`
  - executes handler chain through panel->agent verification and stops before `seed-node-state`.
- Added API trigger:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-agent`
  - enables staged execution for the new agent verification layer.

Change types:

- `local patch` — install-agent and verification handler layer
- `stability fix` — explicit panel->agent handshake checkpoint

## 2026-04-17 Onboarding Seed/Final Layer (Phase 2.4)

- Added final onboarding handlers:
  - `seed-node-state`:
    - persists post-verify node baseline (`status`, `lastSync`, health fields, agent metadata when applicable).
  - `final-sync`:
    - runs existing `syncService.finalizeNodeSetup` for Xray nodes;
    - skip-safe for non-Xray nodes in this stage.
- Extended pipeline to full path:
  - `runFull(jobId)`
  - executes real handlers from `preflight` through `final-sync`, then closes job via `ready`.
- Added API trigger:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-full`
  - enables full staged onboarding execution against one job.

Change types:

- `local patch` — seed/final handler layer and full pipeline execution
- `stability fix` — explicit seed baseline and final-sync checkpoint

## 2026-04-17 Panel Setup UI Onboarding Progress (Phase 3 start)

- Updated setup polling UI on node form:
  - file: `views/partials/node-form/scripts.ejs`;
  - setup polling now prefers durable onboarding logs when available;
  - setup result alert now shows current onboarding step label while running/failing.
- This is the first UI move toward onboarding-first status rendering while still keeping legacy behavior.

Change types:

- `local patch` — onboarding-aware setup progress rendering in panel UI

## 2026-04-17 Onboarding Setup-Mode Cutover (Phase 3.1)

- Moved panel setup start into staged execution modes:
  - `onboarding-full` (durable `runFull` pipeline);
  - `legacy` (existing setup runner).
- Added panel setup-mode resolver:

  - explicit override via `setupMode` request value;
  - env guard `FEATURE_ONBOARDING_RUN_FULL=true`;
  - staged default: Xray nodes use durable onboarding path first.
- Added durable setup runner in panel route:
  - `runNodeOnboardingJob(...)` now executes `nodeOnboardingPipeline.runFull(...)`;
  - setup job state is still mirrored to existing panel polling contract.
- Added duplicate-run guard:
  - setup start now detects active onboarding jobs in `running` state and returns running status instead of launching a second runner.
- Switched panel setup-status read model to onboarding-primary:
  - when onboarding job exists, response state/logs/error come from durable onboarding first;
  - in-memory legacy setup map is now fallback data only.
- Extended API setup endpoint:
  - `/api/nodes/:id/setup` now supports `setupMode=onboarding-full`;
  - onboarding-full mode runs `runFull` and returns durable logs;
  - legacy mode remains available and unchanged as fallback.

Change types:

- `local patch` — staged runFull cutover for panel/API setup start
- `stability fix` — onboarding-first setup-status read path with legacy fallback

## 2026-04-17 Onboarding Setup-Mode Normalization (Phase 3.1.1)

- Normalized onboarding job metadata to reflect actual execution mode:
  - `flow=durable-onboarding-run-full` for onboarding-full starts;
  - `flow=legacy-setup-bridge` for legacy starts;
  - explicit `setupMode` persisted in metadata.
- Panel setup UI now sends explicit setup mode in start request:
  - Xray nodes request `setupMode=onboarding-full`;
  - non-Xray nodes request `setupMode=legacy`.
- Keeps staged behavior deterministic and easier to audit from job history/logs.

Change types:

- `stability fix` — setup-mode metadata parity for durable onboarding jobs
- `local patch` — explicit setup-mode request from panel setup UI

## 2026-04-17 Onboarding Resume/Repair UI Bridge (Phase 3.2)

- Added panel-level onboarding operator actions for node form management:
  - `Resume onboarding`;
  - `Repair onboarding`.
- Added new panel endpoints:
  - `POST /panel/nodes/:id/onboarding/resume`
  - `POST /panel/nodes/:id/onboarding/repair`
- Both actions now:
  - validate node + SSH prerequisites;
  - guard against duplicate concurrent runs;
  - start background durable runner via `runFull`;
  - reuse existing setup-status polling contract.
- Updated node-form scripts:
  - setup/resume/repair now use shared onboarding action start + polling helpers;
  - onboarding progress continues to render step-aware logs/status.
- Added `ru/en` locale strings for new onboarding actions and confirmations.

Change types:

- `local patch` — onboarding resume/repair controls in panel management UI
- `stability fix` — reusable panel action/polling path for durable onboarding runs

## 2026-04-17 Onboarding Jobs Visibility + Step Resume (Phase 3.3)

- Expanded node management onboarding controls:
  - added resume-step selector in panel UI;
  - added quick refresh for recent onboarding jobs.
- Reused existing onboarding jobs API read-model in node-form scripts:
  - `/api/nodes/:id/onboarding/jobs?limit=6`;
  - summary now shows recent job id/status/current step/last update timestamp;
  - summary now also surfaces `lastError` when present.
- Resume action now supports explicit step override from the UI selector.
- Added `ru/en` locale keys for onboarding jobs summary labels and loading/error states.

Change types:

- `local patch` — onboarding jobs/operator visibility on node management page
- `stability fix` — controlled step resume input for durable onboarding runs

## 2026-04-17 Onboarding Mode Isolation + Diagnostics UI (Phase 3.4)

- Isolated onboarding modes to prevent synthetic legacy bridge transitions from mutating durable onboarding jobs:
  - added mode resolver by onboarding metadata/flow;
  - setup starts now reject incompatible active job mode reuse (`legacy` vs `onboarding-full`);
  - legacy bridge complete/fail mirrors now run only on legacy-bridge jobs.
- Hardened operator recovery endpoints:
  - panel resume now supports explicit `jobId`;
  - resume blocks legacy bridge snapshots from onboarding-full path;
  - repair no longer resumes legacy bridge jobs and keeps durable repair flow.
- Extended onboarding diagnostics surface:
  - added `GET /api/nodes/:id/onboarding/jobs/:jobId` details endpoint;
  - upgraded node management onboarding summary into actionable job cards;
  - added per-job diagnostics blocks (step chips + recent logs);
  - added per-job actions (resume selected job, use failed step, copy diagnostics).
- Added locale keys (`ru/en`) for onboarding diagnostics/action/mode labels.

Change types:

- `stability fix` — strict legacy/durable onboarding mode isolation
- `local patch` — richer onboarding diagnostics/actions UI for node operators

## 2026-04-17 setupJobs Status Retirement + Step Rerun (Phase 3.5)

- Continued staged retirement of in-memory `setupJobs` from critical panel status path:
  - introduced `legacy-only` setup-job filter for in-memory reads;
  - setup/resume/repair routes now prioritize durable onboarding running-state checks before legacy in-memory checks;
  - `setup-status` now returns durable onboarding status/logs without mixing in-memory durable mirror fields.
- Added safe step-level rerun action for durable onboarding jobs:
  - new panel endpoint: `POST /panel/nodes/:id/onboarding/rerun-step`;
  - validates allowed step and node/job ownership;
  - blocks legacy bridge jobs from onboarding-full rerun path;
  - resumes resumable durable jobs from selected step;
  - creates repair job and reruns selected step for terminal durable jobs.
- Extended node-form onboarding UI:
  - new per-job action button: `Rerun step`;
  - action reuses step selector or failed-step inference.
- Added `ru/en` locale strings for rerun-step action flow.

Change types:

- `stability fix` — reduce setup-status reliance on in-memory setup state
- `local patch` — durable step-level rerun control in panel onboarding UI

## 2026-04-17 Session Close Summary

- Finalized this session on top of onboarding rewrite phase 3.x with three consecutive commits:
  - `d5e9796 — feat: normalize setup modes for onboarding job execution`
  - `13debe8 — feat: add onboarding resume and repair controls in panel`
  - `204a1c9 — feat: add onboarding jobs summary and step-select resume UI`
- Confirmed at session close:
  - `main` contains the latest onboarding UI/control flow changes;
  - working tree is clean;
  - continuity docs updated with a strict next-launch prompt.

Change types:

- `continuity` — session close capture and next-launch handoff hardening

## 2026-04-16 Session Continuity Update

- Captured a new stop-point instead of pushing more UI changes blindly.
- Recorded the current uncommitted local patch set:
  - `public/css/style.css`
  - `views/dashboard.ejs`
  - `views/layout.ejs`
  - `views/users.ejs`
- Logged the next requested work from the user:
  - sidebar full-height fix;
  - replace square/grid texture with neutral paper-like noise;
  - make language switcher match theme switcher;
  - remove text labels from theme switcher and keep icons only;
  - move/verify footer collapse control near logout;
  - replace green system accents with project Java accents;
  - ensure dark-theme dashboard rings are not black;
  - add users-list actions for subscription page / copy / edit / details;
  - use `∞` for unlimited traffic presentation;
  - continue HAPP color-profile defaults aligned to panel theme, including iOS/macOS behavior review.

Change type:

- `stability fix` — continuity capture for unfinished UI pass

## 2026-04-16 Continued Local UI Pass

- Continued working inside the still-uncommitted local UI patch set.
- Adjusted shell behavior:
  - sidebar now moves toward full-height stretch instead of a viewport-only cap;
  - theme controls were simplified toward icon-only behavior.
- Continued visual cleanup:
  - replaced the diagonal grid direction with a paper-noise background direction;
  - switched user-detail unlimited traffic compact display to `∞`.

Change type:

- `local patch` — in-progress shell and visual cleanup

## 2026-04-16 Deployable UI Follow-Up

- Continued the shell/UI pass into a deployable batch:
  - wrapped sidebar content into a sticky inner layer so the left column can stretch to full page height;
  - refined the content background toward a calmer paper-noise texture;
  - changed remaining success/online accents from generic green toward project `Java`;
  - updated users list action icons for subscription / copy / edit / details;
  - set a default dark HAPP color profile in the settings model and panel route;
  - added HAPP dark/light preset-fill buttons in the settings UI.

Change type:

- `local patch` — shell stretch, accent cleanup, users UX, and HAPP theming defaults

## 2026-04-16 Shell Continuation and MCP Rebrand Cleanup

- Continued the shell/layout stabilization pass after the deployable UI follow-up.
- Added JS-driven shell height synchronization:
  - calculates `--shell-sidebar-height`;
  - syncs on `load`, `pageshow`, `resize`, `visibilitychange`, and `ResizeObserver`.
- Removed `contain: inline-size` from key shell containers to reduce the chance of page-width drift on some browser/window states.
- Switched content shell to a more stable flex-column arrangement.
- Softened the remaining hero/grid texture toward the calmer paper-noise direction.
- Renamed frontend preference storage keys from `celerity-*` to `hidden-rabbit-*` while keeping legacy fallback.
- Continued visible rebrand cleanup:
  - MCP settings snippets now use `hidden-rabbit`;
  - MCP route server info now reports `hidden-rabbit-panel`.

Change type:

- `stability fix` — shell height synchronization and width-drift mitigation
- `local override` — MCP-visible brand cleanup

## 2026-04-16 Stats Users Activity Chart

- Added a real user-activity chart to the statistics page.
- The chart is backed by existing snapshot fields (`users`, `activeUsers`) and follows the same period selector as the rest of the stats page.
- Added a dedicated `/panel/stats/api/users` endpoint plus cache-backed service method.
- Added locale strings for the new chart in `ru` and `en`.

Change type:

- `local patch` — statistics UX and user activity visibility

## 2026-04-16 Stats and User Detail Refinement

- Refined user detail stats wording:
  - `Traffic progress` now presents as traffic used;
  - devices wording now explicitly means connected devices;
  - node coverage wording now means connected nodes.
- Adjusted unlimited traffic display so `∞` can be visually larger without changing normal numeric values.
- Made the sidebar footer controls sticky so collapse/logout controls stay attached to the viewport.
- Added a `24h / 48h` switcher for the users activity heatmap.
- Added a cumulative total line to the registrations chart so new-profile flow and total profile growth can be read together.
- Tightened shared card/header vertical rhythm for the shell, dashboard/statistics/users surfaces.

Change type:

- `local patch` — operator stats UX and shell polish

## 2026-04-16 Chart Visual System Pass

- Unified dashboard segmented rings so both primary and secondary rings use the project Java accent instead of mixed navy/Java colors.
- Reworked the dashboard traffic sparkline surface:
  - taller adaptive chart area;
  - calmer dashed plotting texture;
  - fewer visible markers;
  - resize-aware redraw.
- Added dashboard log height syncing against the right sidebar bottom so the logs panel aligns with the last sidebar widget more reliably.
- Refined statistics charts:
  - shared Java/Deep Cove palette;
  - taller responsive chart bodies;
  - dashed plot surfaces;
  - smoother lines and reduced point noise;
  - cleaner tooltip/axis behavior.
- Versioned and shortened traffic-chart cache to reduce stale mismatches between `24h` and `7d` totals after live updates.

Change type:

- `local patch` — visual consistency and chart UX
- `stability fix` — dashboard logs height alignment

## 2026-04-16 Mobile Shell and Dashboard Localization Pass

- Continued the responsive/dashboard follow-up after live Android feedback.
- Moved language/theme controls into the mobile sidebar flow and hid the desktop utility cluster on mobile.
- Reworked mobile menu behavior:
  - explicit open/close state;
  - overlay click closes reliably;
  - body scroll is locked while mobile menu is open;
  - sidebar toggle closes the mobile menu instead of trying to collapse desktop shell state.
- Added interpolation + pluralization support to the local i18n middleware:
  - `t(key, params)`;
  - `tp(key, count, params)` with Russian plural rules.
- Applied the new pluralization layer to visible dashboard counters so Russian labels read naturally (`подключение / подключения / подключений`, etc.).
- Localized more dashboard/operator UI:
  - status labels (`Онлайн`, `Офлайн`, `Ошибка`);
  - restart action on mobile node cards;
  - dashboard summary headings;
  - system widget labels (`Подключения`, `Кэш Redis`, `Процесс`, `Аптайм`);
  - sidebar subtitle now uses the project RU/EN console kicker.
- Adjusted mobile dashboard hero composition:
  - top metric cards remain a 2-column grid;
  - profile/device rings are centered and stretched more evenly across the card width;
  - mobile cards center their copy more consistently.

Change type:

- `stability fix` — mobile shell/menu interaction
- `local patch` — dashboard localization and pluralization

## 2026-04-16 Xray Session Telemetry and Dashboard Ratio Cleanup

- Added true Xray session telemetry foundation:
  - `cc-agent` now exposes authenticated `/sessions`;
  - agent parses Xray access log records into active sessions;
  - panel polls `/stats` and `/sessions` together when supported;
  - Redis activity records now preserve real session metadata such as client address.
- Updated Xray config generation and node setup so Xray access/error logs are prepared for session tracking.
- Kept backward compatibility with older agents by falling back to `/stats` when `/sessions` is not available.
- Normalized dashboard ratio labels so numeric relationships use `/` instead of mixed `из` wording.
- Deployed the latest state to the Coolify stand and confirmed the application returned `running:healthy`.

Change type:

- `local patch` — true Xray session telemetry foundation
- `stability fix` — backward-compatible agent polling
- `local patch` — dashboard ratio label cleanup
- `deployment` — Coolify stand updated from `main`

## 2026-04-16 Dashboard Ring Iteration Continuation

- Replaced the earlier SVG-based dashboard ring rendering with a simpler CSS pseudo-layer approach:
  - ring body as the outer dashed circle;
  - `::before` as the inner dashed circle;
  - value text as the top layer.
- Committed and deployed this simplified ring version:
  - `17adc2d — fix: simplify dashboard rings with css pseudo layers`
- After live review, the user provided a narrower visual target for ring geometry:
  - `--meter-gap: 5px`
  - `--meter-border-width: 1px`
  - `width: 80px`
  - `height: 80px`
- Started a new local follow-up CSS tweak in `public/css/style.css` to align:
  - large dashboard rings;
  - mobile dashboard rings;
  - mini rings in `Profiles and devices`.
- Current local geometry values are now:
  - large rings: `80x80`, `gap 5`, `border 1`, `font-size 18`;
  - mini rings: `68x68`, `gap 4`, `font-size 15`;
  - mobile large rings: `84x84`, `gap 5`, `font-size 19`;
  - mobile mini rings: `72x72`, `gap 4`, `font-size 16`.
- This latest geometry tweak is still local-only and not yet committed/deployed.

Change type:

- `local patch` — dashboard metric ring geometry refinement
- `stability fix` — simplified CSS-only ring rendering path

## 2026-04-16 Dashboard Recovery and Cross-Page Cleanup

- Fixed a live rendering regression after introducing pluralization in templates:
  - the shared panel `render()` helper now passes `tp` into compiled views, not only `t`.
- Continued the dashboard polish:
  - swapped the `Server` and `Quick Actions` cards in the right column;
  - renamed the server-load card from panel wording to server wording;
  - reworked dashboard metric rings toward a double segmented ring treatment with tighter cutout proportions.
- Continued visible cross-page cleanup:
  - localized the settings hero so it no longer mixes English/Russian hardcoded copy;
  - users list header now uses pluralized user counts;
  - mobile user cards now pluralize group counts naturally.

Change type:

- `stability fix` — render helper i18n wiring
- `local patch` — dashboard duplicate-count cleanup and mini-ring size normalization
- `local patch` — dashboard/card hierarchy and cross-page copy cleanup

## 2026-04-16 Sticky Sidebar Fix

- Changed the desktop sidebar from a normal grid column with only an inner sticky layer into a viewport-sticky shell block.
- The sidebar now stays attached to the screen while page content scrolls.
- Sidebar content scrolls internally if it ever exceeds viewport height, while footer controls remain in the same visual stack.

Change type:

- `stability fix` — shell/sidebar scroll behavior

## 2026-04-16 Sidebar Footer and Chart Polish

- Changed sidebar scrolling so only the navigation middle scrolls; the collapse/logout footer stays fixed at the bottom of the viewport-height sidebar.
- Kept segmented dashboard rings on the Java accent family in both light and dark themes.
- Refined the dashboard traffic chart:
  - slightly taller adaptive chart surface;
  - fewer visible markers;
  - calmer plot texture.
- Nudged dashboard log height syncing closer to the right sidebar bottom.
- Tightened statistics chart visuals:
  - reduced point noise;
  - calmer plot texture;
  - Java-only node chart palette;
  - added a subtle chart-area background plugin for a more unified live-chart surface.

Change type:

- `local patch` — shell footer and chart visual polish
- `stability fix` — dashboard logs height alignment follow-up

## 2026-04-16 Fixed Sidebar Shell Recovery and Chart.js Motion Pass

- Promoted the desktop sidebar from sticky/grid participation to a fixed shell column so it can stay pinned to the viewport.
- Recovered the desktop content layout after that shell change:
  - restored the main content offset using sidebar-width-based margins;
  - added mobile reset so the fixed desktop offset does not leak into narrow layouts.
- Reworked the dashboard traffic card onto the shared Chart.js path and then refined it further:
  - full-width plot area inside the hero card;
  - taller chart surface;
  - stronger fill gradient;
  - thicker lines;
  - larger points and hover targets;
  - smoother entrance animation.
- Continued the same visual system upgrade on the statistics page:
  - taller chart bodies;
  - calmer dashed plot surfaces;
  - thicker lines;
  - larger points;
  - softer chart-area gradients;
  - smoother load-in animation and cleaner tooltips.

Change type:

- `stability fix` — fixed-sidebar shell recovery after content disappearance
- `local patch` — dashboard/statistics Chart.js motion and visual refinement

## 2026-04-16 Sticky Sidebar and Dashboard Sparkline Rework

- Reworked the desktop sidebar behavior again after live feedback:
  - sidebar remains viewport-sticky as a whole column;
  - removed the separate scrolling behavior from the nav block so the full sidebar behaves like one fixed shell instead of a nested scroll area.
- Reworked the main dashboard traffic card geometry:
  - constrained the chart content width inside the hero card;
  - increased chart height and internal SVG canvas height;
  - adjusted focus-line bounds and vertical padding so peaks and tooltips no longer feel flattened into a banner-like strip.

## 2026-04-16 Fixed Sidebar and Dashboard Chart.js Migration

- Replaced the desktop sidebar approach again after continued user feedback:
  - desktop sidebar now uses a fixed viewport-attached shell instead of sticky behavior;
  - this matches the expected "always pinned to screen" interaction more closely.
- Replaced the dashboard hero traffic graph implementation:
  - removed the custom SVG sparkline renderer;
  - migrated the dashboard traffic card to `Chart.js`;
  - aligned the dashboard traffic card visual system with the statistics page so chart language, resizing, and tooltip behavior share the same foundation.

Change type:

- `stability fix` — desktop sidebar viewport behavior correction
- `local patch` — dashboard traffic sparkline proportion and geometry refinement
- `stability fix` — fixed desktop shell behavior
- `local patch` — dashboard chart system migration to Chart.js

## 2026-04-16 Mobile Settings / Stats / Subscription Cleanup Pass

- Continued the post-dashboard cleanup on adjacent surfaces instead of opening new features.
- Improved mobile/responsive behavior in shared shell CSS:
  - settings tab strip now scrolls horizontally instead of wrapping into awkward broken rows;
  - settings grid collapses more cleanly to a single column on narrow screens;
  - subscription preview surface stacks cleanly on mobile and no longer over-compresses URL/title blocks;
  - chart headers, legends, and heatmap regions on `Statistics` now wrap/scroll more gracefully on phones.
- Cleaned visible wording/localization:
  - localized the dashboard traffic period pills instead of keeping hardcoded `24ч / 7д / 30д`;
  - localized subscription settings preview labels/chips;
  - replaced the lingering public subscription-page eyebrow `Access Profile` with `Профиль доступа`;
  - removed hardcoded `Restore` buttons in settings backup lists and switched them to locale-backed labels.

Change type:

- `local patch` — mobile/responsive cleanup for settings, subscription, and statistics
- `local override` — visible wording cleanup on dashboard/settings/public subscription page

## 2026-04-16 Dashboard Rings / Mobile Shell Recovery

- Reworked the dashboard metric rings again after the previous version rendered as thick solid circles instead of thin segmented rings.
- Replaced the fragile ring presentation with a lighter dashed double-ring treatment plus compact progress markers in the dashboard client script.
- Continued the mobile shell pass:
  - hid duplicated desktop status controls from the mobile topbar;
  - raised sidebar / overlay stacking and blocked background interaction while the mobile menu is open;
  - moved mobile language/theme controls toward a 2-column layout;
  - removed the mobile collapse button from the visible footer flow;
  - converted mobile node actions (`restart / settings / terminal`) to a clean 3-column icon grid.

Change type:

- `local patch` — dashboard metric ring rendering correction
- `stability fix` — mobile menu interaction / z-index / pointer-event recovery

## 2026-04-16 Dashboard Mini-Ring / Label Cleanup

- Removed the conflicting `.hero-meter-ring.soft` size override so both dashboard mini rings inherit the same mini geometry again.
- Cleaned pluralized dashboard labels so they no longer print the raw count next to `tp(...)` output, avoiding duplicated strings such as `0 0 устройств` and `из 2 2 пользователя`.

Change type:

- `stability fix` — dashboard mini-ring sizing and pluralized label cleanup

## 2026-04-16 Dashboard Device Stats Fallback

- Investigated why `Profiles and devices` stayed at zero while a node clearly had live users.
- Confirmed the split in current metrics:
  - node/user online counts come from node telemetry (`onlineUsers`, including Xray agent stats);
  - `Profiles and devices` comes from Redis device activity written by `/api/auth`.
- Added a dashboard-only fallback for cases where live node online data exists but Redis device activity is still empty:
  - active profiles fallback to `min(totalOnline, enabledUsers)`;
  - active devices fallback to `totalOnline`;
  - UI now marks this as estimated from node online data.

Change type:

- `local patch` — dashboard device stats fallback for Xray/agent-backed online data

## 2026-04-16 Xray Device Activity Attribution

- Added real Xray-backed device activity updates during agent traffic collection.
- When `/stats` returns non-zero traffic for a user email/userId, the panel now records a Redis device activity entry with:
  - synthetic key `xray:<nodeId>:<userId>`;
  - node id/name;
  - node type `xray`;
  - source `xray-agent-stats`.
- This gives the dashboard and user detail views real active-profile / active-node hints for Xray traffic, while still leaving true physical-device/IP attribution as a later improvement.

Change type:

- `local patch` — Xray active profile attribution from agent stats

## 2026-04-16 User List Live Activity Attribution

- Extended the users list with a compact live activity column built from the same Redis device activity layer used by user detail and dashboard cards.
- The list now shows:
  - active session count within the configured device grace window;
  - active node names when attribution metadata is available;
  - Xray stats as an explicit live source when the entry comes from agent traffic deltas.
- Cleaned user-detail session rendering so synthetic Xray entries are shown as profile traffic activity instead of exposing the internal `xray:<nodeId>:<userId>` key.

Change type:

- `local patch` — operator visibility for live user/node attribution

## 2026-04-16 Mobile Menu Layering Fix

- Moved the mobile overlay inside the app shell so it participates in the same stacking context as the sidebar.
- Explicitly layered mobile UI:
  - overlay above page content;
  - sidebar above overlay;
  - sidebar keeps pointer events while the page behind is blocked.
- Added `aria-expanded`, `aria-hidden`, and Escape-key close behavior to make the mobile menu state more deterministic on Android browsers.

Change type:

- `stability fix` — mobile menu accessibility / stacking recovery

## 2026-04-16 Xray True Session Telemetry Foundation

- Extended `cc-agent` with a new authenticated `GET /sessions` endpoint.
- Added a lightweight Xray access-log parser in the agent:
  - reads recent `/var/log/xray/access.log` lines;
  - extracts user email/userId and client IP;
  - returns deduplicated active sessions inside the configured session window.
- Updated generated Xray configs to enable access/error logs under `/var/log/xray/`.
- Updated Xray node setup to create the log directory/files before service start.
- Updated panel stats collection:
  - polls `/sessions` alongside `/stats`;
  - writes real client IP session records to Redis when available;
  - keeps the older `/stats` fallback for agents that do not support `/sessions` yet.
- Extended user activity rendering with a separate `Xray session` source label.

Change type:

- `local patch` — true Xray per-device/session telemetry foundation
- `stability fix` — non-breaking fallback for old cc-agent binaries

## 2026-04-16 Visual Cascade Builder Product Blueprint

- Added a dedicated product blueprint for a future Hidden Rabbit visual cascade builder:
  - `docs/hidden-rabbit-cascade-builder-blueprint.ru.md`
- Added a technical design companion for the first experimental implementation:
  - `docs/cascade-builder-v1-tech-design.ru.md`
- The document captures:
  - how the current `Network Map` / cascade code can be reused as a prototype base;
  - why the future builder should become flow-centric rather than link-centric;
  - target UX:
    - canvas;
    - inspector;
    - validate/deploy mode;
  - proposed domain model and phased implementation plan.
- Also linked this direction into the main roadmap as a mid-term experimental track for this fork.

Change type:

- `product blueprint` — future visual cascade builder direction
- `continuity` — roadmap alignment for builder experiment
- `technical design` — first implementation boundary for builder v1

## 2026-04-17 Onboarding Prepare-Host Failure Diagnostics Hardening

- Investigated real onboarding failure on fresh server:
  - durable onboarding stopped at `prepare-host` with generic message `Prepare-host marker missing in SSH output`.
- Hardened onboarding SSH step handlers in `src/services/nodeOnboardingHandlers.js`:
  - added explicit `result.success` checks for `preflight` and `prepare-host`;
  - if SSH command fails, throw structured step error with:
    - step name;
    - SSH exit code;
    - SSH error text;
    - stdout/stderr tails for diagnostics.
- Improved `prepare-host` host preparation robustness:
  - handles path collisions where expected directories may exist as files (moves/removes and recreates dirs).
- Added live line streaming inside onboarding early steps:
  - `preflight` and `prepare-host` now forward stdout/stderr lines to panel live setup log stream.
- Kept marker check as a final sanity guard, but now with structured diagnostics instead of opaque error-only text.

Change type:

- `stability fix` — onboarding step failure transparency
- `local patch` — prepare-host robustness and live diagnostics stream

## 2026-04-17 Onboarding Preflight Shell Normalization Fix

- Investigated repeated durable onboarding failure on preflight:
  - `preflight failed: Exit code: 2 ... sh: 1: set: Illegal option -o t`.
- Found command assembly issue in onboarding shell wrapper:
  - previous script normalization flattened multiline script into `;`-joined one-liner;
  - this could produce invalid shell grammar around block keywords (`do/then`) on remote `/bin/sh`.
- Updated `src/services/nodeOnboardingHandlers.js`:
  - added safe single-quote shell escaper for command payloads;
  - `buildNonLoginShCommand(...)` now preserves real multiline script structure (`\n`) instead of semicolon flattening;
  - still executes via non-login `sh -c` to avoid login-shell profile side effects.
- Deployed fix to test stand with image commit `49b1867` and verified deployment completed `running:healthy`.

Change type:

- `stability fix` — durable onboarding preflight shell compatibility

## 2026-04-17 Verify-Runtime Status Normalization + Retry

- Investigated false onboarding failure after successful runtime setup:
  - `verify-runtime-local` failed with `Runtime is offline (no status)` even when `xray.service` was active in logs.
- Root cause:
  - status checks returned string states (`online/offline/error`), while verify handler expected object shape (`{ online, status, error }`);
  - immediate verify could also race with short service restart windows.
- Updated `src/services/nodeOnboardingHandlers.js`:
  - added runtime status normalizer supporting both string and object formats;
  - switched verify logic to normalized status model;
  - added bounded retry loop for runtime verify (`8` attempts, `1.5s` interval).
- Deployed commit `9f066c8` to test stand; deployment finished healthy.

Change type:

- `stability fix` — onboarding runtime verification correctness and race tolerance

## 2026-04-17 Cascade Builder Failed-Only Export + Execution Filter

- Extended cascade execution diagnostics in builder:
  - added `Failed JSON` export action (compact payload only for failed chains);
  - kept existing TXT / compact-failed TXT / full JSON exports untouched.
- Added execution result filter switch in builder diagnostics:
  - `All / Failed / Success` filter chips;
  - chain cards now render by selected filter;
  - summary counters remain global for the whole execution run.
- Added empty-state handling for filtered list:
  - explicit message when selected filter has no matching chains.
- Updated locales (`ru`/`en`) and builder styling:
  - i18n labels for new export and filters;
  - compact segmented filter control styles for light/dark themes.

Change type:

- `local patch` — cascade builder diagnostics UX

## 2026-04-17 Mixed-Run QA Runbook For Cascade Execution

- Added dedicated QA runbook:
  - `docs/cascade-mixed-run-checklist.ru.md`
- Runbook covers:
  - mixed execution scenario setup (success + failed chains in one run);
  - execution filter verification (`All / Failed / Success`);
  - export verification matrix:
    - full TXT,
    - compact failed TXT,
    - compact failed JSON,
    - full JSON;
  - expected `Failed JSON` payload shape and invariants;
  - PASS/FAIL criteria and incident report template.

Change type:

- `continuity` — practical test template for cascade execution parity

## 2026-04-17 Error-Detail Quick Actions + Failed Batch Rerun

- Extended builder execution diagnostics interactivity:
  - rendered actionable controls directly from `errorDetails[].suggestedActions`;
  - supported actions in detail cards:
    - rerun chain,
    - focus node,
    - repair node,
    - open/check node card.
- Added batch operator action in execution toolbar:
  - `Rerun failed` reruns only failed chains from current execution.
- Updated frontend rerun flow:
  - `rerunExecutionChain(...)` now supports `showToast` to keep batch runs readable.
- Updated styles and i18n for new diagnostics controls:
  - files: `public/js/cascade-builder.js`, `public/css/cascade-builder.css`, `views/cascade-builder.ejs`, `src/locales/ru.json`, `src/locales/en.json`.
- Deployed to stand:
  - code commit `008f422`;
  - Coolify deployment `zbk88zcm7adt3pkjai6v1oth`;
  - final status: `running:healthy`.

Change type:

- `local patch` — cascade builder diagnostics + repair/rerun UX

## 2026-04-17 Hop Diagnostics Deepening + Legacy Status Trim

- Added hop-level endpoint context to enriched chain failure diagnostics:
  - `hopSourceNodeId`, `hopTargetNodeId`,
  - `hopSourceNodeName`, `hopTargetNodeName`.
- Extended suggested actions for hop-focused failures:
  - `open-hop-nodes`,
  - `repair-hop-nodes`.
- Added frontend handling for new hop actions:
  - open source/target node pages from diagnostics,
  - repair both hop nodes and rerun chain flow.
- Continued staged legacy retirement in non-critical status path:
  - in `/panel/nodes/:id/setup-status` legacy in-memory setup map is now consulted only when:
    - legacy mode is selected, or
    - legacy setup is actively running.
- Deployed code commit:
  - `e32055b` (`feat: deepen hop diagnostics actions and trim legacy status fallback`).

Change type:

- `local patch` — cascade execution diagnostics depth

## 2026-04-18 Cascade Builder UX Stabilization + Internet Egress Layer

- Fixed builder connect instability that produced temporary extra/ghost lines before page refresh:
  - removed local optimistic edge insert on connect accept and switched to authoritative `loadState()` refresh;
  - added in-flight guard to block duplicate connect submissions;
  - disabled edgehandles preview artifacts in current bundle (`preview: false`);
  - disabled tap-fallback on desktop when edgehandles is available (kept fallback for coarse pointers / no edgehandles).
- Added explicit Internet context directly in builder:
  - virtual `Internet` node on canvas;
  - virtual egress edges from detected exit nodes (nodes with no downstream hops);
  - right-side `Internet` section showing current egress nodes.
- Improved cascade validation clarity (`why this won't work`):
  - bidirectional hop conflict detection;
  - mixed reverse/forward mode in one connected chain marked as invalid;
  - no-Internet-egress validation;
  - strict single-upstream/single-downstream constraints for current builder iteration.
- Localized new validation and Internet UI copy for `ru` + `en`.
- Code commit:
  - `96e70b1` — `fix: stabilize builder links and add internet egress context`.

Change type:

- `local patch` — builder UX/logic hardening
- `stability fix` — connect flow dedupe + ghost-line prevention
- `stability fix` — onboarding status-path legacy read minimization

## 2026-04-17 Live Mixed-Run Verification (Operational)

- Verified real mixed-run snapshot from stand dump:
  - `chains=2`, `deployedChains=1`, `failedChains=1`.
- Confirmed failed chain contains enriched hop fields and new action hints in `errorDetails`.
- Captured live topology via:
  - `GET /api/cascade-builder/state`,
  - `GET /api/cascade/links`.
- Cleanup of temporary test topology was started but not completed due session stop request:
  - temporary active links and `QA-FAIL-MIX` node removal deferred to next session.

Change type:

- `continuity` — operational verification + deferred cleanup handoff

## 2026-04-17 Stand Cleanup Completion After Mixed-Run

- Completed pending stand cleanup after mixed-run validation:
  - deleted temporary active links:
    - `69e267f6a6d4f3277dcf1a31`,
    - `69e267f6a6d4f3277dcf1a2c`;
  - deleted temporary node:
    - `69e265b21238cf4d4b3fc916` (`QA-FAIL-MIX`);
  - deleted stale inactive QA-link:
    - `69e266941238cf4d4b3fc97b`.
- Re-verified topology post-cleanup:
  - builder state summary now clean (`nodes=3`, `hops=0`, `draftHops=0`);
  - `/api/nodes` shows only baseline node set.

Change type:

- `continuity` — stand topology normalization / cleanup completion

## 2026-04-17 Hop Endpoint Status Diagnostics (Depth Increment)

- Extended cascade execution diagnostics payload:
  - added `hopSourceNodeStatus`,
  - added `hopTargetNodeStatus`
  in `errorDetails` for hop-attributed failures.
- Extended builder diagnostics card rendering:
  - now shows endpoint line with source/target node names and statuses.
- Added locale keys (`ru`/`en`):
  - `executionHopEndpoints`,
  - `statusUnknown`.
- Pushed code commit:
  - `a048834` (`feat: enrich hop endpoint status diagnostics in builder execution`).
- Deployed commit to stand:
  - deployment UUID: `b5jtcgvrpuct3kvst7se9z5z`;
  - status: `finished`;
  - app: `running:healthy`.

Change type:

- `local patch` — cascade execution diagnostics depth

## 2026-04-18 Builder Reset/Disconnect + Fullscreen UX Pass

- Solved operator-side link management gaps in cascade builder:
  - reset button now clears **all current links** (draft + live), not drafts-only;
  - right-click on line now disconnects selected hop;
  - selected hop can be removed by keyboard (`Delete` / `Backspace`);
  - live hop inspector now has explicit `Disconnect link` action.
- Improved graph readability:
  - edge endpoints now anchor to port centers for cleaner point alignment;
  - status color split:
    - online/active/deployed — Java flow;
    - pending — muted dashed;
    - offline/error/failed — red dashed;
  - flow animation now covers active statuses + Internet egress edges.
- Improved builder navigation:
  - Fullscreen API integrated (native fullscreen + fallback class mode);
  - toggle/icon/text syncs on `fullscreenchange`, exit via `Esc`;
  - inspector auto-scrolls to top when node/hop/Internet is selected.
- Internet UX:
  - right-side Internet list items are now clickable and focus related exit nodes.
- Localized new UI copy (`ru` + `en`) for reset/disconnect flows.
- Code commit:
  - `e09ac95` — `feat: improve cascade builder reset/disconnect UX and fullscreen`
- Deployed to stand:
  - deployment `l3zntrbwr90pks4tx9ns7mst` finished;
  - app status `running:healthy`.

Change type:

- `local patch` — cascade builder UX/logic
- `stability fix` — deterministic link reset/disconnect controls

## 2026-04-18 Builder Curves + Drag-To-Empty Disconnect

- Added a disconnect gesture fallback for operators:
  - when drag-connect starts from node OUT port and ends on empty canvas, builder now offers disconnect for the outgoing link of that source node;
  - protected against false positives:
    - short accidental taps are ignored;
    - gesture is ignored when a valid target was hovered during drag;
    - if a node has multiple outgoing links, UI asks to use exact line disconnect (right-click) instead of ambiguous auto-remove.
- Improved edge routing/readability on dense graphs:
  - switched hop edges to `unbundled-bezier` with data-driven curve offsets;
  - added deterministic per-hop curve fanout and reverse-direction bias;
  - updated edge rendering to use rounded joins/caps and `vee` arrows;
  - virtual Internet egress edges now share the same smooth routing model.
- Added new i18n strings (`ru`/`en`) for drag disconnect hints.
- Code commit:
  - `386317d` — `feat: add drag-to-empty disconnect gesture and smooth builder curves`
- Deployed to stand:
  - deployment `y6rq8z8oe2fj6mmcd5onwucp` finished;
  - app status `running:healthy`.

Change type:

- `local patch` — cascade builder connect/disconnect UX
- `ux` — graph readability / dense edge routing

## 2026-04-18 Builder Validation Clarity + Reset Hardening + Xray Log Permission Repair

- Strengthened cascade builder operator UX:
  - validation panel now includes explicit error/warning counters;
  - validation items now show context metadata (code/hop/node) and are clickable to focus failing hop/node on canvas;
  - reset/disconnect path for live links now includes robust ObjectId fallback candidates (`hop.id`, `hop.edgeId`, `hop.linkId`) to avoid id-format mismatch failures.
- Removed remaining ambiguity from draft edge IDs:
  - `/api/cascade-builder/connect` now uses one shared nonce for `id` and `edgeId`.
- Fixed durable onboarding/runtime regression seen in live logs:
  - `xray` failed with `permission denied` on `/var/log/xray/access.log`;
  - added ownership/permission repair (`nobody:nogroup` fallback `nobody:nobody`, `750` dir, `640` files) in:
    - host prepare step (`nodeOnboardingHandlers`),
    - Xray install/runtime setup (`nodeSetup`),
    - CC-agent install path touching `/var/log/xray`.
- Code commit:
  - `683c013` — `fix: harden link reset UX and repair xray log permissions in onboarding`
- Deployed to stand:
  - deployment `z11s5wx8k1d29ztjgofqc1g5` finished;
  - app status `running:healthy`.

Change type:

- `local patch` — cascade builder diagnostics + unlink controls
- `stability fix` — durable onboarding Xray runtime startup permissions

## 2026-04-18 Onboarding Reports UX + Hybrid Sidecar Requirement Gate (shipped)

- Finished onboarding jobs UX wave:
  - added backend API to clear onboarding jobs by scope:
    - `DELETE /api/nodes/:id/onboarding/jobs?scope=completed|terminal&keepLatest=N`;
  - node management now has:
    - `Hide completed` checkbox;
    - `Clear completed` action;
    - collapsible onboarding job cards with expand/collapse state.
- Files shipped:
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/src/services/nodeOnboardingService.js`
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/src/routes/nodes.js`
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/views/partials/node-form/management.ejs`
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/views/partials/node-form/scripts.ejs`
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/src/locales/ru.json`
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/src/locales/en.json`

- Finished Hysteria sidecar stabilization pass for standalone/no-active-overlay topology:
  - sidecar is now treated as required only when active cascade links need overlay on node;
  - standalone config path strips reserved `__cascade_sidecar__` outbound + ACL rules;
  - hybrid smoke-check no longer fails when sidecar is configured but topology does not require overlay.
- Files shipped:
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/src/services/nodeSetup.js`
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/src/routes/panel/nodes.js`

- Code commit:
  - `8854c80` — `feat: improve onboarding jobs UX and sidecar standalone gating`
- Deployment:
  - forced Coolify deploy UUID: `baw9e7yrm7a6ofi5y8lp1jar`
  - status: `finished`, app `running:healthy`
  - built commit SHA: `8854c80e36128a2077bd74342a9c8ea1765c16e1`

- Live checks after deploy:
  - `/panel/login` serves fresh versioned assets (`/css/style.css?v=1776529314038`);
  - `DELETE /api/nodes/:id/onboarding/jobs?scope=completed` returns `success: true` on stand;
  - Hysteria smoke-check with `sidecar=true` and no active relevant links now returns `success: true`
    (checks are marked `not required (overlay disabled for current topology)` instead of false-fail).

Change type:
- `local patch` — onboarding jobs lifecycle UX
- `stability fix` — sidecar activation gate for standalone hysteria
- `deployment` — forced stand redeploy + live smoke verification

## 2026-04-18 Cascade Builder Realtime Link/Dedupe Hardening (shipped)

- Fixed cascade-builder instability reported in live UX pass:
  - duplicate/extra links after connect attempts;
  - reset/unlink not feeling realtime until full page refresh;
  - need to support connect drag from node card body (not only tiny port circles).
- Code changes in:
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/public/js/cascade-builder.js`
    - edgehandles now accept both node cards and out-port handles as source;
    - connect validator now accepts node-body source endpoints safely;
    - client-side duplicate guard (`source->target`) before connect request;
    - optimistic local prune of removed hop/edge for realtime reset feedback.
- Code commit:
  - `3e895f9` — `fix: harden cascade connect dedupe and realtime link reset`
- Deployment:
  - pushed to `main`; stand auto-deploy expected from Coolify webhook.

Change type:
- `stability fix` — cascade connect/reset behavior under real operator flow

## 2026-04-18 Cascade Builder Node-Drag Connect + Realtime Reset Convergence (shipped)

- Worked on follow-up UX issues from live `xray-relay-xray` run:
  - occasional extra links in canvas after connect;
  - need to connect by dragging from node card body (not only port circles);
  - reset/disconnect should converge in UI without manual page refresh.
- Shipped in:
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/public/js/cascade-builder.js`
- Changes:
  - added body-drag connect trigger (`tapstart` on right side of node card starts edge draw);
  - added render-time hop normalization/dedupe by directional pair for stable canvas state;
  - strengthened realtime unlink path (`prune + summary/validation/internet rerender` without forced reload);
  - reset links now performs bounded re-poll (`loadState` retries) until post-reset hop count converges.
- Code commit:
  - `017a100` — `fix: improve cascade connect drag and realtime link reset sync`
- Delivery:
  - pushed to `main` (`origin/main` updated).

Change type:
- `stability fix` — cascade builder link rendering and reset consistency
- `ux polish` — node-body drag connect flow

## 2026-04-19 Cascade Builder Desktop Drag Gesture Fallback (shipped)

- Fixed remaining UX gap where links were still created mostly via port circles.
- Updated:
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/public/js/cascade-builder.js`
- Changes:
  - added explicit desktop gesture flow:
    - `mousedown` on right half of source node body starts connect intent;
    - `mouseup` on target node creates draft hop;
    - `mouseup` on empty canvas cancels intent cleanly.
  - preserved tap/port behavior as compatibility path.
- Code commit:
  - `e01f8ac` — `fix: add node-body drag connect fallback in cascade builder`

Change type:
- `ux polish` — desktop node-to-node drag connect

## 2026-04-19 Cascade Builder Port Drag + Dark Theme Alignment (shipped)

- Delivered full mouse flow for creating links from port circle to port circle with visible drag line.
- Updated files:
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/public/js/cascade-builder.js`
  - `/Users/voznyuk/Documents/GitHub/CELERITY-panel/public/css/cascade-builder.css`
- Builder changes:
  - custom desktop connect gesture:
    - `mousedown` on OUT port starts drag session;
    - dashed line is rendered live above canvas during drag;
    - `mouseup` on IN port or node commits draft hop;
    - release to empty canvas cancels cleanly.
  - added IN-port highlight while drag session is active.
- Theme changes:
  - cascade page dark-mode selectors migrated to app theme source (`:root[data-theme="dark"]`) so dark theme applies consistently with global switcher.
- Code commit:
  - `196cfc8` — `feat: add port-to-port drag line and dark-theme support for cascade page`

Change type:
- `ux polish` — full port-to-port mouse flow with visible line
- `stability fix` — cascades page dark-theme selector consistency
