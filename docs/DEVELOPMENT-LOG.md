# Development Log

## 2026-04-16

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
