# Session Handoff

## Current State

- State: `pending`
- Repository mode: isolated operational fork
- Deployment mode in active use: Coolify + `docker-compose.coolify.yml`
- Current active stand: `https://tunnel.hiddenrabbit.net.ru/panel`
- Current working focus: onboarding-first setup reliability + practical cascade-builder execution path on live test nodes.
- Current local patch focus:
  - hardened early onboarding steps (`preflight`, `prepare-host`) with real SSH failure details and live step output;
  - fixed durable preflight shell wrapper to preserve multiline script semantics under `/bin/sh`;
  - fixed runtime verify step to correctly parse runtime status and tolerate startup races;
  - added builder-side `commit + deploy` bridge over draft hops;
  - added builder-side per-hop draft settings editor with backend payload validation and per-hop remove;
  - added builder-side advanced transport settings for draft hops (WS/gRPC/XHTTP fields);
  - replaced builder runtime CDN graph dependency with local vendor graph assets via postinstall sync.
  - added builder-side draft security settings for TLS/REALITY and commit-time REALITY key fallback.
  - added builder-side durable execution diagnostics for `commit + deploy`:
    - richer per-chain deploy diagnostics payload;
    - persisted `lastExecution` in builder draft cache;
    - dedicated diagnostics panel on the builder page.
    - one-click copy diagnostics action from execution panel.
    - dual export actions from execution panel (`TXT` + `JSON`).
    - compact failed-only export action for quick incident sharing.
  - staged retirement of legacy setup mirror for onboarding-full:
    - setup start for onboarding-full no longer initializes `setupJobs`;
    - onboarding runner no longer writes success/error states into `setupJobs`;
    - setup-status for onboarding now uses durable onboarding logs directly.
  - fixed Docker/Coolify build flow for cascade local vendor assets (`postinstall` guard + explicit sync after source copy in Dockerfile).
  - verify fresh-node run and continue parity work (`setupJobs` retirement + Hysteria live stream).

## 2026-04-17 Onboarding-Full SetupJobs Retirement (Stage Increment)

### What was delivered

- `src/routes/panel/nodes.js`:
  - onboarding-full start path (`POST /panel/nodes/:id/setup`) no longer creates a `setupJobs` running mirror entry;
  - durable onboarding runner no longer writes success/failure job state into `setupJobs`;
  - setup-status onboarding branch now reports logs from durable onboarding only (`stepLogs`), without mixing in-memory mirror logs;
  - added durable live-log append helper that writes onboarding line events directly to job logs (`appendStepLog`), with light noise filtering.

### Current stop-point

- `setupJobs` remains active for legacy setup flow.
- onboarding-full now behaves as onboarding-primary in status/control reporting, with in-memory setup map no longer required in its main status path.
- This is a staged increment (not full `setupJobs` removal yet).

### Best next step

1. Live smoke onboarding-full on fresh node:
   - verify `setup-status` shows step logs and state transitions without relying on in-memory setup mirror.
2. Remove remaining onboarding-full read paths from `setupJobs` (if any) after one more stable smoke cycle.
3. Continue cascade builder execution parity work (deeper chain diagnostics UX actions + quick operator actions on failed chain items).

## 2026-04-17 Cascade Diagnostics Structured Export Stop-Point

### What was delivered

- `views/cascade-builder.ejs`:
  - execution diagnostics header now has two explicit export actions:
    - `Copy TXT`
    - `Copy JSON`.
- `public/js/cascade-builder.js`:
  - added structured execution export payload builder with stable envelope:
    - `exportType`,
    - `exportedAt`,
    - execution snapshot body (`commit/deploy/failures/results`);
  - split clipboard logic into shared helper;
  - separate copy handlers for text and JSON modes.
- Locales:
  - `src/locales/ru.json`, `src/locales/en.json` updated with export labels/feedback.
- Styling:
  - `public/css/cascade-builder.css` action group now wraps safely for compact widths.

### Current stop-point

- Builder execution panel now supports practical runbook export in two formats without page reload or manual formatting.
- Export scope is intentionally UI-level clipboard first (no backend file endpoint yet).

### Best next step

1. Add one-click “copy compact incident summary” for failed chains only.
2. Add per-chain quick actions in diagnostics (jump to hop / focus chain context on canvas).
3. Continue onboarding staged retirement (`setupJobs`) in remaining non-critical guard paths after one more stable smoke cycle.

## 2026-04-17 Cascade Diagnostics Failed-Only Export Stop-Point

### What was delivered

- `views/cascade-builder.ejs`:
  - added execution diagnostics action `Failed only`.
- `public/js/cascade-builder.js`:
  - added compact failed-chain export builder:
    - includes only failed chain entries,
    - one-line chain summary + first error text.
- Locales:
  - `src/locales/ru.json`
  - `src/locales/en.json`

### Current stop-point

- Operators now have 3 export paths in execution panel:
  - full text,
  - compact failed-only text,
  - full JSON.

### Best next step

1. Add quick “focus failed chain” action from diagnostics card to canvas selection.
2. Add compact failed-only JSON option if incident tooling needs structured reduced payload.
3. Continue staged retirement of non-critical `setupJobs` legacy paths.

## 2026-04-17 Cascade Builder Execution Diagnostics Stop-Point

### What was delivered

- Backend (`src/routes/cascadeBuilder.js`):
  - commit/deploy response now includes richer deployment details per chain:
    - chain metadata (mode, start node, hop names, node actions, warnings);
    - localized error normalization for deploy failures;
  - commit run now produces a normalized execution snapshot (`execution`) with:
    - commit outcome,
    - failed draft items,
    - deployment summary/results;
  - snapshot is persisted in builder draft storage as `lastExecution`.
- Draft storage path:
  - `src/services/cacheService.js` now persists `lastExecution` in builder draft payload.
  - `src/domain/cascade-builder/flowNormalizer.js` now exposes `draft.lastExecution` in builder state.
- UI (`views/cascade-builder.ejs`, `public/js/cascade-builder.js`, `public/css/cascade-builder.css`):
  - added dedicated “last execution result” diagnostics box;
  - renders commit-only and commit+deploy summaries, per-chain details, warnings/errors, and node actions;
  - execution block survives page reload via persisted `draft.lastExecution`.
- Locales:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added builder execution diagnostics labels.

### Current stop-point

- Builder now has a practical operator-visible “what happened” layer after commit/deploy runs.
- Diagnostics are no longer limited to coarse success/fail counters and no longer disappear on refresh.
- Flow remains transitional (`draft -> legacy link + legacy deployChain`), but execution observability is materially better.

### Best next step

1. Live smoke on stand with 2-3 mixed draft hops:
   - run `Commit and deploy`,
   - verify execution panel content and per-chain diagnostics parity with actual node outcomes.
2. Add optional structured export format (json/text modes) for execution diagnostics if needed for external runbooks.
3. Continue staged retirement of legacy setup status/control-path (`setupJobs`) outside onboarding-primary paths.

## 2026-04-17 Docker-Safe Cascade Vendor Sync Stop-Point

### What was delivered

- `package.json`:
  - `postinstall` no longer hard-fails in Docker pre-copy stage when `scripts/sync-cascade-vendors.js` is not yet present;
  - hook now safely skips with informative message in that stage.
- `Dockerfile`:
  - added explicit `RUN npm run sync:cascade-vendor` after `COPY . .` so local graph vendor files are guaranteed during container build.
- Result:
  - Coolify deployment that previously failed on missing sync script now completes successfully.

### Current stop-point

- Stand is updated and healthy on commit `b43f75a`.
- Cascade builder local graph asset strategy is now compatible with Coolify Docker build order.
- Immediate blocker for continuing cascade feature development is removed.

### Best next step

1. Continue cascade development track from builder UX/logic roadmap (without touching this deployment plumbing again unless regression appears).
2. Start next functional increment for cascade flow execution parity and diagnostics depth.
3. Keep onboarding parity track in parallel (legacy status/control-path retirement).

## 2026-04-17 Cascade Builder TLS/REALITY Draft Security Stop-Point

### What was delivered

- `public/js/cascade-builder.js` + `views/cascade-builder.ejs`:
  - draft inspector now has security-aware sections:
    - TLS/REALITY: SNI list + fingerprint;
    - REALITY: destination + shortId.
  - sections toggle by selected tunnel security.
- `src/routes/cascadeBuilder.js`:
  - draft update endpoint now validates/saves security fields;
  - localized validation errors added for invalid fingerprint/shortId;
  - commit bridge now propagates security fields into created legacy links;
  - REALITY links now auto-generate valid keypair/shortId at commit when draft does not provide valid key material.
- `src/domain/cascade-builder/flowValidator.js` + `flowNormalizer.js` + `commitPlanner.js`:
  - defaults/state/preview now carry security fields;
  - commit assumptions include REALITY auto-generation behavior.
- locales:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added security labels, validation messages, and planning assumption text.

### Current stop-point

- Builder now supports base per-hop transport + security editing before commit/deploy.
- REALITY draft commits are safer because missing key material no longer silently breaks deployment payload.
- Flow is still transitional (`draft -> legacy link`), but operator control and commit resilience improved materially.

### Best next step

1. Live smoke:
   - draft with `security=none`, `tls`, and `reality`;
   - run plan preview + commit/deploy;
   - verify resulting `CascadeLink` security fields and deploy diagnostics.
2. Continue with deeper per-hop policy knobs (beyond base TLS/REALITY fields).
3. Keep onboarding parity track running in parallel until legacy fallback can be retired safely.

## 2026-04-17 Cascade Builder Local Graph Assets Stop-Point

### What was delivered

- `views/cascade-builder.ejs` now loads builder graph libs from local static paths under `/vendor/cascade/*` instead of external CDN links.
- Added graph-vendor sync script:
  - `scripts/sync-cascade-vendors.js`
  - copies pinned package assets from `node_modules` into `public/vendor/cascade`.
- `package.json` updates:
  - added dependencies: `cytoscape`, `dagre`, `cytoscape-dagre`, `cytoscape-edgehandles`;
  - added scripts:
    - `sync:cascade-vendor`
    - `postinstall` (auto vendor sync).
- `.gitignore` updated:
  - `public/vendor/cascade/` ignored because assets are generated deterministically during install/build.

