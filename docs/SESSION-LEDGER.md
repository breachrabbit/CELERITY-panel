# Session Ledger

## 2026-04-20

- Worked on: Phase 2A / Batch 1B (Coolify cutover execution only).
- Finished with:
  - captured pre-switch Coolify snapshot for app `ymi9vwwf438y5ozeh0kwhklf`;
  - switched source binding to `breachrabbit/brlabs.hrlab.git:main`;
  - triggered smoke deploy `e7u39hapu2o42d96p0xworwc` -> `failed`;
  - captured failure:
    - `git ls-remote ... breachrabbit/brlabs.hrlab.git refs/heads/main`
    - `fatal: could not read Username for 'https://github.com': No such device or address`;
  - classified as structural blocker for Batch 1B;
  - rolled back binding to `breachrabbit/CELERITY-panel.git:main`;
  - rollback deploy `iduyvwk8ib6nm7e86ai4mtgl` finished, app remained `running:healthy`.
- Next step:
  - fix Coolify access/auth path for private target repo;
  - re-run Batch 1B only with same rollback gates;
  - do not open Batch 2 before Batch 1B pass.

## 2026-04-20

- Worked on: Batch 1A Workflow Failure Gate for target repo (`breachrabbit/brlabs.hrlab`).
- Finished with:
  - inspected failed runs/jobs/step logs for workflow `Docker Hub`;
  - confirmed latest failure root cause:
    - `Login to Docker Hub` -> `Username and password required`;
    - secrets/variables in target repo are empty (`0`);
  - classified cause as:
    - primary: missing secret,
    - secondary: workflow assumption/config coupling;
  - classified gate impact:
    - benign/non-blocking for Batch 1B (Coolify source cutover),
    - structural debt for CI/release path.
- Next step:
  - proceed to Batch 1B (Coolify cutover) with rollback gates;
  - keep workflow fix as separate follow-up batch, not mixed with source switch.

## 2026-04-20

- Worked on: Phase 2A / Batch 0 prerequisite (populate target repo `breachrabbit/brlabs.hrlab`) with strict scope lock.
- Finished with:
  - pushed `main` and tags (`v1.0.0`, `v1.1.0`) to target repo;
  - validated target surfaces:
    - branches (`main`),
    - tags (`v1.0.0`, `v1.1.0`),
    - workflows (`.github/workflows/docker.yml`, active),
    - repo settings (`private=true`, `default_branch=main`, Actions enabled);
  - confirmed empty control surfaces:
    - hooks/environments/secrets/variables all `0`;
  - captured additional state:
    - target repo now has release `v1.1.0` with agent assets;
    - source repo releases remain `0`;
    - target workflow runs currently failing on push/tag.
  - updated cutover docs/risk/handoff with Batch 0 completion and blockers.
- Next step:
  - Phase 2A Batch 1 decision (Coolify source cutover) with explicit rollback gates;
  - keep runtime release-path switch for later batch (do not mix with Batch 1).

## 2026-04-20

- Worked on: Phase 1 external cutover audit closure (GitHub/Coolify/runtime source surfaces).
- Finished with:
  - completed external GitHub checks for both repos on:
    - `actions/secrets`,
    - `actions/variables`,
    - `hooks`,
    - `environments`,
    - `releases`;
  - confirmed `breachrabbit/brlabs.hrlab` exists but is empty;
  - confirmed both repos currently have `releases=0`;
  - confirmed Coolify stand app `ymi9vwwf438y5ozeh0kwhklf` is still bound to:
    - `breachrabbit/CELERITY-panel.git` (`main`);
  - confirmed runtime channel env still uses:
    - `CC_AGENT_RELEASE_BASE=https://github.com/breachrabbit/CELERITY-panel/releases`;
  - updated:
    - `docs/MIGRATION-CUTOVER-AUDIT-2026-04-20.md` (external facts + micro-batches + rollback gates + blockers),
    - `docs/CUTOVER-RISK-REGISTER.md` (impact/likelihood/status refresh).
- Next step:
  - approve and execute Phase 2 cutover micro-batches in order (`Batch 0..5`);
  - do not start cleanup before cutover blockers are cleared.

## 2026-04-20

- Worked on: mandatory bootstrap switch to Cutover model and Phase-1 Migration Cutover Audit kickoff.
- Finished with:
  - created `docs/START-HERE.md` with fixed execution order:
    1) Migration Cutover Audit
    2) Migration Cutover
    3) Legacy Cleanup
    4) Unresolved engineering work;
  - updated `docs/ISOLATED-PROJECT-RULE.md` with:
    - critical cutover rule,
    - permanent operating laws,
    - clarified canonical context separation;
  - updated `docs/SESSION-HANDOFF.md` with mandatory output template and cutover stop-point section;
  - added `docs/CUTOVER-RISK-REGISTER.md`;
  - added `docs/MIGRATION-CUTOVER-AUDIT-2026-04-20.md` with initial findings across all required audit layers.
- Next step:
  - complete external console part of Remote/Repo Audit (secrets/hooks/webhooks/deploy links),
  - finalize cutover micro-batch checklist and smoke gates,
  - only then move to Phase-2 Migration Cutover.

## 2026-04-20

- Worked on: preparing a single exhaustive report of all work done in this fork (vs original Celerity), as requested.
- Finished with:
  - created `docs/HIDDEN-RABBIT-FORK-FULL-REPORT-2026-04-20.ru.md`;
  - included full fork delta summary:
    - what changed,
    - what bugs were fixed,
    - what was newly implemented,
    - what is still in progress,
    - what is planned next;
  - added baseline metrics and commit-linked subsystem timeline.
- Next step:
  - wait for updated project rules/instructions;
  - continue from new governing instructions using this report as reference.

## 2026-04-18

- Worked on: full automation pass requested by operator (hybrid-by-default, auto role/runtime transitions, node delete cleanup, users delete action).
- Finished with:
  - pushed `19d8e6a` to `main`:
    - hybrid sidecar flow normalized to always-on policy;
    - cascade link lifecycle now queues topology reconcile automatically;
    - detached nodes auto-restore to standalone runtime;
    - affected linked nodes auto-deploy/reconfigure in background;
    - node delete now performs remote cleanup of agent/cascade artifacts + link cleanup/reconcile;
    - users list now has delete action.
  - performed local syntax/json checks on modified files.
- Next step:
  - verify stand is serving this exact commit on UI pages (`/panel/users`, node form/settings);
  - run live regression for link create/reconnect/delete and validate auto topology reconcile behavior end-to-end;
  - run disposable node delete test and confirm remote artifact cleanup path.

- Worked on: report that Hysteria/Xray agent source still appears as original upstream in setup logs.
- Finished with:
  - shipped hard runtime guardrail in installer path (`src/services/nodeSetup.js`);
  - if agent release URL resolves to legacy `ClickDevTech` path, it is auto-rewritten to Hidden Rabbit fork releases;
  - mirror URLs now derive from final resolved source URL (prevents mixed legacy/fork mirror set);
  - isolated code commit completed: `6c10ce5`.
- Next step:
  - deploy `main` to stand and run one fresh setup on a Hysteria node and one on an Xray node;
  - confirm logs no longer show `ClickDevTech/.../releases` and only show fork source (or panel bundle source).

- Worked on: mismatch between onboarding UX messages and actual node state (Hysteria/Xray operator feedback).
- Finished with:
  - switched `cc-agent` installer source from hardcoded upstream release URL to fork-controlled configurable channel:
    - defaults now point to `breachrabbit/CELERITY-panel` releases;
    - added env controls `CC_AGENT_RELEASE_BASE` / `CC_AGENT_RELEASE_TAG`;
    - setup logs now print exact source URL (`Agent release source: ...`);
  - removed stale red error display for completed onboarding jobs:
    - cleared `lastError` on job completion;
    - suppressed setup-status `error` when state is `success`;
    - suppressed completed-job error banner in node management UI diagnostics block.
