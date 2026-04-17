# Development Log

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