### Current stop-point

- Builder page no longer depends on external CDN availability to render the graph tooling.
- Graph assets are now reproducible from lockfile-pinned npm dependencies.
- Existing builder fallback behavior remains intact if graph init still fails at runtime.

### Best next step

1. Live smoke on stand:
   - open `/panel/cascades/builder` in light/dark and mobile viewport;
   - verify graph initialization and drag-connect behavior.
2. Continue per-hop editor deepening into security/policy knobs (REALITY/TLS-level fields).
3. Keep onboarding parity track moving in parallel without removing legacy fallback early.

## 2026-04-17 Cascade Builder Advanced Transport Draft Settings Stop-Point

### What was delivered

- `src/routes/cascadeBuilder.js`:
  - draft-hop update now accepts/validates advanced transport fields:
    - `wsPath`, `wsHost`, `grpcServiceName`, `xhttpPath`, `xhttpHost`, `xhttpMode`;
  - added strict XHTTP mode allowlist and localized validation error for invalid mode;
  - commit bridge now propagates advanced transport fields into created legacy `CascadeLink` records;
  - draft creation from drag-connect now seeds advanced defaults.
- `src/domain/cascade-builder/*`:
  - normalizer now carries advanced transport fields in builder state;
  - draft suggestion defaults include WS/gRPC/XHTTP fields;
  - commit planner preview payload now includes advanced fields and assumptions are no longer marked as defaulted when fields were explicitly changed.
- `public/js/cascade-builder.js` + `public/css/cascade-builder.css` + `views/cascade-builder.ejs`:
  - draft inspector now has transport-specific sections:
    - WS: path/host;
    - gRPC: service name;
    - XHTTP/splithttp: path/host/mode;
  - transport sections switch dynamically by selected transport;
  - advanced values are persisted through existing draft save flow.
- locales:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added labels/messages for advanced transport settings and XHTTP-mode validation.

### Current stop-point

- Builder draft editing now covers both base hop settings and transport-specific WS/gRPC/XHTTP fields.
- Commit+deploy bridge now preserves advanced transport payload instead of dropping it to hardcoded defaults.
- Flow remains transitional (draft -> legacy link bridge), but operator control over hop payload is materially deeper.

### Best next step

1. Run live smoke on stand:
   - draft hop with each transport variant (WS/gRPC/XHTTP),
   - save, preview, commit+deploy,
   - verify persisted `CascadeLink` payload and deployment diagnostics.
2. Remove CDN dependency for builder graph libs (local bundled assets), keeping current fallback behavior.
3. Continue toward deeper per-hop security/policy fields (REALITY/TLS knobs) after transport-level parity confirmation.

## 2026-04-17 Cascade Builder Per-Hop Draft Settings Stop-Point

### What was delivered

- `src/routes/cascadeBuilder.js`:
  - added `PATCH /api/cascade-builder/drafts/:hopId`;
  - added `DELETE /api/cascade-builder/drafts/:hopId`;
  - introduced strict normalization/allowlists for editable draft-hop fields:
    - `mode`, `tunnelProtocol`, `tunnelTransport`, `tunnelSecurity`, `tunnelPort`, `muxEnabled`, `name`;
  - update path now validates tentative flow before draft persistence and returns localized validation payload on reject.
- `public/js/cascade-builder.js` + `public/css/cascade-builder.css` + `views/cascade-builder.ejs`:
  - inspector now renders an editable form for draft hops;
  - added in-inspector actions:
    - save draft settings;
    - remove single draft hop;
  - improved selection restore behavior after reload so inspector focus remains on edited hop.
- locales:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added draft editor labels, toasts, and validation error keys.

### Current stop-point

- Draft hops can now be edited before commit/deploy from within builder inspector.
- Draft mutation is now safer because invalid field combinations are rejected server-side before persistence.
- Advanced transport-specific settings (WS/gRPC/XHTTP extra fields) are still not exposed in builder editor.

### Best next step

1. Run live smoke on stand:
   - create draft hop,
   - edit hop settings in inspector,
   - run `Deploy preview`,
   - run `Commit and deploy`,
   - verify resulting `CascadeLink` payload/deploy logs.
2. Add second-stage advanced hop settings editor:
   - WS path/host,
   - gRPC service name,
   - XHTTP path/host/mode.
3. Keep onboarding parity track in parallel without dropping legacy fallback prematurely.

## 2026-04-17 Cascade Builder Commit+Deploy Stop-Point

### What was delivered

- `src/routes/cascadeBuilder.js`:
  - `POST /api/cascade-builder/commit-drafts` now supports `deployAfterCommit`;
  - commit path now checks planner blockers per draft hop before attempting mutation;
  - committed drafts can now trigger chain deployment via `cascadeService.deployChain(...)`;
  - response now includes `deployment` diagnostics (`chains`, `deployedChains`, `failedChains`, per-chain errors).
- `src/domain/cascade-builder/commitPlanner.js`:
  - chain previews now include `nodeIds` so backend can pick deterministic deploy seeds.
- `views/cascade-builder.ejs` + `public/js/cascade-builder.js`:
  - new `Commit and deploy` action;
  - front-end now handles deployment diagnostics and displays partial-failure details in validation feed.
- locales:
  - `src/locales/ru.json`
  - `src/locales/en.json`
  - added new builder strings for commit+deploy and blocked-by-plan messaging.

### Current stop-point

- Experimental builder is no longer commit-only:
  - operator can now run `draft -> commit -> deploy` in one flow.
- Safe staged path remains:
  - regular `commit draft hops` still works without deployment side effects.
- Deploy execution remains legacy-backed chain deploy:
  - this is transitional and intentionally not a flow-native deploy engine yet.

### Best next step

1. Run live builder smoke test on fresh test nodes:
   - create 1-2 draft hops,
   - run `Deploy preview`,
   - run `Commit and deploy`,
   - verify resulting `CascadeLink` state and chain deployment logs.
2. Add per-hop pre-commit settings editor (port/mode/protocol/security) inside builder inspector.
3. Keep onboarding parity track in parallel (legacy status-path retirement) after cascade smoke confirmation.

## 2026-04-17 Verify-Runtime False Offline Fix Stop-Point

### What was delivered

- `src/services/nodeOnboardingHandlers.js`:
  - added `normalizeRuntimeStatus(...)` to support both legacy string and structured object status formats;
  - `runVerifyRuntimeLocal(...)` now:
    - uses normalized status model;
    - retries runtime check with bounded backoff (`8 x 1.5s`) before hard fail.
- Targeted failure fixed:
  - `verify-runtime-local — Runtime is offline (no status)` while runtime logs already showed active `xray.service`.
- Deployed:
  - commit `9f066c8`
  - stand status `running:healthy`.

### Current stop-point

- Durable onboarding no longer fails `verify-runtime-local` because of status-shape mismatch.
- Runtime verification is more resilient to short service restart windows.

### Best next step

1. Re-run onboarding on fresh node and confirm stable pass through:
   - `preflight -> prepare-host -> install-runtime -> write-runtime-config -> verify-runtime-local`.
2. Continue next failures (if any) step-by-step using diagnostics card details.
3. After runtime/agent parity confidence, continue staged retirement of remaining legacy status bridges.

## 2026-04-17 Preflight Shell Wrapper Fix Stop-Point

### What was delivered

- `src/services/nodeOnboardingHandlers.js`:
  - replaced semicolon-flattened shell command assembly in `buildNonLoginShCommand(...)`;
  - added safe single-quote command escaper;
  - onboarding preflight/prepare-host scripts now run as preserved multiline scripts via non-login `sh -c`.
- Root issue addressed:
  - durable preflight could fail with:
    - `preflight failed: Exit code: 2`
    - `sh: 1: set: Illegal option -o t`
  - this was caused by malformed shell grammar in flattened one-line script assembly.
- Deployed to stand:
  - commit `49b1867`
  - application `running:healthy`.

### Current stop-point

- The shell command builder for early onboarding steps is now structurally safe for `/bin/sh` parsing on fresh hosts.
- Production verification on a fresh node run is pending (user retest needed on `Настроить автоматически` or `Повторить шаг`).

### Best next step

1. Re-run onboarding preflight on fresh server and confirm `preflight -> prepare-host` pass from first attempt.
2. If any error remains, use the diagnostics block (stderr/stdout tails + step details) as the exact patch input.
3. Continue next prioritized onboarding work:
   - diagnostics/actions UI expansion;
   - legacy fallback preservation until parity;
   - staged removal of in-memory setup status dependency.

## 2026-04-17 Prepare-Host Failure Fix Stop-Point

### What was delivered

- `src/services/nodeOnboardingHandlers.js`:
  - added structured SSH failure helper for onboarding steps;
  - `runPreflight` and `runPrepareHost` now:
    - validate `execSSH` success explicitly;
    - include SSH code/error/stdout/stderr tail in failure details;
    - stream stdout/stderr lines into onboarding live log channel;
  - `prepare-host` now tolerates path collisions (file where directory expected) before creating runtime dirs.
- Continuity docs updated (`DEVELOPMENT-LOG`, `SESSION-LEDGER`, `KNOWN-ISSUES`, this handoff).

### Current stop-point

- Failure message `Prepare-host marker missing in SSH output` is no longer the only signal; onboarding should now expose actionable SSH diagnostics.
- Early onboarding steps now produce richer live logs while running.
- Fresh-node validation run is still required after this patch.

### Best next step

1. Re-run `Настроить автоматически` on a fresh node and verify first-pass completion.
2. If it fails, inspect diagnostics payload (now includes SSH code + stderr tail) and patch exact failing command.
3. Apply the same detailed diagnostic strategy to later onboarding steps as needed.

## 2026-04-17 Live Setup Logs + Severity Stop-Point

Addressed the immediate operator pain from fresh auto-setup runs: false red output and delayed console visibility.

### What was delivered

- `src/services/nodeSetup.js`:
  - `execSSH(...)` now supports line callbacks (`onStdoutLine` / `onStderrLine`) and returns `stdout/stderr` alongside `output`;
  - Xray setup path now streams installer/service output line-by-line when `onLogLine` is provided;
  - cc-agent installer and sanity checks now stream line-by-line;
  - `setupXrayNodeWithAgent(...)` forwards live stream callback and avoids duplicate full-output dump when streaming is enabled.