- Next step:
  - deploy and verify live that setup logs no longer mention `ClickDevTech/CELERITY-panel` download URL;
  - rerun Hysteria onboarding on reported TLS-problem node and capture fresh runtime diagnostics if client-side TLS error persists despite clean onboarding completion.

- Worked on: live verification cycle requested for onboarding stability and stand deploy source.
- Finished with:
  - confirmed live stand serves versioned assets on `/panel/login` and `/panel/nodes` (`?v=1776518691049`);
  - checked forced Coolify trigger path and recorded token auth blocker (`Unauthenticated` for currently available API tokens);
  - executed fresh durable Xray onboarding smoke via API:
    - node `69e205b5ab80ea2b34cdf1c5`,
    - job `69e38b4802ba24c7ddbbefee`,
    - final `completed/ready`,
    - `verify-runtime-local` completed without offline loop;
  - executed fresh durable Hysteria onboarding smoke via API:
    - node `69e013bee8728d388e89c4df`,
    - job `69e38adc02ba24c7ddbbef49`,
    - final `completed/ready`,
    - `verify-runtime-local` completed without hanging;
  - confirmed panel setup-status for the problematic node now returns `success`.
- Next step:
  - obtain valid Coolify API token for explicit forced redeploys (or continue git-triggered deploy path);
  - run visual Nodes fit/overflow QA in real desktop/mobile browser viewports and patch only if reproduced;
  - continue cascade/onboarding parity track from current green smoke baseline.

- Worked on: node onboarding UX/behavior issues reported from live stand (`auto-setup confirm`, repeated `Runtime is offline`, node page fit, hysteria run stability visibility).
- Finished with:
  - converted management action buttons in node edit to explicit non-submit buttons (`type="button"`);
  - improved setup confirm invocation to explicit in-app modal options;
  - added `assetVersion` cache-busting for core CSS/JS includes to reduce stale frontend after deploy;
  - hardened Xray log-permission fallback in installer + onboarding prepare/recovery paths;
  - expanded `verify-runtime-local` error with direct runtime diagnostics tail;
  - tuned nodes table wrapper/min-width behavior.
- Next step:
  - commit and deploy this wave,
  - rerun live Xray/Hysteria onboarding smokes,
  - confirm no native confirm behavior and no repeated `Runtime is offline` loop for the failing Xray node.

- Worked on: onboarding reliability + UI confirmation consistency.
- Finished with:
  - shipped `d005be8`:
    - removed native browser confirm/alert usage from panel action flows;
    - added shared in-app `hrConfirm/hrAlert` modal layer and wired it across node/setup/settings/security/groups/users/network/outbounds paths;
    - hardened Xray runtime verify path (`verify-runtime-local`) with longer retry window and targeted self-heal when runtime is not active;
    - switched Xray log permission handling to dynamic service user/group with secure `640` file mode;
    - reduced nodes table overflow pressure for better viewport fit.
  - pushed to `main` and confirmed stand health endpoint `/panel/login` returns `HTTP 200`.
- Next step:
  - run two live onboarding smokes from panel (Xray + Hysteria) and confirm jobs complete without `repairable`;
  - if any runtime verify failure persists, patch exact failing step with captured diagnostics.

- Worked on: builder canvas usability pass (smooth links, internet egress visualization, bounded workspace/fullscreen, connect error tooltip).
- Finished with:
  - shipped `1c09545`:
    - smooth bezier lines anchored to node ports;
    - restored virtual Internet node with auto egress links from exit nodes;
    - pinned Internet anchor to viewport (no drag-follow);
    - added flow animation for active/egress links;
    - added fullscreen toggle + `Esc` exit;
    - added canvas error tooltip with quick hints for invalid connect;
    - bounded workspace behavior to avoid infinite downward spread;
  - deployed to stand:
    - deployment `n4dzgdhmg8wpekxttn45gmx7` finished;
    - app `running:healthy`.
- Next step:
  - run live visual pass on real mixed chains and polish crossing/readability in dense layouts;
  - add quick connect preset UX (mode/security preset on connect);
  - continue staged retirement of legacy `setupJobs` in non-critical onboarding paths.

- Worked on: eliminating false Hysteria UDP-listener onboarding failures and fixing cascade-builder connector anchoring.
- Finished with:
  - shipped `07ed7a7`:
    - hardened UDP listener verification with active-service fallback and diagnostics;
    - added explicit port-hopping decision logs;
    - fixed builder connector anchoring by unblocking port-node position sync and binding edges to in/out ports;
  - deployed to stand (`e4abcg0hscy1oo82it561ln8`, finished, `running:healthy`);
  - reran required live smokes:
    - remote Hysteria (`194.50.94.149`, `23000-23080`) -> `completed`;
    - same-VPS Hysteria (`89.125.188.83`, `22000-22050`, auto port `8443`) -> `completed`;
    - no `repairable` on either run;
  - validated builder API draft connect/cleanup;
  - removed temporary smoke nodes and re-verified baseline node list.
- Next step:
  - confirm UI-level connector position/interaction on `/panel/cascades/builder` visually;
  - continue cascade diagnostics depth and staged legacy `setupJobs` retirement.

## 2026-04-17

- Worked on: two live Hysteria onboarding smokes (remote portRange + same-VPS) and parser crash blocking onboarding logs.
- Finished with:
  - fixed panel onboarding log parser crash (`isKnownStep is not defined`) in `src/routes/panel/nodes.js`;
  - code commit: `2d3d12c`, deployed to stand (`gfh5tc7t040l9x96ne3b184t`, finished);
  - executed remote smoke (`194.50.94.149`, `portRange=23000-23080`):
    - confirmed port-hopping apply lines in live logs;
    - run stopped on `install-runtime` with UDP listener verify error;
  - executed same-VPS smoke (`89.125.188.83`, `portRange=22000-22050`):
    - run stopped on same UDP listener verify error;
    - expected explicit same-VPS skip-port-hopping line not observed yet;
  - removed temporary smoke nodes and rechecked baseline node list.
- Next step:
  - instrument/fix same-VPS decision visibility for port-hopping branch;
  - harden Hysteria UDP listener verify path to eliminate false negatives;
  - rerun remote + same-VPS live smokes and confirm clean completion.

- Worked on: finishing upstream `v1.0.0...v1.1.0` shortlist + next safe-port wave.
- Finished with:
  - completed final shortlist document with decision buckets and category coverage:
    - `docs/UPSTREAM-V1.1-AUDIT-SHORTLIST.md`;
  - confirmed safe-port batch #2 is live (`ac88f5e`: node `initScript` pre-setup hook);
  - shipped safe-port batch #3 (`0418b6d`):
    - hardened Hysteria port-hopping rule handling (idempotent INPUT/NAT),
    - skip port-hopping on same-VPS setup path;
  - redeployed stand (`l3lbf0a84t4qtlk031uat7nk`) and revalidated key endpoints (`/panel/login`, nodes add, builder, onboarding APIs).
- Next step:
  - run live onboarding smoke with Hysteria node using non-empty portRange and same-VPS case to confirm new behavior in real setup logs;
  - continue cascade diagnostics depth (chain/hop/node reason precision + repair ergonomics);
  - continue staged retirement of legacy `setupJobs` in remaining non-critical status/control touches.

