# Known Issues

## Active Product / UX Issues

### 0. Cascade Builder is experimental and still transitional

Current state:

- there is now a separate experimental builder page and API;
- builder reads live topology from `cascadeService.getTopology()`;
- builder drafts/layout are stored separately in Redis as operator-scoped draft state;
- accepted drag-connect drafts survive refresh for the same operator;
- builder can now commit drafts into legacy cascade links, but only through a batch transitional bridge.
- builder now also has a pure deploy-preview / commit-plan layer over the current draft state.
- builder can now run `commit + deploy` in one action, but deploy execution still relies on legacy `deployChain`.
- builder now has transport-specific draft editing for WS/gRPC/XHTTP payload fields before commit/deploy.
- builder graph dependencies are now served from local vendor assets (no runtime CDN dependency).
- builder now has base TLS/REALITY draft security controls (SNI/fingerprint/dest/shortId) with commit-time REALITY key fallback.
- local graph-vendor bundling is now Docker-safe (`postinstall` guard + explicit post-copy sync in Dockerfile), deployment blocker closed.
- builder now stores/displays `lastExecution` diagnostics after `commit + deploy` (summary + per-chain details), including persistence across refresh.
- builder execution diagnostics now support:
  - filters (`All / Failed / Success`);
  - full/failed-only exports (`TXT` and `JSON`);
  - enriched failed-chain details (`code`, `severity`, `hint`, `suggestedActions`);
  - quick failed-chain actions (`Repair node`, `Open node`, `Retry chain`).

Still missing:

- shared/persistent flow storage;
- executable synthetic chain preview against in-memory links;
- flow-native deploy orchestration independent of legacy chain deploy;
- deeper per-hop configuration UI (advanced policy-level knobs and explicit key-management controls);
- true flow-native role storage independent of legacy node `cascadeRole`.
- optional backend file export endpoint for diagnostics (clipboard `TXT/JSON` export is already available in UI).
- one confirmed live mixed-run parity check on real topology (simultaneous `success + failed` chains in one execution snapshot).

Status: `pending`

### 1. Shell layout still drifts / shifts after navigation

User reports that parts of the panel still move outside the browser width until the window is nudged or layout is recalculated.

Current state:

- multiple earlier stabilization attempts were already deployed;
- the shell rewrite (`grid + sticky sidebar` plus overflow containment) is now committed and deployed;
- bug still needs live verification because the user previously reported the drift across multiple views.

Status: `broken`

### 1a. Left sidebar does not always stretch to full height

User reported on the settings screen that the left sidebar/footer block can stop early instead of visually reaching the bottom of the page content.

Current state:

- shell was already moved toward `grid + sticky sidebar`;
- footer controls were moved around during the redesign;
- this still needs a proper height/flow fix instead of more local spacing tweaks.

Status: `broken`

### 2. User-level operational stats are only partially complete

Done now:

- per-user traffic progress in admin UX;
- connected-device visibility from Redis activity;
- effective node coverage per user.

Still missing or incomplete:

- exact live node attribution for every session;
- reliable cascade-hop visibility per user session when topology grows;
- protocol-specific attribution for Xray paths equal to Hysteria device tracking.

Status: `pending`

### 8. Some shell drift still reproduces on the live stand

Latest attempt:

- commit `aad44b4` added stronger shell containment and replaced remaining hardcoded top-level dashboard/local shell strings with locale keys.

Still needs confirmation:

- whether right-edge drift is fully fixed on the deployed stand, or only reduced;
- which exact page transition still reproduces it if the issue remains.

Status: `pending`

### 3. Dashboard traffic graph still needs UX correction

Current chart is interactive and visually improved, but the user still reports:

- too many visible points in earlier iterations;
- awkward visual density;
- need for better labels and calmer presentation.

Latest progress:

- compact period switchers are now present;
- point density is reduced adaptively based on dataset length;
- time-axis labels are more human-readable.

Status: `pending`

### 4. HAPP flow still needs ongoing real-device verification

Recent fixes improved labels, support messaging, and import behavior, but HAPP remains a client-specific integration and should continue to be tested on live devices after changes.

Status: `pending`

### 5. Branding separation is incomplete