- `src/routes/panel/nodes.js`:
  - added setup live-log helpers (`appendSetupJobLiveLog`, merge/trim helpers);
  - legacy Xray setup now pushes live remote lines directly into setup-status stream;
  - durable onboarding runner now receives `onLogLine` and writes live lines into the same stream buffer;
  - setup-status now merges onboarding logs with live setup stream while job is running.
- `src/services/nodeOnboardingRunner.js`:
  - emits step start/completed/failed live lines.
- `src/services/nodeOnboardingHandlers.js`:
  - runtime/agent handlers forward line-stream callback into node setup routines.
- `views/partials/node-form/scripts.ejs`:
  - fixed log highlighting: `[STDERR]` is no longer auto-error;
  - added neutral stderr style and stricter critical-pattern detection.

### Current stop-point

- Xray onboarding/setup output now arrives incrementally in panel polling loop (2s cadence) instead of only after command completion.
- Benign stderr no longer looks like hard failure by default.
- Legacy fallback still exists; Hysteria path is not yet upgraded to the same live line stream channel.

### Best next step

1. Validate on a clean Xray node that first-run output is now readable and status remains green without second pass.
2. Apply the same live line stream callback pattern to `setupNode(...)` (Hysteria path).
3. Continue staged retirement of legacy in-memory setup mirror after parity confirmation.

## 2026-04-17 setupJobs Status Retirement + Step Rerun Stop-Point

Completed the next stage requested after diagnostics rollout.

### What was delivered

- `src/routes/panel/nodes.js`:
  - added `getLegacySetupJob(...)` filter, so in-memory setup map is treated as legacy-only state;
  - setup/resume/repair endpoints now check durable onboarding running state first, then legacy in-memory setup fallback;
  - `/panel/nodes/:id/setup-status` now uses durable onboarding as status/log source-of-truth without mixing onboarding state with in-memory fallback fields;
  - in-memory map is no longer used to override durable status for onboarding-full mode.
- Added safe step-level rerun action in panel route:
  - `POST /panel/nodes/:id/onboarding/rerun-step`
  - validates node, step, job scope, and mode compatibility;
  - blocks legacy bridge jobs from onboarding-full rerun;
  - resumes suitable durable jobs from selected step;
  - for terminal jobs creates a new durable repair job and resumes from selected step.
- `views/partials/node-form/scripts.ejs`:
  - added per-job “Rerun step” action in onboarding diagnostics cards;
  - rerun uses selected step from step selector (or inferred failed/current step).
- locales:
  - added rerun-step strings in `ru/en`.

### Current stop-point

- setup-status critical path is now onboarding-first in practice; legacy in-memory map is legacy fallback only.
- safe step-level rerun exists in panel UI for durable onboarding jobs.
- legacy execution fallback remains enabled.

### Best next step

1. Continue retiring in-memory `setupJobs` from non-status control paths (duplicate-run guards + durable runner mirror writes).
2. Add optional job-details modal in node form using `GET /api/nodes/:id/onboarding/jobs/:jobId` for deeper diagnostics.
3. Keep legacy execution fallback until onboarding parity is confirmed in live node onboarding tests.

## 2026-04-17 Onboarding Bridge Isolation + Diagnostics UI Stop-Point

Removed remaining synthetic legacy bridge contamination risk for durable onboarding runs and expanded operator diagnostics in node management UI.

### What was delivered

- `src/routes/panel/nodes.js`:
  - added onboarding job mode resolver (`legacy` vs `onboarding-full`) based on metadata/flow;
  - `ensureOnboardingJobForSetup(...)` now rejects incompatible active jobs instead of mixing modes;
  - synthetic legacy bridge completion/fail now runs only for jobs explicitly marked legacy bridge mode;
  - onboarding resume endpoint now supports explicit `jobId` targeting and blocks legacy bridge jobs from onboarding-full resume;
  - onboarding repair path no longer resumes legacy bridge jobs; it creates/uses durable repair jobs;
  - setup-status now reports setup mode from durable onboarding metadata when available.
- `src/routes/nodes.js`:
  - added the same mode compatibility guard on setup job initialization;
  - synthetic legacy bridge completion now skips durable-mode jobs;
  - added `GET /api/nodes/:id/onboarding/jobs/:jobId` for detailed job diagnostics fetch.
- `views/partials/node-form/management.ejs` + `views/partials/node-form/scripts.ejs`:
  - replaced plain onboarding summary text with richer job cards;
  - added per-job diagnostics section with step-state chips and recent logs preview;
  - added per-job actions:
    - resume selected job;
    - use failed/current step in resume selector;
    - copy diagnostics snapshot to clipboard;
  - added legacy-bridge warning hint directly in job card UI.
- locales:
  - added onboarding diagnostics/mode/action labels in `ru/en`.

### Current stop-point

- Durable onboarding and legacy setup are now stricter-separated in mixed-mode scenarios.
- Onboarding jobs UI now has actionable diagnostics for day-to-day operator recovery.
- Legacy fallback remains enabled by design.

### Best next step

1. Start staged retirement of in-memory `setupJobs` from `/panel/nodes/:id/setup-status` critical path.
2. Keep legacy fallback execution path but move status/log authority to durable onboarding read model.
3. Then add explicit “re-run single step” action for durable jobs (separate from resume/repair).

## 2026-04-17 Onboarding Bridge Integration Stop-Point

Durable onboarding jobs are now partially integrated into active setup flows in staged mode.

### What was added after scaffold

- Panel setup path (`src/routes/panel/nodes.js`):
  - setup start now creates/starts durable onboarding job (best-effort);
  - setup runner now carries `onboardingJobId`;
  - legacy setup success/failure mirrors into onboarding job state;
  - setup-status now returns onboarding payload and can use onboarding fallback if in-memory setup state is missing.
- API setup path (`src/routes/nodes.js`):
  - `/api/nodes/:id/setup` now initializes onboarding job and returns `onboardingJobId`;
  - setup success/failure mirrors to onboarding status.

### What is still intentionally unchanged

- Legacy install execution remains primary:
  - `nodeSetup.*` execution path is unchanged;
  - panel in-memory `setupJobs` map still exists and is still used.
- Step completion currently uses synthetic bridge completion for legacy-run setups.

### Current stop-point

- We now have a durable onboarding read/write seam in both panel/API setup starts.
- We do **not** yet run true step-by-step onboarding handlers.
- We do **not** yet have onboarding-first UI status rendering in panel templates/js.

### Best next step

1. Move panel setup UI polling/rendering to onboarding-first status.
2. Implement first real runner handlers:
   - `preflight`
   - `prepare-host`
3. Replace synthetic bridge step completion with real per-step transitions.
4. Then start removing dependence on in-memory `setupJobs`.

## 2026-04-17 Onboarding Handlers Stop-Point

First real onboarding handlers are now in place.

### What was added

- `src/services/nodeOnboardingHandlers.js`:
  - real `preflight` SSH/tooling probe;
  - real `prepare-host` filesystem/log-path preparation.
- `src/services/nodeOnboardingPipeline.js`:
  - pipeline runner that executes real handlers and stops before `install-runtime`.
- New API endpoint:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-preflight`
  - runs real onboarding steps (`preflight`, `prepare-host`) for an existing onboarding job.

### Current stop-point

- Durable onboarding jobs are integrated into setup starts (panel + API).
- Real handlers exist for early steps only.
- Runtime/agent install is still legacy path.

### Best next step

1. Add `install-runtime` handler adapter around existing `nodeSetup` routines.
2. Add `verify-runtime-local` handler with explicit runtime health contract.
3. Then phase out synthetic full-step completion bridge on success.

## 2026-04-17 Onboarding Runtime Layer Stop-Point

Pipeline now includes runtime installation/verification handlers in staged mode.

### What was added

- `install-runtime` onboarding handler adapter:
  - drives existing `nodeSetup` routines by node type/role;
  - stores runtime install snapshot/log tail into step result.
- `verify-runtime-local` handler:
  - checks runtime status via existing status checks;
  - enforces runtime-online gate before moving toward agent step.
- New pipeline stage method:
  - `runUntilAgentInstall(jobId)`
  - runs `preflight -> prepare-host -> install-runtime -> verify-runtime-local`.
- New API endpoint:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-runtime`.

### Current stop-point

- Early and runtime onboarding steps can now execute as real handlers.
- Agent install/verify and panel->agent handshake handlers are still pending.
- Legacy setup flow is still live and still mirrored into onboarding status.

### Best next step

1. Add `install-agent` handler with pinned/predictable installer source.
2. Add `verify-agent-local` and `verify-panel-to-agent` handlers.
3. Start routing a controlled subset of setup executions through pipeline handlers.

## 2026-04-17 Onboarding Agent Layer Stop-Point

Agent install/verification handlers are now implemented in staged mode.

### What was added

- New real handlers in `src/services/nodeOnboardingHandlers.js`:
  - `install-agent`
  - `verify-agent-local`
  - `verify-panel-to-agent`
- Pipeline extension in `src/services/nodeOnboardingPipeline.js`:
  - `runUntilSeedNodeState(jobId)`
  - executes real steps through panel->agent verification boundary.