- Worked on: upstream `v1.0.0...v1.1.0` execution start + first safe port wave.
- Finished with:
  - completed forced redeploy for stand health confirmation:
    - deployment `bmx12mg6g80olqrzx6jpwd7z` -> `finished`,
    - app status `running:healthy`,
    - `/panel/login` responded `HTTP 200`;
  - shipped code commit `171b7a7` with first upstream-safe backports:
    - ObjectId-safe group filter in users route;
    - outbound Xray stats in config generator;
    - panel sync compatibility for legacy/new agent `/stats` payload shapes;
    - cc-agent stats snapshot model with node outbound totals;
    - same-VPS agent firewall hardening in node setup.
- Next step:
  - finish full upstream triage (`security/stability/UX/infra`) and build final shortlist:
    - take now,
    - take with adaptation,
    - skip;
  - continue next backport wave as small safe commits + stand regression checks.

- Worked on: continuity prioritization for upstream Celerity delta sync.
- Finished with:
  - added mandatory task to audit upstream `v1.0.0...v1.1.0` changes;
  - fixed source of truth in docs with direct compare reference:
    - `https://github.com/ClickDevTech/CELERITY-panel/compare/v1.0.0...v1.1.0`;
  - marked expectation to selectively port only safe/high-signal stability and security fixes.
- Next step:
  - execute full upstream delta review and produce actionable port shortlist with risk notes.

- Worked on: live mixed-run cascade parity validation + execution diagnostics depth.
- Finished with:
  - executed real mixed run on stand (`success + failed` together) and validated:
    - `All / Failed / Success` filter behavior,
    - failed-only TXT scope,
    - failed-only JSON scope + full `errorDetails`;
  - restored topology after QA run (removed temporary fail node/links, restored baseline active link);
  - shipped diagnostics depth increment (`4a48a53`);
  - shipped hop-focused diagnostics/actions increment (`23dd5f8`):
    - hop attribution in `errorDetails` where possible,
    - `focus-hop` suggested action in backend,
    - `focus-hop` button handling in builder UI;
  - deployed both commits to stand:
    - `c11uk70kbde8fy6147kh72bh`,
    - `v1k0npe0ff1qk1gr8t7x4c6y`,
    final state `running:healthy`.
- Next step:
  - continue chain/hop/node attribution precision for ambiguous error messages;
  - keep extending compact repair/re-run actions in diagnostics;
  - continue staged retirement of remaining non-critical legacy `setupJobs` reads/writes.

- Worked on: setup-status source separation for onboarding/legacy and deeper cascade failure diagnostics.
- Finished with:
  - added mode-aware setup-status onboarding job selector in `src/routes/panel/nodes.js`;
  - setup-status now explicitly marks source (`statusSource`: onboarding/legacy/none);
  - setup-status now avoids legacy-bridge source confusion when legacy setup is the active signal;
  - expanded cascade deploy failure classifier with:
    - `tls-handshake-failed`,
    - `agent-api-timeout`,
    - `port-bind-failed`,
    - `resource-limits`;
  - added RU/EN hint coverage and suggested action mapping for new classes;
  - pushed code commit `891965a`;
  - deployed on stand via Coolify deployment `kcmqx0qbbogrwyz3ehms5u1a` (`finished`, app `running:healthy`).
- Next step:
  - run one live mixed cascade execution and validate new classification/hints on real failed chains;
  - continue staged retirement of remaining non-critical `setupJobs` paths without breaking legacy fallback.

- Worked on: real mixed-run cascade validation + diagnostics deepening + staged onboarding retirement increment.
- Finished with:
  - executed live mixed run with both success and failed chains in one execution cycle;
  - confirmed parity for:
    - `All / Failed / Success` execution filtering,
    - failed-only TXT export scope,
    - failed-only JSON export scope and full `errorDetails`;
  - expanded deploy failure classification/hints and suggested actions for SSH/network/offline classes;
  - rendered suggested actions + node status directly in builder diagnostics UI;
  - applied safe onboarding-full guard trim to legacy setup lookup path;
  - pushed code commit `0f95459` and triggered forced Coolify deploy.
- Next step:
  - continue chain/hop/node-level error normalization precision for difficult failure classes;
  - continue staged retirement of remaining non-critical `setupJobs` reads in onboarding paths, while preserving legacy fallback until parity is confirmed.

- Worked on: cascade builder failed-chain diagnostics/repair UX and onboarding legacy-guard isolation increment.
- Finished with:
  - added deploy error classification with structured `code/severity/hint/suggestedActions`;
  - extended failed chain cards with richer diagnostics and critical-state display;
  - added failed-chain quick actions:
    - repair node (onboarding repair trigger),
    - open node;
  - included `errorDetails` in failed-only JSON diagnostics export;
  - trimmed onboarding durable path coupling to in-memory `setupJobs` in legacy-bridge touchpoints;
  - verified deployment of `951f452` and confirmed stand `running:healthy`.
- Next step:
  - execute a true mixed-run on stand (at least one success + one failed chain);
  - verify `All / Failed / Success` filter and failed-only TXT/JSON parity on that mixed-run dataset;
  - continue staged retirement of remaining non-legacy `setupJobs` control/status paths.

- Worked on: cascade execution parity (diagnostics depth + repair/re-run ergonomics) and onboarding control-path retirement increment.
- Finished with:
  - added structured deploy `errorDetails` (chain/node context + related hop hints);
  - added failed-chain quick actions in builder diagnostics:
    - focus start node,
    - retry chain;
  - added `POST /api/cascade-builder/rerun-chain` and persisted rerun snapshots into `lastExecution`;
  - reduced legacy `setupJobs` impact on onboarding-full endpoints (`resume/repair/rerun-step`);
  - scoped legacy duplicate-run guard in `/setup` to legacy mode only.
- Next step:
  - run real mixed-run on stand and validate filter/export parity on live data;
  - verify quick `retry chain` behavior against real failed chains;
  - continue staged retirement of remaining legacy in-memory setup control paths.

- Worked on: compact diagnostics export for failed cascade chains.
- Finished with:
  - added `Failed only` action in builder execution diagnostics;
  - export now produces short incident-friendly text for failed chains only;
  - full text/json exports remain available.
- Next step:
  - add diagnostics quick action to focus failed chain context on canvas;
  - continue flow execution parity for builder actions.

- Worked on: cascade diagnostics export formats for builder execution panel.
- Finished with:
  - added separate `Copy TXT` / `Copy JSON` actions in execution diagnostics;
  - added structured JSON diagnostics envelope for automation/runbooks;
  - kept plain-text export path as quick human-readable incident summary.
- Next step:
  - add failed-chain-only compact export action;
  - continue cascade execution parity UX (focus/jump actions from diagnostics cards).

- Worked on: cascade execution diagnostics operator UX.
- Finished with:
  - added copy button to builder execution diagnostics panel;
  - implemented plain-text diagnostics snapshot builder in frontend;
  - added RU/EN locale strings for copy action and feedback.
- Next step:
  - live smoke copy action from `/panel/cascades/builder` after real commit+deploy run;
  - add optional structured export format only if operator needs file-based sharing.

- Worked on: staged retirement of in-memory setup mirror for onboarding-full.
- Finished with:
  - onboarding-full start no longer initializes `setupJobs`;
  - onboarding runner no longer writes success/error state to `setupJobs`;
  - setup-status onboarding response now comes directly from durable onboarding logs/status;
  - added durable live-log append path into onboarding job logs.
- Next step:
  - run fresh onboarding-full smoke on stand and verify status/log behavior end-to-end;
  - continue removing remaining onboarding-full `setupJobs` dependencies if no regressions.

