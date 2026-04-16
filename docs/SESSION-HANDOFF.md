# Session Handoff

## Current State

- State: `pending`
- Repository mode: isolated operational fork
- Deployment mode in active use: Coolify + `docker-compose.coolify.yml`
- Current active stand: `https://tunnel.hiddenrabbit.net.ru/panel`
- There is an active uncommitted local UI patch in:
  - `public/css/style.css`
- This local patch is a follow-up ring-geometry tweak only and has **not** been committed/deployed yet.

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