- New API trigger:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-agent`.

### Current stop-point

- Pipeline can now execute real steps through panel->agent handshake.
- `seed-node-state` and `final-sync` handlers are still missing.
- Legacy setup flow is still live and mirrored into onboarding jobs.

### Best next step

1. Implement real `seed-node-state` and `final-sync` handlers.
2. Switch panel setup-status UI to onboarding-first rendering.
3. Remove synthetic bridge completion once end-to-end handlers are stable.

## 2026-04-17 Onboarding Full Handler Chain Stop-Point

Pipeline now has real handlers from preflight through final-sync.

### What was added

- Added real handlers:
  - `seed-node-state`
  - `final-sync`
- Added full pipeline execution method:
  - `runFull(jobId)` in `nodeOnboardingPipeline`.
- Added API trigger:
  - `POST /api/nodes/:id/onboarding/jobs/:jobId/run-full`.

### Current stop-point

- End-to-end handler chain exists in code.
- Panel setup still uses legacy executor and synthetic bridge completion by default.
- UI status is not yet onboarding-first.

### Best next step

1. Switch panel setup-status rendering to onboarding-first view in frontend flow.
2. Route selected setup runs through `runFull` pipeline path.
3. Then retire synthetic bridge completion and phase out in-memory `setupJobs`.

## 2026-04-17 Panel Setup UI Progress Stop-Point

Panel node setup UI now reads onboarding progress when available.

### What was added

- `views/partials/node-form/scripts.ejs` setup polling now:
  - prefers durable onboarding logs over legacy logs when present;
  - shows current onboarding step label while setup is running;
  - includes step context in error state.

### Current stop-point

- UI consumes onboarding progress hints.
- Setup execution path is still legacy by default.

### Best next step

1. Route selected setup starts through `runFull` pipeline path.
2. Make setup-status backend onboarding-primary (legacy fallback).
3. Then remove synthetic bridge completion flow.

## 2026-04-17 Setup-Mode Cutover Stop-Point

Panel/API setup starts now support staged durable onboarding execution.

### What was added

- `src/routes/panel/nodes.js`:
  - setup start now resolves execution mode (`onboarding-full` vs `legacy`);
  - staged default routes Xray setup through durable `runFull` path;
  - duplicate-run guard prevents second runner when onboarding job is already `running`;
  - durable runner (`runNodeOnboardingJob`) executes `nodeOnboardingPipeline.runFull(...)`.
- panel setup-status now uses onboarding-first response mapping:
  - state/logs/error are read from durable onboarding when present;
  - in-memory setup job map remains as fallback.
- `src/routes/nodes.js`:
  - `/api/nodes/:id/setup` now accepts/setup-selects `setupMode`;
  - `setupMode=onboarding-full` runs durable `runFull` pipeline;
  - legacy setup path remains available.
- setup mode/flow metadata is now normalized in onboarding jobs:
  - durable runs: `flow=durable-onboarding-run-full`;
  - legacy runs: `flow=legacy-setup-bridge`.
- panel setup UI now sends explicit setup mode per node type:
  - Xray -> onboarding-full;
  - non-Xray -> legacy.

### Current stop-point

- Durable onboarding can now drive selected real setup starts (panel + API).
- Legacy setup path still exists and is still used as fallback.
- Synthetic legacy bridge completion is still present in legacy runner path.

### Best next step

1. Remove synthetic bridge completion from setups already running in onboarding-full mode.
2. Add explicit `resume/repair` actions over the durable onboarding job in panel node setup UI.
3. Begin staged retirement of in-memory `setupJobs` from the critical status path.

## 2026-04-17 Resume/Repair UI Stop-Point

Panel node management now exposes onboarding recovery actions.

### What was added

- `src/routes/panel/nodes.js`:
  - new endpoints:
    - `POST /panel/nodes/:id/onboarding/resume`
    - `POST /panel/nodes/:id/onboarding/repair`
  - actions are wired to durable `runFull` background execution;
  - duplicate-run guards prevent spawning parallel onboarding runners.
- `views/partials/node-form/management.ejs`:
  - added `Resume onboarding` and `Repair onboarding` action buttons.
- `views/partials/node-form/scripts.ejs`:
  - added onboarding action helpers with shared start/poll flow;
  - setup/resume/repair now follow one consistent progress path.
- `src/locales/ru.json`, `src/locales/en.json`:
  - added labels/confirmations/running text for new actions.
- node management onboarding widget now includes:
  - resume-step selector;
  - recent onboarding jobs summary (status/step/updated).

### Current stop-point

- Durable onboarding setup start and recovery controls are now available in panel UI.
- Legacy bridge completion still exists for legacy setup runner paths.
- In-memory `setupJobs` is still present as fallback state.

### Best next step

1. Remove synthetic bridge completion from onboarding-full routed starts (keep only real step transitions).
2. Add richer per-job diagnostics surface (last error/details) on top of current jobs summary.
3. Start staged retirement of in-memory `setupJobs` once parity is proven.

## 2026-04-17 Session Close Stop-Point

### Delivered in this session

- Durable onboarding cutover continued and stabilized:
  - selected setup starts are routed via `runFull` pipeline;
  - setup-status is onboarding-primary with legacy fallback.
- Added operator recovery controls in panel node management:
  - `Resume onboarding`;
  - `Repair onboarding`.
- Added onboarding jobs visibility in node management:
  - recent jobs summary (job/status/step/updated);
  - explicit resume step selector;
  - `lastError` surfaced in jobs summary rows.
- Setup mode normalization completed:
  - panel UI sends explicit setup mode per node type;
  - onboarding job metadata now stores actual flow/mode.

### Repo state at close

- latest commit on `main`: `204a1c9 — feat: add onboarding jobs summary and step-select resume UI`
- working tree: clean
- session state: `pending` (feature track not finished)

### Next step (strict)

1. Remove synthetic legacy bridge completion from onboarding-full routed starts.
2. Expand per-job diagnostics/actions in UI (drill-down details and step-aware controls).
3. Start staged retirement of in-memory `setupJobs` from critical status path.

## 2026-04-17 Onboarding Scaffold Implementation Stop-Point

The first real onboarding rewrite layer is now in code.

### What was added

- New onboarding state-machine domain:
  - `src/domain/node-onboarding/stateMachine.js`
  - canonical onboarding steps and status transition guards.
- New durable model:
  - `src/models/nodeOnboardingJobModel.js`
  - persistent step states/logs/errors/result snapshot;
  - unique active-job-per-node constraint.
- New service scaffold:
  - `src/services/nodeOnboardingService.js`
  - create/list/get active jobs;
  - start/resume/fail/complete lifecycle;
  - per-step transitions + heartbeat + bounded logs.
- New runner scaffold:
  - `src/services/nodeOnboardingRunner.js`
  - ordered step execution with pluggable handlers.
- New isolated API layer:
  - `/api/nodes/:id/onboarding/active`
  - `/api/nodes/:id/onboarding/jobs`
  - `/api/nodes/:id/onboarding/jobs/:jobId/start`
  - `/api/nodes/:id/onboarding/jobs/:jobId/resume`
  - step start/complete/fail endpoints
  - job complete endpoint

### What intentionally was not changed yet

- Legacy `setupJobs` in-memory flow in `src/routes/panel/nodes.js` is still the live setup path.
- Legacy `/api/nodes/:id/setup` behavior is unchanged.
- New onboarding runner does not execute real install/runtime steps yet (handler hooks only).

### Current stop-point

- Durable onboarding layer exists and is testable as a separate API/service surface.
- Integration into panel node-add/setup UX has **not** started yet.
- No replacement of legacy auto-setup has been attempted in this step.

### Best next step

1. Add a staged integration path in panel setup:
   - create onboarding job on setup start;
   - show durable status in UI polling;
   - keep legacy setup path as fallback while new pipeline is shadowed.
2. Implement first real handlers in runner:
   - `preflight`
   - `prepare-host`
   - adapter hooks around existing `nodeSetup` pieces.
3. Then migrate setup-status UI from process `Map` to durable onboarding job read-model.

## 2026-04-17 Builder + Onboarding Stop-Point

- The experimental `Cascade Builder` has now received a second operator-facing polish pass.

### What was just added locally

- Better `ru/en` translation coverage on the builder page and builder API responses:
  - route-level commit/connect/state errors no longer stay hardcoded English only;
  - validation and deploy-preview text is now localized before it reaches the page.
- Dark theme is now real on the canvas layer too:
  - Cytoscape node/edge labels, backgrounds, borders, and edge text backgrounds now react to the active panel theme;
  - theme switches should no longer leave a bright white graph floating inside a dark shell.
- Responsive cleanup on the builder page:
  - hero actions now collapse more cleanly;
  - summary cards stack more predictably;
  - library/inspector spacing is tighter on small screens;
  - mobile canvas heights were reduced to less awkward defaults.
- Builder route bugfix:
  - draft commit response `summary` now points to `validation.summary` instead of a missing field.

### Onboarding audit outcome

- Current node auto-setup is now explicitly treated as an architectural risk, not just a flaky implementation detail.
- Key findings:
  - setup-state currently lives only in process memory;
  - runtime install, agent install, and final sync are separate phases that trust each other too early;
  - one current path still allows weak agent verification (`strictAgent: false`);
  - agent delivery depends on external `latest` resolution;
  - first-run success can depend on rerunning setup instead of resuming a durable pipeline.

### New source-of-truth doc for the replacement direction

- `docs/node-onboarding-rewrite-blueprint.ru.md`

This document now captures:

- why the current installer is fragile;
- what should be replaced vs reused;
- the target onboarding state machine;
- required verification steps;
- the difference between `fresh install`, `resume`, and `repair`;
- the intended Hidden Rabbit direction for a reliable node bootstrap flow.

### Best next step

1. Builder theme/i18n/responsive batch is already committed and deployed:
   - commit: `567e8f1 — feat: polish cascade builder and audit onboarding`
   - stand: `https://tunnel.hiddenrabbit.net.ru/panel`
2. Start implementing the first real onboarding rewrite layer:
   - durable `NodeOnboardingJob`;
   - explicit step model;
   - remove process-only setup state from the critical path.
3. Only after that, continue deeper cascade-builder UX work or test-server rollout.

### Explicit stop-point

- Do **not** re-audit the current installer again at the start of the next session.
- The audit and replacement direction are already captured in:
  - `docs/node-onboarding-rewrite-blueprint.ru.md`
- Historical note: at this point onboarding rewrite code had not started yet.
- The next session should begin from implementation, not from more exploration:
  - add the first durable onboarding model/service layer;
  - keep it separate from the legacy setup path at first;
  - do not start rewiring the live auto-setup blindly before the durable job/state layer exists.

## Prompt For Next Launch

Read in order:

1. `docs/PROJECT-BASELINE.md`
2. `docs/ROADMAP.md`
3. `docs/SESSION-HANDOFF.md`
4. `docs/KNOWN-ISSUES.md`
5. `docs/DEVELOPMENT-LOG.md`
6. `docs/SESSION-LEDGER.md`
7. `docs/node-onboarding-rewrite-blueprint.ru.md`