- Worked on: cascade execution parity diagnostics (builder commit/deploy path).
- Finished with:
  - enriched `commit-drafts` deployment diagnostics with per-chain metadata and localized deploy errors;
  - added persisted `lastExecution` snapshot in builder draft cache;
  - added dedicated execution diagnostics panel on `/panel/cascades/builder`;
  - synced `ru/en` locale coverage for the new diagnostics UI.
- Next step:
  - run live commit+deploy smoke on stand and validate diagnostics parity with real node outcomes;
  - continue staged retirement of legacy setup control-path (`setupJobs`) in non-onboarding-primary flows.

- Worked on: short-cycle cascade deployment unblock.
- Finished with:
  - fixed Docker-safe `postinstall` behavior for cascade vendor sync;
  - added explicit post-copy `sync:cascade-vendor` in Dockerfile;
  - pushed `b43f75a` to `main`;
  - forced Coolify deployment and confirmed `running:healthy`.
- Next step:
  - continue cascade feature development from current builder stop-point (no need to revisit deployment plumbing unless new regression appears).

- Worked on: cascade builder per-hop security editor expansion.
- Finished with:
  - added TLS/REALITY security controls in draft inspector (`SNI`, `fingerprint`, `dest`, `shortId`);
  - added backend validation for REALITY shortId and fingerprint;
  - added commit-time fallback generation of REALITY keypair/shortId when missing;
  - synced preview assumptions and locale coverage for new security behavior.
- Next step:
  - deploy and smoke test `security=none/tls/reality` scenarios with `commit + deploy`;
  - continue into deeper policy knobs after confirming parity on live test nodes.

- Worked on: cascade builder graph dependency hardening (CDN removal).
- Finished with:
  - moved builder graph scripts to local `/vendor/cascade/*` paths;
  - added `scripts/sync-cascade-vendors.js` and wired it into `postinstall`;
  - pinned graph libraries in `package.json` and updated lockfile;
  - kept generated vendor assets out of git via `.gitignore`.
- Next step:
  - push/deploy and run live builder smoke (`/panel/cascades/builder`) to confirm graph still initializes;
  - proceed with deeper per-hop security/policy editor fields (REALITY/TLS knobs).

- Worked on: cascade builder advanced transport draft editor.
- Finished with:
  - added WS/gRPC/XHTTP transport-specific fields to draft-hop inspector;
  - added backend validation/normalization for advanced fields including XHTTP mode allowlist;
  - ensured commit bridge preserves advanced transport values in resulting legacy links;
  - synced locale coverage for new advanced editor fields.
- Next step:
  - run live smoke for WS/gRPC/XHTTP edit -> preview -> commit+deploy flow;
  - remove external CDN dependency for builder graph libraries;
  - then continue with deeper security/policy hop settings.

- Worked on: cascade builder per-hop draft editing workflow.
- Finished with:
  - added draft-hop update/delete API endpoints in builder route;
  - enabled inspector form for draft hops (`mode/protocol/transport/security/port/mux/name`);
  - added strict backend allowlists and validation-reject path before draft persistence;
  - added per-hop remove action without full draft reset;
  - synced new UI/backend messages in `ru/en` locales.
- Next step:
  - run live smoke from `/panel/cascades/builder` with real draft edits and `commit + deploy`;
  - extend inspector to transport-specific advanced fields (WS/gRPC/XHTTP) when base edit flow is confirmed on stand;
  - continue flow-native cascade roadmap while keeping legacy deploy fallback.

- Worked on: practical cascade flow continuation after onboarding stabilization (builder-side deploy path).
- Finished with:
  - `commit + deploy` support in the builder API via `deployAfterCommit`;
  - chain-target deployment execution from committed drafts with per-chain diagnostics;
  - plan-aware blocking for drafts that already fail commit checks;
  - separate builder UI action (`Commit and deploy`) while preserving safe commit-only action;
  - locale coverage for new builder actions/messages.
- Next step:
  - verify this flow live on test nodes from `/panel/cascades/builder` (`draft -> commit+deploy`);
  - collect real chain deployment outcomes on mixed test topologies;
  - continue per-hop settings UX so operators can edit commit payload before bridge mutation.

## 2026-04-16

- Worked on: experimental `Cascade Builder` implementation on top of the current cascade topology.
- Finished with:
  - separate builder page and nav entry;
  - separate builder API and domain normalizer/validator;
  - Redis-backed operator draft state for draft hops and builder-only layout;
  - transitional `draft -> legacy link` commit path from the builder;
  - pure `deploy preview / commit plan` layer for the current builder draft state;
  - explicit canvas fallback if Cytoscape assets do not load;
  - continuity/docs updated with builder boundaries and current limitations.
- Next step:
  - verify `/panel/cascades/builder` live with preview + draft commit on the stand;
  - add per-hop commit/config UX on top of the new planner;
  - then return to Android mobile menu accessibility and responsive cleanup.

- Worked on: dashboard UX, continuity setup, isolated project rule, user stats, upstream audit baseline.
- Finished with:
  - interactive traffic chart live on dashboard;
  - isolated project rule embedded in repo;
  - continuity docs created;
  - local session-entry and session-close laws documented;
  - user detail page upgraded with traffic, devices, and node coverage;
  - fresh upstream divergence snapshot captured.
- Next step:
  - resolve the persistent layout/page-drift bug before shipping more shell changes;
  - review the paused local CSS patch in `public/css/style.css`;
  - then continue with node attribution, rebrand cleanup, and upstream triage.

- Additional note:
  - the previously paused CSS diff was finished, committed, and deployed;
  - next session should verify whether the live stand still has any drifting page after the shell rewrite.

- Late update:
  - added another shell-boundary pass for the persistent right-edge drift;
  - localized dashboard hero/topbar/theme/sidebar strings that were still hardcoded;
  - latest live verification is still pending from the deployed stand.

- Stop-point update:
  - user added a new batch of shell/UI requests during an unfinished redesign pass;
  - these were not finished or deployed and were intentionally captured for the next session instead;
  - there is now an active uncommitted patch set in:
    - `public/css/style.css`
    - `views/dashboard.ejs`
    - `views/layout.ejs`
    - `views/users.ejs`
- Next step:
  - review the uncommitted patch set first;
  - then fix sidebar full-height behavior and remaining shell drift;
  - then continue with topbar controls, background texture, users-list actions, accent-color cleanup, and HAPP theme defaults.

- Current local progress:
  - sidebar full-height behavior is being adjusted in CSS;
  - theme switcher is moving toward icon-only controls;
  - background texture is being changed toward paper-noise;
  - user-detail unlimited traffic display is being changed to `∞`.

- Follow-up progress:
  - sidebar now has an inner sticky layer intended to keep the column full-height on long pages;
  - users list actions were expanded and visually clarified;
  - HAPP settings now ship with a dark default color profile plus light/dark preset buttons;
  - next step is live verification on the stand and then another responsive/layout pass where needed.

- Shell continuation:
  - added JS-based shell height syncing for the sidebar/content relationship;
  - removed width-containment from core shell containers to further reduce drift risk;
  - continued rebrand cleanup in frontend storage keys and MCP-visible names.
- Stats continuation:
  - added a real users-activity chart to the statistics page using snapshot-backed user counts;
  - new API path: `/panel/stats/api/users`.
- Next step:
  - deploy and verify whether the sidebar now truly reaches the bottom on long pages;
  - re-test page transitions for remaining drift;
  - only then continue with the next responsive/UI pass.

