# Session Handoff

## Current State

- State: `pending`
- Repository mode: isolated operational fork
- Deployment mode in active use: Coolify + `docker-compose.coolify.yml`
- Current active stand: `https://tunnel.hiddenrabbit.net.ru/panel`
- There is an active uncommitted local UI patch set in:
  - `public/css/style.css`
  - `views/dashboard.ejs`
  - `views/layout.ejs`
  - `views/user-detail.ejs`
  - `views/users.ejs`
- These edits were not finalized in this session and must be reviewed before any deploy.

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

- shell/layout bug is still unresolved:
  - user reports the design still shifts / drifts outside the browser width;
  - this happens on navigation and in some views;
  - the shell rewrite has now been deployed, but needs real verification on the live stand.
- dashboard / stats visuals still need cleanup:
  - traffic chart density was reduced and the dashboard period toggle exists now;
  - charts still need visual refinement and calmer rhythm on the live page;
  - segmented rings still need closer matching to the user reference.
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