Then continue without extra planning.

Context:

- this is an isolated fork, not part of Rabbit Platform;
- continuity docs are the source of truth;
- onboarding audit is done and documented in `docs/node-onboarding-rewrite-blueprint.ru.md`;
- latest committed state in `main`: `204a1c9 — feat: add onboarding jobs summary and step-select resume UI`;
- setup now supports onboarding-full/legacy staged modes;
- legacy setup path is still active as fallback.

Priority:

1. remove synthetic bridge completion from onboarding-full execution path;
2. add richer per-job diagnostics UI (error/details/actions) on top of current jobs summary;
3. keep legacy setup fallback until parity is proven on test nodes;
4. then retire in-memory `setupJobs` from the critical status path.

## 2026-04-16 Cascade Builder v1 Stop-Point

- A first experimental `Cascade Builder` route now exists:
  - panel page: `/panel/cascades/builder`
  - API: `/api/cascade-builder/*`
- Builder is intentionally **legacy-backed**, not a new persistent topology product yet.

### What now exists

- Separate panel route and navigation entry:
  - `src/routes/panel/cascades.js`
  - `views/layout.ejs`
- Separate builder API:
  - `src/routes/cascadeBuilder.js`
- New builder domain layer:
  - `src/domain/cascade-builder/flowNormalizer.js`
  - `src/domain/cascade-builder/flowValidator.js`
- Separate page/assets:
  - `views/cascade-builder.ejs`
  - `public/js/cascade-builder.js`
  - `public/css/cascade-builder.css`

### Source of truth boundary

- Read-source:
  - `cascadeService.getTopology()`
  - current node metadata / live topology positions
- Draft-source:
  - Redis-backed builder draft state in `cacheService`
  - key family: `builder:draft:{actorKey}:{flowId}`
- Current draft state stores only:
  - draft hops
  - builder-specific node positions
  - update timestamp

### Current v1 behavior

- builder opens current topology as normalized flow state;
- validation runs over normalized nodes + live hops + draft hops;
- drag-to-connect creates a draft hop suggestion and persists accepted drafts into Redis;
- `Save layout` now saves builder layout to builder draft state, not to legacy topology positions;
- `Reset drafts` clears only draft hops and preserves builder layout;
- `Commit draft hops` now creates real legacy `CascadeLink` records from accepted builder drafts;
- `Deploy preview` now builds a pure planning view over builder state without writing to Mongo or touching SSH/runtime;
- deploy preview returns:
  - per-hop commit/deploy readiness;
  - chain grouping and affected-node actions;
  - role changes (`current -> preview`);
  - explicit assumptions from the current legacy-backed commit bridge;
- draft commit intentionally does **not** auto-deploy links yet;
- if Cytoscape assets fail to load, the canvas now shows an explicit fallback state instead of silently dying.

### Validation contract currently implemented

- structural:
  - missing node refs;
  - self-link;
  - duplicate hop;
  - cycle detection;
  - multi-upstream / multi-downstream warnings
- protocol:
  - stack inference (`xray`, `hysteria2`, `hybrid`)
  - hybrid-disabled error
  - invalid `reality + ws` combination
- runtime-lite:
  - missing SSH warning
  - offline node warning

### Important limitations still true

- builder is still `legacy-backed`, not flow-native storage;
- draft state is operator-scoped Redis state, not shared project data;
- builder now has:
  - a `draft -> legacy link` bridge;
  - a pure deploy-preview / commit-plan layer;
- draft commit currently uses builder defaults and a batch commit action, not a full contextual role/settings wizard;
- roles are inferred inside the builder flow, but legacy node `cascadeRole` remains the live topology role source;
- Cytoscape/Dagre/Edgehandles are still CDN-loaded for this experimental step.
- deploy preview is still descriptive, not executable:
  - no real config diff;
  - no synthetic `deployChain` against in-memory links;
  - no per-hop settings editor before commit.

### Stop-point

- experimental builder scaffold is in active local work and has passed syntax/JSON/EJS checks;
- next best step:
  1. verify the builder page live with `Deploy preview` + `Commit draft hops` on the stand;
  2. add per-hop commit/config UI on top of the current planner, instead of jumping straight into raw defaults;
  3. then continue Android mobile menu / responsive cleanup on the rest of the panel.

## 2026-04-16 Mobile / i18n In-Progress Stop-Point

- There is now a reviewed local patch set extending the current shell/UI work in:
  - `public/css/style.css`
  - `public/js/app.js`
  - `src/locales/en.json`
  - `src/locales/ru.json`
  - `src/middleware/i18n.js`
  - `views/layout.ejs`
  - `views/dashboard.ejs`
- This batch has already passed:
  - `git diff --check`
  - EJS compile for `views/layout.ejs`
  - EJS compile for `views/dashboard.ejs`
- It has **not** been committed/deployed yet at this stop-point.

## 2026-04-16 Dashboard Rings Stop-Point

- Two dashboard ring implementations were already committed and deployed on `main`:
  - `ace7fde — fix: rebuild dashboard rings with dashed layers`
  - `17adc2d — fix: simplify dashboard rings with css pseudo layers`
- The current live implementation uses the simplified CSS pseudo-element approach:
  - `.hero-meter-ring` = outer dashed circle;
  - `.hero-meter-ring::before` = inner dashed circle;
  - `.hero-meter-value` = centered text layer.
- User reviewed the live result and provided a more precise visual target:
  - large rings should visually follow:
    - `--meter-gap: 5px`
    - `--meter-border-width: 1px`
    - `width: 80px`
    - `height: 80px`
  - mini rings in `Profiles and devices` should be scaled down proportionally with the same internal rhythm.
- A new local-only CSS tweak has now been started in `public/css/style.css`:
  - base rings are now locally set to:
    - `80x80`
    - `gap 5`
    - `border 1`
    - `font-size 18`
  - mini rings are now locally set to:
    - `68x68`
    - `gap 4`
    - `font-size 15`
  - mobile large rings are now locally set to:
    - `84x84`
    - `gap 5`
    - `font-size 19`
  - mobile mini rings are now locally set to:
    - `72x72`
    - `gap 4`
    - `font-size 16`
- This new tweak is **not deployed yet** and still needs visual verification before commit.
- The user explicitly wants the next session to continue from this ring-geometry stop-point rather than re-exploring older SVG or layered-div approaches.
- Additional dashboard cleanup found after live review:
  - one mini ring rendered larger because `.hero-meter-ring.soft` still carried large width/height values;
  - several labels duplicated counts because templates printed the raw count and then used `tp(...)`, which already includes the count.
- A local follow-up fix now removes the conflicting `soft` width/height override and cleans duplicate count output on the dashboard.

## Stable / Confirmed

- panel is deployed in Coolify and can be updated from `main`;
- current redesign foundation is live:
  - light / dark / system themes;
  - new typography;
  - flatter UI language;
  - cleaner dashboard / settings / subscription surfaces;
- HAPP support layer has been expanded:
  - better settings labels;
  - support-status messaging model;
  - import behavior has been improved versus the earlier broken state;
- dashboard traffic card now uses an interactive smooth SVG line chart with hover point and tooltip;
- layout stabilization work was added for the page-shift bug after navigation;
- shell layout was moved to `grid + sticky sidebar` and deployed;
- topbar now contains the language switcher next to theme controls;
- sidebar markup now uses an inner sticky layer so the shell can stretch full-height while keeping controls pinned;
- visible login/setup/TOTP branding has started moving from `Celerity` toward `Hidden Rabbit`;
- user detail view now shows:
  - traffic progress;
  - active device sessions from Redis;
  - effective node coverage;
  - live node hints when attribution metadata is available.
- docs continuity layer is now the official local memory path for this fork.

## Done Recently

- added isolated continuity docs layer under `docs/`;
- formalized project isolation rules inside repo;
- formalized continuity law and session close law inside repo;
- redesigned major parts of the admin panel UI;
- deployed latest dashboard chart update to the live stand.
- committed and deployed the shell layout rewrite that had previously been paused locally;
- added overflow guards for page headers, tables, cards, charts, and dashboard columns;
- moved language controls from sidebar into the topbar utility cluster;
- made sidebar collapse control more explicit with label text;
- reduced stats chart point density adaptively and improved time tick formatting;
- recolored subscription and user-detail QR presentation toward project blue;
- expanded auth header aliases for node attribution and enriched user session hints from effective node lookup;
- replaced the most obvious visible `Celerity` branding on layout, login, setup, and TOTP screens.
- audited `upstream/main` and identified the most relevant candidate areas for later porting:
  - onboarding / bootstrap;
  - broadcast tooling;
  - Marzban migration;
  - client statistics experiments.

## Not Done Yet

- Xray true per-device/session attribution now has a code foundation, but still needs live rollout:
  - new `cc-agent` binary must be built/published or manually installed on test Xray nodes;
  - node Xray config must be regenerated/restarted so `/var/log/xray/access.log` exists and is populated;
  - live UI must confirm `Xray-сессия` entries with real client IPs;
  - old agents will keep using `/stats` fallback until updated.
- responsive/mobile polish is still incomplete:
  - user specifically reported Android issues with overlapping mobile controls and hard-to-click menu state;
  - the current local patch moves language/theme controls into mobile sidebar and locks page scroll while menu is open, but this still needs real-device/live verification;
  - other pages beyond dashboard/layout still need responsive cleanup.
- mobile menu accessibility is still unresolved on real Android devices:
  - user still reports the menu is not fully clickable / accessible;
  - this remains one of the next highest-priority UI fixes after the ring geometry is stabilized.
- shell/layout bug is still unresolved:
  - user reports the design still shifts / drifts outside the browser width;
  - this happens on navigation and in some views;
  - the shell rewrite has now been deployed, but needs real verification on the live stand.
- dashboard / stats visuals still need cleanup:
  - traffic chart density was reduced and the dashboard period toggle exists now;
  - charts still need visual refinement and calmer rhythm on the live page;
  - segmented/dashed rings still need closer matching to the user reference;
  - the current local CSS-only tweak should be reviewed first before any further redesign attempt.