- Stats/detail refinement:
  - renamed user-detail stats toward clearer operator language;
  - enlarged only the unlimited `∞` indicator;
  - made sidebar footer controls sticky;
  - added `24h / 48h` heatmap switching;
  - added cumulative profile growth to the registrations chart;
  - tightened shared card/header rhythm.
- Next step:
  - deploy and verify the statistics page and user detail page visually;
  - continue the broader responsive pass if any page still drifts or compresses awkwardly.

- Chart visual pass:
  - unified segmented dashboard rings to Java;
  - improved dashboard traffic chart height, texture, marker density, and resize behavior;
  - synced logs height to the right dashboard sidebar;
  - restyled statistics charts into the same Java/Deep Cove visual language;
  - shortened/versioned traffic chart cache to avoid stale `24h`/`7d` mismatches.
- Next step:
  - deploy and visually verify dashboard traffic, logs alignment, and all statistics charts on the live stand.

- Sidebar sticky fix:
  - made the desktop sidebar itself sticky to the viewport;
  - kept sidebar internals scrollable inside the viewport height.
- Next step:
  - verify long-page scrolling on dashboard/settings and confirm the sidebar no longer moves upward with page content.

- Sidebar/chart polish:
  - changed sidebar internals so the nav area scrolls independently while footer controls remain attached to the bottom;
  - kept dashboard segmented rings in the Java accent family;
  - reduced dashboard traffic markers and softened the plot texture;
  - nudged dashboard log height syncing;
  - made statistics charts cleaner and more consistent with the dashboard chart style.
- Next step:
  - deploy and visually verify sidebar footer stickiness, dashboard logs alignment, and statistics chart readability.

- Sidebar/chart correction follow-up:
  - user reported the independent nav scroll still felt wrong;
  - sidebar was moved back toward a whole-column sticky behavior;
  - dashboard traffic sparkline was reworked to be narrower/taller with a higher internal SVG canvas.
- Next step:
  - deploy and verify that the sidebar now behaves like a true fixed shell;
  - verify the dashboard traffic card no longer looks horizontally stretched.

- Sidebar/chart system correction:
  - user reported sidebar still did not feel fixed and dashboard graph quality remained poor;
  - desktop sidebar was moved from sticky to fixed viewport behavior;
  - dashboard traffic graph was migrated off the custom SVG sparkline onto Chart.js.
- Next step:
  - deploy and verify that the sidebar is fully pinned to screen;
  - visually compare dashboard graph quality against statistics-page charts and continue unification.

- Fixed-sidebar shell recovery:
  - the first fixed-sidebar pass hid the page content because the old grid/content relationship broke;
  - restored desktop content offsets and reset them correctly for mobile, so pages render again.
- Chart motion/visual continuation:
  - dashboard traffic chart now spans the full available width of the hero card;
  - dashboard and statistics charts now use stronger Chart.js animation, thicker lines, larger points, and richer plot surfaces.
- Next step:
  - deploy and verify that the sidebar stays pinned while pages render normally;
  - visually review the new dashboard/statistics chart language on the live stand;
  - then continue the remaining responsive and users/subscription polish queue.

- Mobile shell/localization continuation:
  - moved language/theme controls into the mobile menu flow;
  - made mobile overlay/menu closing explicit and locked body scroll while menu is open;
  - added Russian/English pluralization support in middleware and applied it to visible dashboard counters;
  - localized more dashboard labels and status text;
  - re-centered mobile hero metric cards and profile/device rings.
- Next step:
  - deploy and verify mobile menu clickability on Android;
  - check remaining untranslated strings on dashboard and then continue into other pages;
  - continue responsive cleanup on statistics, users, settings, and subscription.

- Dashboard recovery / cleanup continuation:
  - fixed the shared render helper so pluralization helper `tp` reaches compiled templates on live render;
  - swapped right-column dashboard cards so `Server` comes before `Quick Actions`;
  - started the double segmented ring treatment for dashboard metrics;
  - localized the settings hero and improved pluralized counts on the users page.
- Next step:
  - deploy and verify the dashboard no longer crashes on render;
  - visually check the new double-ring treatment;
  - continue the responsive/mobile cleanup across statistics, settings, and subscription page.

- Mobile/settings/subscription cleanup continuation:
  - made settings tabs horizontally scrollable on mobile instead of wrapping badly;
  - collapsed settings and subscription preview surfaces more cleanly for narrow screens;
  - improved statistics mobile chart headers/legends/heatmap overflow behavior;
  - localized remaining visible tails in dashboard period chips, subscription settings preview, backup restore buttons, and public subscription eyebrow text.
- Next step:
  - deploy and verify `Statistics`, `Settings`, and subscription-related screens on a real phone;
  - continue the remaining Russian wording pass and then return to ring/visual refinement.

- Dashboard rings / mobile menu recovery:
  - corrected the dashboard ring direction again after the live stand showed thick solid rings instead of thin segmented ones;
  - tightened the mobile shell so the menu should stop leaking clicks to the page behind it;
  - hid the mobile collapse control and converted node action controls to an icon-only 3-column layout on phones.
- Next step:
  - verify on a real phone that the menu is fully clickable and background content is no longer interactive while open;
  - visually confirm the new thin ring treatment in both themes;
  - continue the broader mobile cleanup on `Statistics`, `Users`, `Settings`, and the subscription page.

- Dashboard rings continuation:
  - replaced the intermediate ring markup with a simpler CSS pseudo-element implementation and deployed it;
  - user approved the direction but requested a more specific geometry target:
    - `80x80`,
    - `gap 5`,
    - `border width 1`;
  - started a new local-only CSS tweak to propagate that rhythm to large rings, mobile rings, and mini rings.
- Current local CSS values:
  - large rings `80x80`, `gap 5`, `border 1`, `font-size 18`;
  - mini rings `68x68`, `gap 4`, `font-size 15`;
  - mobile large rings `84x84`, `font-size 19`;
  - mobile mini rings `72x72`, `font-size 16`.
- Next step:
  - review the uncommitted `public/css/style.css` ring-size tweak first;
  - deploy only after visual confirmation of the ring proportions;
  - then return to the still-broken mobile menu accessibility.

- Dashboard follow-up cleanup:
  - normalized mini-ring sizing by removing the conflicting `soft` size override;
  - removed duplicated numeric output such as `0 0 устройств` and `из 2 2 пользователя`.
- Next step:
  - verify the two mini rings now match in size;
  - verify dashboard counts read naturally again;
  - then return to mobile menu accessibility.

- Dashboard mini-ring / label deploy pass:
  - captured and shipped the narrow fix for equal mini-ring sizing;
  - captured and shipped the cleanup for duplicated pluralized counts on dashboard labels.
- Next step:
  - verify mini rings on desktop/mobile against the live stand;
  - then continue with Android mobile menu accessibility.

- Dashboard device-stats fallback:
  - traced the remaining `0 / 0` problem in `Profiles and devices` to a metrics split between node online telemetry and Redis device activity;
  - added a dashboard-only fallback from `onlineUsers` so Xray/agent-backed sessions do not leave that card empty;
  - added a visible note when fallback estimation is being used instead of real device telemetry.
- Next step:
  - verify the dashboard card now reflects active Xray sessions more honestly;
  - then continue with Android mobile menu accessibility and later true per-device Xray attribution.

- Xray attribution continuation:
  - wired Xray agent `/stats` traffic deltas into Redis device activity;

## 2026-04-17

