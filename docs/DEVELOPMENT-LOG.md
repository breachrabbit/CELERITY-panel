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