- user-level stats are improved but not complete:
  - per-user traffic and device activity now exist in operator UI;
  - exact live node attribution is improved with header aliases and node-id fallback lookup but still depends on metadata being sent consistently;
  - user wants clear visibility of which node(s) a user is actually using, especially once cascades grow.
- repository separation from visible `Celerity` identity is not complete:
  - the most visible surfaces were renamed, but legacy references still exist in repo text, metadata, comments, and some auxiliary screens;
  - user wants this fork to continue moving away from the original branding.
- dashboard and shell redesign still need more polish:
  - sidebar collapse affordance was improved but needs live confirmation;
  - settings item should be rechecked for icon visibility in all states on the live stand;
  - background texture is more neutral now but may still need one more pass;
  - circular metrics should use a segmented / dashed ring style like the provided reference;
  - subscription QR code background/frame was recolored, but should be checked on real devices and browsers.
- upstream comparison baseline exists, but adoption triage is still not finished.
- users list still needs operator UX completion:
  - verify the new direct actions in live UI:
    - open subscription page;
    - copy subscription;
    - edit profile;
    - open details;
  - replace awkward unlimited traffic wording with `∞` where limits are not set across any remaining surfaces.
- theme/language/shell polish still needs follow-up:
  - language switcher should visually match the theme switcher;
  - theme switcher labels are now being reduced toward icon-only, but need visual/live verification;
  - sidebar collapse control should live near logout in a shared footer action block;
  - sidebar currently does not always stretch to full height on long settings pages.
- visual system still needs one more strong pass:
  - the square/grid texture is being replaced with a paper-noise direction, but still needs visual approval;
  - replace green system accents (`online`, green tags, highlighted pills) with the project `Java` color family;
  - in dark theme, dashboard metric rings must not render as black;
  - review and normalize nav icons across the full menu so no icon disappears or looks mismatched.
- HAPP theme work is still pending:
  - dark-themed default HAPP color profile has now been added at settings/model level;
  - light preset button has also been added in the panel for Apple-platform testing;
  - still need real-device verification for iOS/macOS behavior and whether light/dark/system can truly follow the client theme automatically.

- localization/pluralization is only partially expanded:
  - local middleware now supports interpolation and plural forms;
  - dashboard counters/status strings were updated first;
  - the rest of the panel still needs a deliberate pass so Russian wording is natural everywhere visible to users/operators.

## 2026-04-16 Render Helper Recovery

- A live dashboard regression was found after introducing `tp(...)` into EJS templates:
  - `res.locals.tp` existed in middleware;
  - the shared `render()` helper was still only passing `t`, so compiled templates crashed with `tp is not defined`.
- This has now been corrected locally in `src/routes/panel/helpers.js` and should be treated as a required part of any deploy that includes pluralized templates.
- Same local batch also includes:
  - dashboard right-column reorder (`Server` above `Quick Actions`);
  - dashboard ring treatment moving toward a double segmented style;
  - settings hero localization cleanup;
  - users page pluralized counts.

## 2026-04-16 UI Follow-Up Update

- prepared a new deployable UI batch:
  - sidebar now uses `.sidebar` + `.sidebar-inner` so the background column can reach the full page height while the inner stack remains sticky;
  - content background moved further toward neutral paper-noise instead of the older square/grid feel;
  - remaining green success accents were shifted again toward project `Java`;
  - users list action set was refined with clearer icons for subscription / copy / edit / details;
  - HAPP color profile now defaults to a Hidden Rabbit dark preset, and the HAPP settings view exposes dark/light preset-fill buttons.
- this batch must be verified live after deploy:
  - long settings pages for sidebar full-height;
  - dark theme rings;
  - HAPP color profile preset behavior;
  - users list actions and topbar controls.

## 2026-04-16 Stats and Detail Polish Update

- Prepared a deployable refinement batch:
  - user detail labels now say traffic used, connected devices, and connected nodes;
  - unlimited traffic uses an enlarged `∞` indicator while normal numeric limits keep regular sizing;
  - sidebar footer controls are sticky so collapse/logout stay attached to the viewport;
  - statistics heatmap now has a `24h / 48h` switcher;
  - registrations chart now includes a cumulative total profile line;
  - shared card/header vertical rhythm was tightened across core shell surfaces.

### Current Verification Need

After deploy, verify:

1. user detail stat wording and enlarged `∞`;
2. sidebar footer stickiness on long pages;
3. statistics heatmap switching between `24h` and `48h`;
4. registrations chart showing both new profiles and total profiles;
5. dashboard/statistics/users card headers feeling aligned and stable.

## 2026-04-16 Chart Visual System Update

- Prepared a chart/style refinement batch:
  - dashboard segmented rings now use the Java accent consistently;
  - dashboard traffic chart is taller, less cramped, and redraws on resize;
  - dashboard log height now syncs to the bottom of the right sidebar stack;
  - statistics charts now share a cleaner Java/Deep Cove palette and plot-surface styling;
  - visible point density was reduced further across statistics charts;
  - traffic chart cache is versioned and shorter-lived to reduce stale `24h` vs `7d` mismatches.

### Current Verification Need

After deploy, verify:

1. both circular dashboard indicators are Java;
2. logs bottom aligns with the Panel/system widget on dashboard;
3. dashboard `Traffic for 7 days` no longer looks flattened or cramped;
4. `24h / 7d / 30d` traffic totals refresh consistently;
5. statistics charts feel visually aligned with the dashboard chart language.

## 2026-04-16 Settings / Stats / Subscription Mobile Cleanup

- Prepared another deployable UI batch around adjacent pages after the dashboard recovery:
  - settings tabs now behave like a horizontal mobile strip instead of wrapping into broken rows;
  - settings grid and subscription preview surfaces collapse more cleanly on narrow screens;
  - subscription button-builder rows stack correctly on mobile and the template dropdown/icon picker are less cramped;
  - statistics mobile chart headers, legends, period selector, and heatmap overflow were softened for phone layouts.
- Continued wording cleanup:
  - dashboard traffic period chips now use locale-backed `h/d` labels instead of hardcoded Russian text;
  - subscription settings preview copy/chips are now locale-backed;
  - backup restore buttons in settings are locale-backed instead of hardcoded `Restore`;
  - public subscription page eyebrow no longer shows the stray English `Access Profile`.

### Current Verification Need

After deploy, verify:

1. `Settings` tabs scroll horizontally and remain tap-friendly on mobile;
2. subscription settings preview and button-builder do not crush into unusable rows on phones;
3. `Statistics` period selector and heatmap remain readable on mobile widths;
4. dashboard period pills and backup restore labels switch correctly with `ru/en`.

## 2026-04-16 Sticky Sidebar Update

- Prepared a shell fix for long-page scrolling:
  - desktop `.sidebar` is now `position: sticky` at viewport top;
  - sidebar height is locked to `100dvh`;
  - `.sidebar-inner` scrolls internally if its own content exceeds viewport height.

### Current Verification Need

After deploy, verify on long pages:

1. dashboard scroll;
2. settings scroll;
3. collapsed sidebar scroll;
4. mobile menu still opens normally.

## 2026-04-16 Sidebar Footer and Chart Polish Update

- Continued the shell/chart polish queue after the sticky sidebar deployment.
- Sidebar behavior was tightened:
  - `.sidebar` remains viewport-sticky;
  - dashboard/footer behavior was iterated after live feedback;
  - the intermediate version where only `.nav-menu` scrolled is no longer the intended final direction.
- Dashboard chart polish:
  - traffic chart surface is slightly taller and calmer;
  - visible markers are capped more aggressively;
  - segmented rings are kept in the Java accent family in light and dark themes.
- Dashboard logs:
  - height syncing was nudged closer to the right sidebar bottom and cap increased.
- Statistics chart polish:
  - reduced visible point noise;
  - softened chart grid texture;
  - changed multi-node chart palette away from navy/black toward Java tones;
  - added a subtle chart-area background plugin for a more cohesive live chart surface.

### Current Verification Need

After deploy, verify:

1. sidebar footer stays visible while long pages scroll;
2. collapsed sidebar still shows the expand icon;
3. dashboard logs align better with the right widget stack;
4. dashboard traffic chart and statistics charts feel visually consistent;
5. dark-theme dashboard rings are not black.

## 2026-04-16 Sticky Sidebar and Dashboard Sparkline Rework

- User reported that the previous footer-pinned/sidebar-middle-scroll approach still did not match the desired behavior.
- Prepared a follow-up shell correction:
  - the full desktop sidebar stays sticky to the viewport;
  - the nav block no longer acts as an internal scroll container on desktop.
- Prepared a dashboard sparkline geometry correction:
  - chart content is now width-constrained inside the hero card;
  - chart area height and SVG canvas height were increased;
  - tooltip/focus geometry was adjusted to avoid the flattened “stretched ribbon” look.

### Current Verification Need

After deploy, verify:

1. sidebar remains pinned while the full page still renders normally;
2. dashboard traffic card no longer looks like a stretched ribbon;
3. chart motion/hover feels smoother and more premium than the earlier SVG pass.

## 2026-04-16 Fixed Sidebar Recovery and Chart.js Motion Upgrade

- The first fixed-sidebar desktop pass caused the main page content to disappear because the old grid layout no longer accounted for a fixed shell column.
- Prepared and deployed a shell recovery:
  - desktop content now offsets itself from the fixed sidebar using the current sidebar width variables;
  - collapsed desktop state uses the collapsed width;
  - mobile/tablet resets the content offset so the desktop fix does not break narrow layouts.
- Continued the chart-system upgrade after the shell was restored:
  - dashboard traffic chart now spans the full available width of the hero card;
  - dashboard chart surface is taller and less cramped;
  - dashboard Chart.js animation is smoother with larger points, thicker lines, and richer hover targets;
  - statistics charts now use the same stronger motion/weight language with calmer dashed surfaces and cleaner tooltips.

### Current Verification Need

After deploy, verify:

1. all pages render normally again with fixed sidebar enabled;
2. desktop sidebar stays pinned to screen while content scrolls;
3. dashboard traffic chart fills the card cleanly across wide screens;
4. dashboard/statistics charts feel like one coherent modern system rather than separate styles.