- Worked on: experimental `Cascade Builder` polish pass before returning to deeper cascade work.
- Finished with:
  - fuller `ru/en` translation coverage for builder UI and API-facing error surfaces;
  - localized validation and deploy-preview messages instead of mixed English output;
  - dark-theme-aware Cytoscape styling so the canvas itself now follows the active panel theme;
  - responsive cleanup for builder hero actions, summary cards, library/inspector spacing, and mobile canvas sizing;
  - fixed the builder draft-commit response so `summary` returns a real validation summary again.
- Worked on: node auto-setup / agent onboarding audit.
- Finished with:
  - traced the current install flow across `panel/nodes`, `nodeSetup`, `syncService`, and node form UI;
  - documented why first-run setup can succeed only on the second pass;
  - wrote a dedicated rewrite blueprint for a Hidden Rabbit onboarding pipeline in `docs/node-onboarding-rewrite-blueprint.ru.md`.
- Next step:
  - commit and deploy the builder polish pass;
  - then begin turning the onboarding rewrite blueprint into a concrete state-machine/model implementation before test servers arrive.

- Final stop-point update:
  - builder polish pass is now already committed, pushed, and deployed on the live stand;
  - onboarding rewrite still exists only as blueprint/docs, not as code;
  - next session should start directly with `NodeOnboardingJob` / onboarding service scaffolding.
  - active Xray users now create synthetic device entries tied to node id/name/source;
  - this gives profile/node attribution without requiring immediate cc-agent binary changes.
- Next step:
  - deploy and verify after a stats poll with real Xray traffic;
  - then continue Android mobile-menu accessibility.

- User list attribution continuation:
  - added a live activity column to the users list;
  - the list now surfaces active session count and active node hints from Redis device activity;
  - user detail now labels synthetic Xray stats sessions as profile traffic activity instead of exposing internal Redis keys.
- Next step:
  - deploy and verify the users list against a connected Xray profile;
  - confirm that the user detail page shows a readable Xray activity source and node name;
  - then continue either true per-device agent support or Android mobile-menu accessibility.

- Xray true session telemetry continuation:
  - added `/sessions` support to `cc-agent`;
  - enabled panel-side polling/consumption of real Xray session records;
  - prepared Xray config/node setup for access logs;
  - preserved fallback behavior for old agents;
  - normalized dashboard numeric ratio labels to use `/` instead of `из`.
- Finished with:
  - `main` clean and matching `origin/main`;
  - latest deployed commit `9e2bed1`;
  - Coolify deployment finished and app status `running:healthy`.
- Next step:
  - install/update the new `cc-agent` binary on a test Xray node;
  - verify Xray access logs and `GET /sessions`;
  - confirm real session/client IP attribution in the panel;
  - then return to Android mobile menu accessibility and responsive page cleanup.

- Mobile menu accessibility continuation:
  - moved the mobile overlay into the `.app` shell to avoid stacking-context mismatch;
  - raised sidebar over overlay explicitly and kept page content blocked while the menu is open;
  - added ARIA state updates and Escape close behavior.
- Next step:
  - deploy and verify on Android that menu items, language/theme controls, and logout are tappable while the page behind is blocked.

- Xray true session telemetry continuation:
  - added `GET /sessions` to `cc-agent`;
  - enabled Xray access-log output in generated node configs;
  - taught panel sync to consume real client IP sessions when the agent supports them;
  - kept `/stats`-based synthetic activity as a fallback for existing agents.
- Next step:
  - build/publish or manually install the updated `cc-agent` binary on test Xray nodes;
  - rerun node setup or config sync so `/var/log/xray/access.log` is enabled;
  - verify user detail/list shows `Xray-сессия` with real client IP instead of only `Xray stats`.

- Visual cascade builder blueprint:
  - formalized the idea of turning current `Network Map` into a future Hidden Rabbit visual cascade builder;
  - captured product vision, UX modes, domain model, validation layers, and phased implementation path;
  - recorded which current code can be reused and which parts should not be carried over as-is;
  - added a separate `v1` technical design doc for the first experimental implementation step.
- Next step for this topic:
  - scaffold a separate experimental builder route/view in this fork;
  - add normalized builder state API;
  - then wire drag-to-connect, inspector, and validation in the new shell.

- Onboarding rewrite implementation (phase 1 scaffold):
  - added durable Mongo model `NodeOnboardingJob` with per-step state/logs and unique active-job guard;
  - added onboarding state-machine domain constants and transition helpers;
  - added onboarding service with start/resume/fail/complete/heartbeat + step transitions;
  - added lightweight onboarding runner scaffold for ordered step execution with handler hooks;
  - added isolated onboarding API endpoints under `/api/nodes/:id/onboarding/*`;
  - kept legacy `/:id/setup` path unchanged at this stage.
- Next step:
  - start wiring the new onboarding job lifecycle into panel node-add/setup UX behind a safe staged path;
  - keep legacy setup as fallback while new onboarding jobs run in parallel/shadow;
  - then begin replacing in-memory `setupJobs` status surface with durable onboarding status read-model.

- Onboarding bridge integration continuation:
  - wired durable onboarding job initialization into panel setup start endpoint;
  - bridged panel background setup success/fail into onboarding job state;
  - exposed onboarding payload in panel setup-status responses;
  - wired API `/nodes/:id/setup` to initialize and return `onboardingJobId`;
  - kept legacy setup runner as primary executor (no hard cutover).
- Next step:
  - switch setup-status UI rendering to onboarding-first state model in panel templates/js;
  - implement first true runner handlers (`preflight`, `prepare-host`) instead of synthetic bridge completion;
  - start replacing in-memory panel `setupJobs` map with onboarding-job persistence.

- Onboarding handlers continuation:
  - added real `preflight` and `prepare-host` handlers;
  - added `nodeOnboardingPipeline.runUntilInstallRuntime(...)`;
  - added API trigger `POST /api/nodes/:id/onboarding/jobs/:jobId/run-preflight`.
- Next step:
  - implement real `install-runtime` handler adapter;
  - add runtime local verification handler;
  - then reduce synthetic bridge step completion in favor of real step transitions.

- Onboarding runtime handler continuation:
  - added real `install-runtime` handler adapter over existing `nodeSetup` routines;
  - added real `verify-runtime-local` handler as runtime-online gate;
  - extended pipeline with `runUntilAgentInstall(jobId)`;
  - added API trigger `POST /api/nodes/:id/onboarding/jobs/:jobId/run-runtime`.
- Next step:
  - implement `install-agent` + local/panel verification handlers;
  - then start routing selected setups through full pipeline steps instead of synthetic bridge completion.

- Onboarding agent handler continuation:
  - added `install-agent`, `verify-agent-local`, and `verify-panel-to-agent` handlers;
  - extended pipeline to `runUntilSeedNodeState(jobId)`;
  - added API trigger `POST /api/nodes/:id/onboarding/jobs/:jobId/run-agent`.
- Next step:
  - implement real `seed-node-state` and `final-sync` handlers;
  - switch panel setup-status to onboarding-first rendering;
  - then phase out synthetic bridge completion.

- Onboarding full-chain continuation:
  - added real `seed-node-state` and `final-sync` handlers;
  - added full pipeline executor `runFull(jobId)`;
  - added API trigger `POST /api/nodes/:id/onboarding/jobs/:jobId/run-full`.
- Next step:
  - switch panel setup-status UI to onboarding-first model;
  - move selected setup executions onto `runFull` path;
  - then remove synthetic bridge completion and in-memory setup-job dependency.

- Onboarding setup-mode cutover continuation:
  - panel setup start now resolves execution mode and can run durable `runFull` onboarding path;
  - staged default sends Xray setup through onboarding-full, with legacy fallback preserved;
  - setup-status now uses onboarding-first state/log/error mapping (legacy setup map is fallback);
  - API setup now supports `setupMode=onboarding-full` and returns durable onboarding logs;
  - duplicate-run guard added for active onboarding jobs.