There are still visible references to `Celerity` in repo text, UI labels, comments, and deployment metadata.

Status: `pending`

### 6. Upstream divergence is mapped, but not yet triaged for adoption

The fork already has meaningful local divergence. A fresh comparison against `upstream/main` now exists, but safe ports still need triage.

Main upstream areas worth evaluating:

- onboarding and first-run bootstrap;
- broadcast execution tooling for nodes;
- Marzban migration/import flow;
- client statistics experiments.

Status: `pending`

### 11. Node auto-setup / agent onboarding is still architecturally fragile

Audit result:

- current setup state lives only in process memory;
- Xray install, agent install, and post-setup sync are still separate phases that trust each other too early;
- one of the current success paths still tolerates weak agent verification (`strictAgent: false`);
- first-run health can depend on retrying setup instead of resuming from a durable step state;
- agent delivery still depends on external release/latest resolution.

Practical effect:

- a fresh node can appear “almost installed” but still need a second setup pass;
- process restarts can erase the current install state;
- panel/operator UX still hides too much of the real onboarding contract.

Decision:

- do not keep patching this forever as a legacy flow;
- move toward a dedicated Hidden Rabbit onboarding pipeline with:
  - durable job state;
  - explicit steps;
  - real runtime verification;
  - real panel-to-agent handshake;
  - resume/repair behavior.

Reference:

- `docs/node-onboarding-rewrite-blueprint.ru.md`

Latest progress:

- durable onboarding scaffold is now in code:
  - `NodeOnboardingJob` Mongo model;
  - onboarding state-machine/service/runner scaffold;
  - isolated onboarding API endpoints under `/api/nodes/:id/onboarding/*`.
- staged bridge integration started:
  - panel/API setup starts now initialize onboarding jobs;
  - setup success/failure is mirrored to durable onboarding status.
- first real handlers started:
  - executable `preflight` and `prepare-host` onboarding steps exist;
  - API trigger exists to run these early steps.
- runtime handlers started:
  - executable `install-runtime` and `verify-runtime-local` exist;
  - API trigger exists to run pipeline until agent-install boundary.
- agent handlers started:
  - executable `install-agent`, `verify-agent-local`, `verify-panel-to-agent` exist;
  - API trigger exists to run pipeline until `seed-node-state`.
- full handler chain started:
  - executable `seed-node-state` and `final-sync` exist;
  - API trigger exists to run full onboarding pipeline.
- setup execution cutover started:
  - panel setup start now supports mode selection and routes Xray setups through `runFull` in staged mode;
  - panel setup-status is now onboarding-primary with legacy fallback;
  - API setup supports `setupMode=onboarding-full`.
- legacy/durable mode isolation improved:
  - setup starts now reject incompatible active onboarding job modes;
  - synthetic legacy bridge completion now skips durable-mode jobs;
  - resume path blocks legacy bridge snapshots from onboarding-full execution.
- onboarding diagnostics surface improved:
  - node management now shows actionable onboarding job cards (status/step/mode/error);
  - per-job diagnostics preview includes step-state chips and recent logs;
  - per-job actions exist for resume/select-step/copy diagnostics.
- setup-status path improved:
  - in-memory setup map is now treated as legacy-only for panel setup status responses;
  - durable onboarding status/logs no longer mix with in-memory durable mirrors.
- step rerun flow improved:
  - safe step-level rerun action added for durable onboarding jobs;
  - terminal jobs can rerun from a selected step via repair-job bootstrap.
- setup log UX improved:
  - setup console no longer marks every `[STDERR]` line as hard error;
  - Xray runtime/agent setup now streams live SSH lines into setup status (poll-based near real-time).
- staged setup map retirement progressed:
  - onboarding-full setup status path now reads durable onboarding logs directly without merging in-memory `setupJobs` logs;
  - onboarding-full start/runner no longer mirrors success/error states into `setupJobs`.
- staged setup map retirement continued:
  - durable onboarding live-log append path now writes to legacy setup mirror only when a legacy setup job actually exists;
  - setup runner legacy bridge lookups were narrowed to legacy-specific setup job resolution points.
- this new layer is intentionally still separate from legacy setup flow.

Still missing:

- staged removal of synthetic bridge mirrors from the legacy setup runner once onboarding parity is fully confirmed.
- full retirement of in-memory `setupJobs` from remaining non-status control paths once parity is confirmed.
- same live-stream line channel for full Hysteria setup path.

Status: `pending`

### 7. Several visual follow-ups are captured but not yet implemented

Open user requests include:

- make language control visually match the theme switcher;
- remove light/dark/system labels and keep icons only;
- move sidebar collapse control near logout in the footer block;
- ensure Settings has a visible icon in all states;
- replace the background texture with a neutral paper-like noise;
- use segmented ring styling matching the provided reference;
- recolor subscription QR presentation toward project blue.
- replace remaining green accent states with the project Java color family;
- ensure dark-theme dashboard rings are not rendered as black.

Latest progress:

- language control was moved to the topbar near theme controls;
- sidebar collapse control is now more explicit;
- background was neutralized;
- QR presentation was recolored toward the project palette.

Status: `pending`

### 9. Users list actions are incomplete

User wants the users list to provide a more operator-friendly set of actions:

- open subscription page directly;
- copy subscription;
- edit user profile;
- open details/profile page.

Also:

- wording like "Unlimited traffic" / "Без лимита трафика" should be replaced with `∞` where this is shown as a compact metric.

Current state:

- edit exists on user detail page;
- list view still needs final action layout cleanup and verification;
- there are uncommitted local edits in `views/users.ejs` related to this.

Status: `pending`

### 10. HAPP color profile defaults are not yet aligned to panel theming

User requested:

- default HAPP color profile matching the dark panel theme;
- investigation whether iOS/macOS HAPP can support both light and dark themes in a system-driven way.

Current state:

- HAPP color profile setting was restored in settings;
- theming behavior across iOS/macOS still needs practical implementation review.

Status: `pending`

## What Has Already Been Tried

- live deployment and iterative UI fixes through Coolify;
- HAPP-specific settings cleanup and banner behavior adjustments;
- layout stabilization after navigation / resize-related visual drift;
- dashboard redesign with flatter styling and less heavy gradients.
- shell rewrite attempt toward `grid + sticky sidebar` started locally but paused before deployment.
- several later UI requests were collected and partially started locally without final deployment:
  - users list action expansion;
  - footer sidebar toggle placement;
  - topbar language/theme visual unification;
  - paper-noise background direction.

## What Is Stable Enough For Now

- deployment from `main` to the current Coolify stand;
- redesigned panel foundation;
- current docs-based continuity layer.

## 2026-04-17 Onboarding Step Diagnostics Caveat (Updated)

Issue history:

- fresh onboarding runs could fail on `prepare-host` with opaque message:
  - `Prepare-host marker missing in SSH output`
- root cause visibility was poor because handler did not surface SSH exit-code/stderr details.

Current state after patch:

- `preflight`/`prepare-host` now report structured SSH diagnostics (code/error/stdout/stderr tails);
- both steps now emit live stdout/stderr lines to setup log stream;
- `prepare-host` path creation is more tolerant to file-vs-dir collisions.
- preflight shell wrapper now preserves multiline script semantics for non-login `sh -c` execution:
  - removed semicolon-flattening that could break block syntax on some hosts;
  - targeted recurring failure:
    - `preflight failed: Exit code: 2 ... sh: 1: set: Illegal option -o t`.

What is still pending:

- confirm this fix on multiple fresh servers under real provisioning conditions;
- if a new concrete command-level failure appears, patch command idempotence accordingly.

Status: `pending verification`

### 11. Onboarding verify-runtime-local could report false offline state

Issue history:

- onboarding reached `verify-runtime-local` and failed with:
  - `Runtime is offline (no status)`,
  while setup log already contained active `xray.service` status output.

Root cause:

- runtime status providers returned string values in current setup service (`online/offline/error`);
- verify handler expected object shape and treated string input as missing/false.

Current state after patch:

- runtime verify normalizes both string and object status formats;
- verify step includes bounded retries for short startup races.

What is still pending:

- validate behavior on several fresh hosts and node roles;
- tune retry window only if real hosts still need longer stabilization.

Status: `pending verification`