1. the whole desktop sidebar stays visually fixed while the page scrolls;
2. the footer no longer appears to drift because of nested nav scrolling;
3. the main dashboard traffic chart reads as a balanced card, not a stretched horizontal strip;
4. peaks and tooltip now have enough vertical space on desktop and tablet widths.

## 2026-04-16 Fixed Sidebar and Dashboard Chart.js Migration

- User confirmed the sticky sidebar behavior still did not feel fixed enough.
- Prepared a stronger shell correction:
  - desktop sidebar now uses a fixed viewport-attached layout instead of sticky positioning.
- Prepared a chart-system correction for dashboard:
  - removed the custom SVG traffic sparkline on the main page;
  - replaced it with a `Chart.js` line chart;
  - aligned the dashboard traffic card with the same chart foundation already used on the statistics page.

### Current Verification Need

After deploy, verify:

1. desktop sidebar no longer moves at all while page content scrolls;
2. collapsed sidebar still behaves correctly in fixed mode;
3. dashboard traffic chart now looks materially closer to the statistics-page chart quality;
4. dashboard chart resize and tooltip behavior remain stable across desktop widths.

## Known Broken / Risky / Pending

- page-drift / width-shift bug is still the highest current UX blocker until the deployed shell rewrite is verified;
- some screenshots referenced by the user could not be loaded locally because the files were no longer present at the provided paths;
- dashboard graph interaction works, and density was reduced, but final visual approval is still pending;
- HAPP behavior should keep being tested on real clients after UI changes;
- user live-node visibility still depends on optional device metadata headers and is not guaranteed for every session, even though aliases/fallback enrichment improved it;
- old historical docs exist, but the new continuity set is now the primary path.

## Stop Point

The continuity layer is now in place.

The repo has a local source of truth and a clean session-entry order.

No automatic next wave is opened by this handoff.

## Next Step

Next practical step:

1. review the current uncommitted UI patch set before touching anything else;
2. fix the left sidebar full-height behavior and the remaining layout drift together at shell level;
3. visually verify the new footer sidebar toggle, icon-only theme controls, and paper-noise direction;
4. finish the users list operator actions (subscription page / copy / edit / details) and review `∞` in user detail;
5. normalize theme/language controls and color accents;
6. only after shell/UI stability is confirmed, continue with:
   - dashboard traffic/stats cleanup and chart polish;
   - user session node attribution;
   - controlled removal of `Celerity` branding from visible surfaces;
   - upstream adoption triage.

## User-Requested Follow-Up Queue

The next session should keep this exact queue in mind:

1. fix the persistent layout drift / page-width bug;
2. ensure the left sidebar stretches to full page height on long screens/pages;
3. continue graph cleanup and improve chart readability/responsiveness;
4. replace the current square/grid texture with neutral paper-like noise;
5. move the sidebar collapse control into the footer near `Logout` in a unified style;
6. make the language switcher visually match the theme switcher;
7. remove `Light / Dark / System` text labels and leave icons only;
8. ensure every nav item, including Settings, has a visible and coherent icon in all states;
9. replace system green accents with the project `Java` accent family;
10. ensure dark-theme dashboard rings are not black;
11. add users-list actions:
   - open subscription page;
   - copy subscription;
   - edit profile;
   - open details;
12. use `∞` instead of awkward unlimited traffic wording where appropriate;
13. prepare HAPP color profile defaults to match panel theming, including checking whether iOS/macOS can follow light/dark/system behavior;
14. continue stronger visual and textual separation from `Celerity`;
15. complete true node attribution for active user sessions;
16. decide which upstream changes to port first.

## 2026-04-16 Late Update

- Deployed `aad44b4 fix: localize dashboard shell and tighten layout bounds`.
- Tightened shell bounds again:
  - switched `overflow-x` guards from `clip` to `hidden` on core shell containers;
  - added extra `min-width: 0`, `width: 100%`, and `contain: inline-size` guards on topbar, content, main-content, stats grid, dashboard grid, and hero blocks;
  - narrowed dashboard sidebar grid column to `minmax(0, 320px)` instead of a raw fixed track.
- Replaced top-level hardcoded strings on `layout.ejs` and `dashboard.ejs` with locale-backed labels.
- Added missing locale keys for:
  - collapse / expand / toggle sidebar;
  - light / dark / system theme labels;
  - dashboard hero and traffic-card labels.

### Current Verification Need

The user still reports that the layout can drift on the live stand, so this fix must be verified manually in-browser after deployment.

### Immediate Next Check

1. Open the live stand and switch between `Dashboard / Statistics / Nodes / Users / Settings`.
2. Confirm whether the right edge still drifts off-screen.
3. Confirm dashboard/topbar copy is now consistently localized in both `ru` and `en`.

## 2026-04-16 Shell Continuation Update

- Continued the shell stabilization pass after the last deployable batch instead of branching into new features.
- Strengthened the shell in code:
  - replaced viewport-only assumptions with a calculated `--shell-sidebar-height` CSS variable;
  - added client-side shell-dimension syncing in `public/js/app.js` using `ResizeObserver`, `resize`, `load`, and `pageshow`;
  - removed `contain: inline-size` from `.content` and `.main-content`, because it remained a likely contributor to the width-drift behavior on some browser/window combinations;
  - converted `.content` into a flex column so the shell height is less brittle on long pages.
- Continued visual normalization:
  - replaced the remaining square/grid feel in the main hero surface with the calmer paper-noise direction;
  - renamed client storage keys from `celerity-*` to `hidden-rabbit-*` with legacy fallback so existing users do not lose preferences.
- Continued rebrand cleanup:
  - MCP UI snippets now use `hidden-rabbit` instead of `celerity`;
  - MCP server info now reports `hidden-rabbit-panel`.

### Current Verification Need

This pass is specifically aimed at:

1. left sidebar full-height behavior on long `Settings` pages;
2. persistent layout drift / right-edge shift after page switches;
3. confirming that the calmer paper-noise and hero background direction still fit both light and dark themes.

### Immediate Next Check

1. Verify `Settings` on the live stand and confirm the sidebar reaches the bottom.
2. Re-test page transitions for the drift bug.
3. If drift remains, inspect the exact page/layout combination and continue with a targeted shell fix rather than more broad CSS churn.

## 2026-04-16 Dashboard Rings / Mobile Shell Follow-up

- The dashboard ring implementation was adjusted again after the live stand showed the wrong visual language:
  - previous CSS/SVG version rendered thick solid circles;
  - current local fix switches the rings toward a thinner segmented double-ring treatment with small progress markers.
- The mobile shell was tightened in the same local pass:
  - desktop topbar status controls are hidden on small screens to avoid the duplicated blinking dot;
  - overlay/sidebar z-index and pointer-events were rebalanced so the mobile menu should become tappable and block the page behind it;
  - mobile sidebar controls are now arranged as a 2-column language/theme area;
  - the mobile `Collapse` control is hidden;
  - dashboard mobile node actions are converted to a 3-column icon layout.

### Current State

- Status: `pending verification`
- Local files changed:
  - `public/css/style.css`
  - `views/dashboard.ejs`
- This pass was prepared specifically in response to the user reporting:
  1. wrong ring visual treatment;
  2. duplicated mobile status dot;
  3. inaccessible mobile menu;
  4. unwanted mobile collapse button;
  5. need for 2-column language/theme controls;
  6. need for clean icon-only 3-column mobile node actions.

### Immediate Next Check

1. Open the live stand on a real phone and verify the mobile menu blocks background interaction and is fully tappable.
2. Verify the duplicated status dot is gone from the mobile header area.
3. Verify the dashboard rings now read as thin segmented double rings rather than solid circles.

## 2026-04-16 Dashboard Mini-Ring / Label Cleanup

- Finalized the small dashboard follow-up that was still local-only:
  - removed `width/height` from `.hero-meter-ring.soft`, so mini rings share the same base size again;
  - removed duplicate raw counts in dashboard labels that already used `tp(...)`.
- This is a narrow deployable fix aimed at:
  - equal mini ring sizes in `Profiles and devices`;

## 2026-04-16 User List Live Activity Attribution

- Continued the Xray attribution work after deploying the dashboard fallback and agent-stats activity writer.
- Added users-list visibility for the same live activity layer:
  - each row now receives `user.live`;
  - the table has a compact `Live activity` column;
  - mobile user cards also show the current live count / first active node hint.
- User detail now normalizes synthetic Xray activity:
  - internal keys like `xray:<nodeId>:<userId>` are no longer shown to the operator;
  - Xray entries render as profile traffic activity;
  - activity source is explicitly shown (`Xray stats` / `Auth callback`).

### Current Verification Need

After deploy, verify:

1. keep a test Xray client connected and generate traffic;
2. open `Users` and confirm the active user row shows live activity;
3. open that user detail page and confirm the session source reads as Xray stats with the correct node name;
4. confirm no old internal `xray:<...>` key is visible in the UI.

## 2026-04-16 Mobile Menu Layering Fix

- Continued the Android mobile-menu accessibility issue after the live attribution deploy.
- Changed the shell layering:
  - mobile overlay now lives inside `.app`;
  - overlay is above content;
  - sidebar is above overlay;
  - page content/header remain non-interactive while the menu is open.
- Added explicit state handling:
  - `aria-expanded` on the burger button;
  - `aria-hidden` on overlay/sidebar;
  - Escape key closes the menu.

### Current Verification Need

After deploy, verify on Android / mobile browser:

1. open the burger menu;
2. tap every nav item;
3. tap language controls;
4. tap theme controls;
5. confirm background page content is not clickable until menu is closed.
  - natural labels like `0 устройств` and `из 2 пользователей`.

### Immediate Next Check

1. Verify the two mini rings match in size on desktop and mobile.
2. Verify dashboard labels no longer duplicate counts.
3. After that, return to the still-unresolved Android mobile menu accessibility issue.

## 2026-04-16 Dashboard Device Stats Fallback

- User reported that `Profiles and devices` still showed zeros even while the connected node had live users and traffic.
- Investigation confirmed:
  - `onlineUsers` on the dashboard comes from node telemetry / Xray agent stats;
  - `Profiles and devices` was still powered only by Redis device activity from `/api/auth`.