- Onboarding setup-mode normalization:
  - onboarding job metadata now stores real flow/mode for durable vs legacy starts;
  - panel setup UI now sends explicit setup mode (`onboarding-full` for Xray, `legacy` otherwise).
- Onboarding recovery controls continuation:
  - added panel endpoints for onboarding `resume` and `repair`;
  - added Resume/Repair buttons in node management UI;
  - setup/resume/repair now share one polling/progress path in node form scripts.
- Onboarding jobs visibility continuation:
  - added resume-step selector in node management UI;
  - added recent onboarding jobs summary widget fed from onboarding jobs API.
- Next step:
  - remove synthetic bridge completion from paths already executing onboarding-full;
  - add richer per-job diagnostics surface (last error/details/actions) on top of summary widget;
  - then begin staged retirement of in-memory `setupJobs`.

- Session close update:
  - committed onboarding phase-3 continuation in `main`:
    - `d5e9796`
    - `13debe8`
    - `204a1c9`;
  - node management now has resume/repair controls and onboarding jobs visibility;
  - continuity docs and next-launch prompt were refreshed before close.
- Next step:
  - remove synthetic bridge completion from onboarding-full path;
  - add deeper per-job diagnostics/actions UI;
  - begin staged retirement of in-memory `setupJobs`.

- Onboarding phase 3.4 continuation:
  - isolated legacy bridge and durable onboarding modes to avoid cross-mode synthetic step mutation;
  - added setup-mode compatibility guards in panel/API setup paths;
  - blocked legacy bridge jobs from onboarding-full resume path;
  - expanded node management onboarding jobs surface with diagnostics cards and per-job actions;
  - added explicit onboarding job details API (`GET /api/nodes/:id/onboarding/jobs/:jobId`).
- Next step:
  - start staged retirement of in-memory `setupJobs` from `/panel/nodes/:id/setup-status`;
  - keep legacy execution fallback while shifting status/log authority to durable onboarding read model;
  - then add safe step-level rerun action for durable jobs.

- Onboarding phase 3.5 continuation:
  - moved setup-status behavior further to durable-onboarding authority and limited in-memory setup map reads to legacy mode;
  - setup/resume/repair now prioritize durable running job checks over in-memory setup state;
  - added safe step-level rerun action for durable onboarding jobs (route + UI button + locale strings).
- Next step:
  - continue retiring in-memory `setupJobs` from remaining control paths;
  - keep legacy setup execution fallback;
  - then verify rerun/resume/repair behavior on live onboarding scenarios.

- Setup logs UX + live-stream continuation:
  - removed false red severity for benign stderr lines in node setup console;
  - added line-by-line SSH output streaming callbacks in `execSSH`;
  - wired live streaming through Xray runtime setup + cc-agent install;
  - wired onboarding runner + handlers to emit live progress lines into panel setup status.
- Next step:
  - validate live setup output on a fresh Xray node (no second run);
  - then apply the same line-stream channel to Hysteria setup path;
  - then continue onboarding parity cleanup (legacy bridge retirement).

- Onboarding prepare-host failure hardening:
  - traced opaque `Prepare-host marker missing in SSH output` to missing SSH command result diagnostics;
  - hardened onboarding handlers to fail with structured SSH details (exit code + stderr/stdout tail);
  - enabled live stdout/stderr line forwarding for `preflight` and `prepare-host`;
  - made `prepare-host` directory prep resilient when directory paths already exist as files.
- Next step:
  - re-run fresh onboarding on a new node and confirm first-pass success;
  - if fail repeats, use diagnostics payload to patch exact SSH command issue (instead of marker guesswork);
  - then continue Hysteria live-stream parity.

- Onboarding preflight shell compatibility continuation:
  - reproduced recurring `preflight failed: Exit code: 2 ... sh: 1: set: Illegal option -o t`;
  - identified shell wrapper regression from semicolon-flattened command assembly in durable preflight path;
  - switched onboarding shell wrapper to preserve multiline script semantics with safe single-quoted payload;
  - deployed `49b1867` to Coolify stand (`tunnel.hiddenrabbit.net.ru`), deployment finished healthy.
- Next step:
  - re-test on fresh node with `Настроить автоматически` (or `Повторить шаг` for preflight) and confirm first-pass pass-through of `preflight -> prepare-host`;
  - if any preflight failure remains, capture new diagnostics block and patch exact command/tooling condition;
  - then continue onboarding pipeline diagnostics/actions improvements.

- Verify-runtime false offline continuation:
  - reproduced onboarding fail at `verify-runtime-local` with `Runtime is offline (no status)` while `xray.service` was active;
  - normalized runtime status parsing in onboarding handler (supports string/object results);
  - added bounded retry in verify-runtime-local to avoid transient startup races;
  - deployed fix in commit `9f066c8`.
- Next step:
  - run fresh onboarding again and confirm pass through `verify-runtime-local`;
  - if next failure appears, patch step-specific diagnostics/handler and keep durable flow moving.

- Cascade builder diagnostics continuation:
  - added `Failed JSON` export for execution diagnostics;
  - added execution list filter (`All / Failed / Success`) with filtered empty state;
  - kept compact failed TXT export and full JSON export in place.
- Next step:
  - validate filter/export behavior on real multi-chain run with both successful and failed chains;
  - continue cascade execution parity diagnostics and onboarding legacy retirement.

- Mixed-run QA runbook continuation:
  - added `docs/cascade-mixed-run-checklist.ru.md` as operational checklist for real mixed-run verification;
  - locked expected failed-only JSON schema and export/filter PASS criteria in one place.
- Next step:
  - execute one live mixed-run using this checklist and capture first parity report;
  - if mismatch appears, patch diagnostics payload/labels first before deeper builder UX increments.

- Cascade diagnostics quick-actions continuation:
  - added actionable controls directly in `errorDetails` cards (rerun/focus/repair/open/check);
  - added toolbar batch action `Rerun failed` for failed chains only;
  - updated i18n + styles for new execution controls;
  - deployed commit `008f422`, deployment `zbk88zcm7adt3pkjai6v1oth`, stand back to `running:healthy`.
- Next step:
  - run one real mixed execution on stand and validate filter/export parity with checklist;
  - then continue staged retirement of in-memory onboarding status/control path without breaking legacy fallback.

- Cascade diagnostics depth increment + mixed-run parity confirmation:
  - shipped and deployed `e32055b`:
    - hop endpoint context added to `errorDetails` (`hopSource*` / `hopTarget*`);
    - new diagnostics actions: `open-hop-nodes`, `repair-hop-nodes`;
    - setup-status legacy in-memory fallback narrowed to legacy/running cases.
  - verified mixed-run dump (`/tmp/cascade_test_commit_deploy3.json`):
    - success+failed run present (`2 chains / 1 failed`);
    - failed chain includes enriched hop fields + new action set.
- Session end state:
  - stand cleanup started but interrupted by stop request;
  - temporary mixed-run active links + `QA-FAIL-MIX` node still pending removal.
- Next step:
  - finish topology cleanup on stand;
  - verify baseline via `/api/cascade-builder/state` and `/api/cascade/links`;
  - continue diagnostics depth and staged legacy setup-path retirement.

- Mixed-run cleanup continuation:
  - completed stand cleanup (temporary active links + QA node removed);
  - removed stale inactive QA-link that became null after node deletion;
  - baseline stand topology rechecked via `/api/cascade-builder/state`, `/api/cascade/links`, `/api/nodes`.
- Diagnostics depth continuation:
  - added hop endpoint statuses to `errorDetails` (`hopSourceNodeStatus`, `hopTargetNodeStatus`);
  - rendered endpoint status line in execution details UI;
  - shipped as `a048834`, deployed via Coolify (`b5jtcgvrpuct3kvst7se9z5z`, finished healthy).
- Next step:
  - continue chain/hop/node diagnostics precision for ambiguous failures;
  - add one more compact repair/re-run operator convenience action;
  - keep staged retirement of non-critical legacy `setupJobs` reads incremental.

## 2026-04-18 Session — Builder Reset/Disconnect + Fullscreen

- Worked on:
  - reset button was not useful for already created links;
  - no direct unlink from line interaction;
  - confusing fullscreen behavior and inspector navigation.
- Finished with:
  - `e09ac95` in `main`;
  - reset now clears current draft + live links with one action;
  - line unlink via right-click and via keyboard on selected hop;
  - live hop inspector unlink action added;
  - native fullscreen API integrated and synced with UI state;
  - inspector auto-scroll and clickable Internet exit list.
- Deployed:
  - `l3zntrbwr90pks4tx9ns7mst` (finished), stand `running:healthy`.
- Next step:
  - user validation pass on builder UX (reset, right-click unlink, fullscreen);
  - if needed, add optional drag-to-empty unlink gesture and stronger routing curves for dense graphs;
  - continue cascade diagnostics depth + staged legacy setupJobs retirement.

## 2026-04-18 Session — Builder Link Stability + Internet Section

- Worked on:
  - cascade builder connect UX instability (extra lines before refresh),
  - explicit Internet egress visibility inside builder,
  - clearer validation reasons for invalid topologies.
- Finished with:
  - code commit `96e70b1` in `main`;
  - in-flight connect guard + authoritative reload on draft create;
  - virtual Internet node/edges + right-side Internet section;
  - stricter validation and localized human-readable errors.
- Next step:
  - deploy and run live manual drag test on stand;
  - verify no transient extra lines appear during connect;
  - tune visual routing/edge spacing after real user pass.

## 2026-04-18 Session — Drag-To-Empty Disconnect + Smoother Curves

- Worked on:
  - need a faster way to disconnect specific links without hunting in inspector;
  - graph lines still looked uneven/crooked on dense layouts.
- Finished with:
  - code commit `386317d` in `main`;
  - drag-connect to empty canvas now acts as disconnect intent for source outgoing link (with safety guards);
  - right-click disconnect remains the exact/primary per-line action;
  - edges switched to data-driven smooth bezier routing with cleaner joins and consistent arrow style.
- Deployed:
  - `y6rq8z8oe2fj6mmcd5onwucp` (finished), stand `running:healthy`.
- Next step:
  - validate operator feel on real chains (connect/disconnect rhythm);
  - if needed, fine-tune curve bias constants and per-density spacing;
  - continue cascade diagnostics depth + staged legacy setupJobs retirement.

## 2026-04-18 Session — Runtime Offline Fix + Builder Validation/Reset Pass

- Worked on:
  - user-reported runtime onboarding failures after role/cascade changes (`Runtime is offline`);
  - unclear validation behavior in cascade builder;
  - reset links action intermittently failing for mixed link-id formats.
- Finished with:
  - `683c013` in `main`;
  - onboarding/runtime now repairs `/var/log/xray/*` ownership/permissions before Xray service start;
  - builder validation list now has explicit counters and focusable context entries (code/hop/node);
  - live-link disconnect/reset hardened with multi-candidate ObjectId fallback;
  - connect draft nonce normalized (`id` == `edgeId` suffix).
- Deployed:
  - `z11s5wx8k1d29ztjgofqc1g5` (finished), stand `running:healthy`.
- Next step:
  - run live onboarding retry on affected node(s) to confirm no more `permission denied` / `Runtime is offline`;
  - verify reset links and validation focus behavior in builder UI under real topology;
  - continue automation wave: role transitions (standalone/portal/relay/bridge) + background reconfigure orchestration.

## 2026-04-18 Session — Onboarding Jobs UX + Sidecar Standalone Gate Shipped

- Worked on:
  - onboarding jobs UX (collapse/hide/clear completed) for long reports list;
  - Hysteria sidecar behavior when toggle is ON but topology is effectively standalone.
- Finished with:
  - backend clear-jobs API shipped (`DELETE /api/nodes/:id/onboarding/jobs`);
  - node management UI shipped (`Hide completed`, `Clear completed`, collapsible job cards);
  - locale keys shipped (`ru/en`) for onboarding jobs controls;
  - sidecar requirement gate shipped:
    - overlay required only with active relevant links,
    - standalone path strips `__cascade_sidecar__` rules;
  - code commit: `8854c80`;
  - forced deploy: `baw9e7yrm7a6ofi5y8lp1jar` (finished, healthy);
  - live smoke-check on Hysteria (`sidecar=true`, no active links) is green.
- Next step:
  - verify overlay-required scenario (active links) for Hysteria sidecar path;
  - continue node/cascade automation track (role transitions + background reconfigure).

## 2026-04-18 Session — Cascade Builder Link Realtime Hardening

- Worked on:
  - user-reported extra links appearing after create/refresh;
  - reset/unlink requiring manual page refresh to feel applied;
  - need to connect from node card drag, not only tiny out-port target.
- Finished with:
  - code commit `3e895f9` in `main`;
  - `edgehandles` source extended to node cards + out ports;
  - duplicate `source->target` guard before new draft connect;
  - optimistic local hop/edge prune on unlink/reset for faster UI consistency.
- Next step:
  - verify live on stand with same user scenario (xray-relay-xray);
  - if any ghost link remains, add server-side dedupe guard in `/api/cascade-builder/connect`;
  - continue automation path (role transitions + background reconcile notifications).

## 2026-04-18 Session — Builder Connect/Reset Follow-up

- Worked on:
  - remaining builder usability issues from live run (extra links + non-realtime reset + port-only connect).
- Finished with:
  - code commit `017a100` in `main`;
  - node-body drag connect enabled (right-side card drag gesture);
  - client-side flow hop normalization to suppress duplicate directional links in canvas;
  - reset links now converges with bounded state re-poll (no manual refresh dependency).
- Next step:
  - verify on stand that connect/disconnect/reset behaves consistently in one pass;
  - if server still returns duplicated links under race, add backend idempotency/dedupe in `/api/cascade-builder/state` or `/api/cascade-builder/connect`;
  - continue cascade automation track after builder UX is stable.

## 2026-04-19 Session — Desktop Drag Gesture Patch

- Worked on:
  - user reported that link creation still felt point-only (circles), not node-to-node drag.
- Finished with:
  - code commit `e01f8ac` in `main`;
  - explicit desktop drag fallback added (`mousedown` source body -> `mouseup` target node).
- Next step:
  - verify on stand by drag from right side of source card body directly to target card;
  - if any browser still misses gesture, add pointer-events fallback (`pointerdown/pointerup`) in the same handler.

## 2026-04-19 Session — Port-To-Port Mouse Flow + Dark Theme Fix

- Worked on:
  - user requested true port circle to port circle dragging with visible line;
  - cascades page dark theme was not consistently applied.
- Finished with:
  - code commit `196cfc8` in `main`;
  - custom port drag line implemented (live dashed line during drag, commit on target port/node);
  - active IN-port highlight during drag;
  - dark-theme selectors aligned to `:root[data-theme="dark"]` in cascade builder CSS.
- Next step:
  - live verify on stand:
    - port-to-port drag creates hop in one gesture,
    - dark mode switches correctly without manual class hacks.