- A small dashboard-only fallback has now been added:
  - if Redis device telemetry is empty but `totalOnline > 0`,
  - dashboard `activeProfiles` falls back to `min(totalOnline, enabledUsers)`,
  - dashboard `activeDevices` falls back to `totalOnline`,
  - and the UI shows that these values are estimated from node online data.

### Immediate Next Check

1. Verify the dashboard no longer stays at `0 / 0` when Xray/agent telemetry already reports connected users.
2. Verify the small explanatory note appears only when fallback mode is active.
3. Longer-term: replace this estimate with true per-device Xray telemetry if/when we wire that path in.

## 2026-04-16 Xray Device Activity Attribution

- Continued beyond the fallback and added a first real attribution path for Xray:
  - `collectXrayTrafficStats()` now records Redis device activity for users that produce non-zero Xray traffic deltas;
  - device key format is `xray:<nodeId>:<userId>`;
  - metadata includes node id/name/type and source `xray-agent-stats`.
- This means dashboard and user detail can now move from pure fallback to actual active-profile hints once the next agent stats poll sees traffic.
- Limitation:
  - this still does not expose the physical client IP/device id from Xray;
  - it is active-profile attribution from agent traffic, not exact device fingerprinting.

### Immediate Next Check

1. Keep one Xray client connected and generate traffic.
2. Wait for the next agent stats poll.
3. Verify `Profiles and devices` and user detail activity move from estimated/fallback to Redis-backed active entries.

## 2026-04-16 Xray True Session Telemetry + Ratio Label Cleanup

- Current repo state: `main` is clean and matches `origin/main`.
- Current deployed stand: `https://tunnel.hiddenrabbit.net.ru/panel`.
- Latest deployed code commit:
  - `9e2bed1 — fix: normalize dashboard ratio labels`
- Important previous telemetry commit:
  - `f519a93 — feat: add xray session telemetry foundation`

### What Was Completed

- Added a true Xray session telemetry foundation:
  - `cc-agent` now has authenticated `GET /sessions`;
  - `cc-agent` parses Xray `access.log` and extracts active sessions;
  - panel polls `/stats` and `/sessions` together when the agent supports it;
  - panel writes real Xray session activity into Redis when `/sessions` is available;
  - older agents gracefully continue using `/stats` fallback.
- Xray generated config now enables access/error logs:
  - `/var/log/xray/access.log`
  - `/var/log/xray/error.log`
- Node setup now creates the Xray log directory/files and writes agent config fields:
  - `access_log`;
  - `session_window_seconds`.
- User/device activity data now stores extra fields for true sessions:
  - `remoteIp`;
  - `clientAddr`;
  - source label `xray-agent-sessions`.
- Dashboard ratio labels were normalized:
  - numeric relationships should use `/` instead of `из`;
  - examples:
    - `2 / 2 включены`;
    - `0 активных профилей / 2`;
    - `0 устройств / 10 доступно`.

### Verification Already Done

- Node syntax checks passed for touched JS service files.
- Locale JSON parsing passed.
- `git diff --check` passed.
- `cc-agent` Go tests passed with local cache path:
  - `GOCACHE=/tmp/codex-go-build-cache go test ./...`
- Coolify deploy completed successfully.
- Application status after deploy:
  - `running:healthy`.

### Critical Caveat

- The deployed panel side is ready for `/sessions`, but existing Xray nodes will not expose true sessions until their `cc-agent` binary and Xray config are refreshed.
- For true per-device/session attribution on live nodes, the next session must:
  - build or install the updated `cc-agent` binary on the test Xray node(s);
  - regenerate or patch Xray config so access logs are enabled;
  - restart Xray and `cc-agent`;
  - verify `/sessions` returns active records;
  - verify user detail shows `Xray-сессия` / real client IP rather than fallback-only stats.

### Immediate Next Work

1. Roll out updated `cc-agent` to a test node and verify real `/sessions` telemetry.
2. Re-test Android mobile menu accessibility; it was still a recurring issue earlier.
3. Continue responsive/mobile cleanup on:
   - Statistics;
   - Users;
   - Settings;
   - subscription page.
4. Continue visual polish:
   - chart consistency;
   - dashboard mobile rhythm;
   - remaining Russian labels/plurals;
   - remaining visible Celerity references.

### Prompt For Next Session

```text
Прочитай по порядку:
1. docs/PROJECT-BASELINE.md
2. docs/ROADMAP.md
3. docs/SESSION-HANDOFF.md
4. docs/KNOWN-ISSUES.md
5. docs/DEVELOPMENT-LOG.md
6. docs/SESSION-LEDGER.md

Потом сразу приступай к работе без лишнего планирования.

Контекст:
- это изолированный форк панели, не связанный с Rabbit Platform;
- continuity docs являются source of truth;
- текущая база уже в main;
- последний коммит: 0a06ee7 — feat: retire setupJobs status reliance and add step rerun action;
- onboarding-full/legacy staged mode уже внедрён, legacy fallback сохранён.

Приоритет:
1. продолжить staged retirement in-memory setupJobs из remaining control-path:
   - убрать влияние setupJobs на duplicate-run guards для onboarding-full, где это возможно;
   - оставить setupJobs только для legacy execution fallback;
2. расширить onboarding diagnostics UI, используя `GET /api/nodes/:id/onboarding/jobs/:jobId` (job details view);
3. сохранить совместимость legacy path до подтверждения полного паритета;
4. после этого продолжить UI/UX полировку node onboarding и удалить оставшиеся legacy bridge хвосты.

Важно:
- не смешивай continuity docs commit с кодовыми изменениями;
- если меняешь continuity docs, делай это отдельным docs-коммитом;
- после существенного шага снова обнови SESSION-HANDOFF, DEVELOPMENT-LOG и SESSION-LEDGER.
```

## 2026-04-16 Visual Cascade Builder Blueprint

- Added a dedicated product blueprint:
  - `docs/hidden-rabbit-cascade-builder-blueprint.ru.md`
- Added a technical follow-up doc:
  - `docs/cascade-builder-v1-tech-design.ru.md`
- Goal:
  - define how the current `Network Map` / cascade layer can evolve into a future Hidden Rabbit visual cascade builder.
- The blueprint now fixes:
  - the product vision;
  - why the current topology layer is worth reusing;
  - why the future model should become flow-centric instead of link-centric;
  - target UX shape:
    - canvas;
    - inspector;
    - validate/deploy mode;
  - phased implementation path from this fork toward Hidden Rabbit reuse.

### Important Product Direction

- The current `Network Map` should be treated as a prototype foundation, not as the final builder itself.
- Recommended path:
  1. use this fork as a laboratory;
  2. create an experimental separate builder section here first;
  3. later transfer mature domain logic and interaction ideas into Hidden Rabbit.

### Next Practical Step For This Topic

When returning specifically to the visual cascade-builder idea, do this next:

1. write a short technical design doc for `Cascade Builder v1`;
2. map reusable code from:
   - `public/js/network.js`
   - `src/services/cascadeService.js`
   - `src/routes/cascade.js`
3. create a separate experimental route/view instead of overloading the current nodes tab;
4. begin with:
   - drag-to-connect;
   - inspector sidebar;
   - validation layer;
   - draft/save flow.

### Current Status For This Topic

- Product blueprint is done.
- `v1` technical design is now also done.
- The next real implementation step is no longer conceptual writing but code scaffolding:
  - separate route;
  - separate view;
  - separate JS/CSS bundle;
  - normalized builder state API.

## 2026-04-17 Stop-Point — Cascade Execution Diagnostics Iteration

Done:
- Added compact failed-only JSON export in cascade builder diagnostics.
- Added execution item filter switch:
  - `All / Failed / Success`.
- Filter now affects only chain result cards (summary remains full-run).
- Added i18n (`ru`/`en`) and styles for filter chips.

Stable:
- Builder diagnostics export set now includes:
  - TXT (full),
  - Failed TXT (compact),
  - Failed JSON (compact),
  - JSON (full).

Pending next:
1. Validate new filters/exports on a mixed run (some chains success, some failed).
2. Continue cascade execution parity and diagnostics depth.
3. In parallel continue staged retirement of legacy onboarding control/status path.

## 2026-04-17 Stop-Point — Mixed-Run QA Checklist Added

Done:
- Added practical runbook:
  - `docs/cascade-mixed-run-checklist.ru.md`
- The runbook locks:
  - mixed-run test flow;
  - expected behavior of `All / Failed / Success` filter;
  - expected behavior for four exports:
    - full TXT,
    - failed-only TXT,
    - failed-only JSON,
    - full JSON;
  - expected failed-only JSON schema and invariants;
  - PASS/FAIL gates and compact reporting template.

Stable:
- Diagnostics feature set is now implemented and documented for repeatable QA.

Pending next:
1. Execute one real mixed-run with at least one successful and one failed chain.
2. Compare UI counters vs failed-only JSON counters.
3. Patch any mismatch before continuing deeper builder UX increments.

## 2026-04-17 Stop-Point — Diagnostics Deepening + Chain Rerun

Done:
- Builder diagnostics now include richer chain failure context:
  - structured `errorDetails` per chain result (`node`/`chain` scope + related hop hints);
  - explicit failed-chain action row in execution cards:
    - `Focus node`,
    - `Retry chain`.
- Added dedicated rerun API:
  - `POST /api/cascade-builder/rerun-chain`;
  - runs `deployChain(startNodeId)` for selected chain context;
  - stores rerun snapshots into draft `lastExecution` (`reruns` history + `lastRerun` per matching chain result).
- Staged onboarding retirement increment:
  - onboarding-full endpoints no longer blocked by legacy in-memory `setupJobs` running state (`resume`, `repair`, `rerun-step`);
  - `/nodes/:id/setup` now applies legacy duplicate-run guard only when selected mode is legacy.

Current stop-point:
- Diagnostics UX is materially closer to operator incident workflow.
- Mixed-run parity still needs one live confirmation pass on stand (UI filter/export consistency + retry-chain behavior on real failed chain).

Next step:
1. Execute live mixed-run from `/panel/cascades/builder`.
2. Verify:
   - `All / Failed / Success` filter card counts;
   - failed-only TXT/JSON include only failed chains;
   - retry-chain action updates rerun status as expected.
3. Continue staged retirement of residual legacy setup in-memory control paths without removing legacy fallback prematurely.
