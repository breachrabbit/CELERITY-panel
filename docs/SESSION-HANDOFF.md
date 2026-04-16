# Session Handoff

## Current State

- State: `pending`
- Repository mode: isolated operational fork
- Deployment mode in active use: Coolify + `docker-compose.coolify.yml`
- Current active stand: `https://tunnel.hiddenrabbit.net.ru/panel`
- Local uncommitted work exists:
  - `public/css/style.css` contains a partial shell-layout fix attempt (`grid + sticky sidebar`) for the page-drift bug;
  - this CSS patch was **not** deployed and **not** committed;
  - next session must review this diff intentionally before either finishing it or reverting it.

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
- layout stabilization work was added for the page-shift bug after navigation.
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
- audited `upstream/main` and identified the most relevant candidate areas for later porting:
  - onboarding / bootstrap;
  - broadcast tooling;
  - Marzban migration;
  - client statistics experiments.

## Not Done Yet

- shell/layout bug is still unresolved:
  - user reports the design still shifts / drifts outside the browser width;
  - this happens on navigation and in some views;
  - the latest in-progress CSS attempt was paused before deployment.
- dashboard / stats visuals still need cleanup:
  - traffic chart currently shows too many points in some states;
  - user wants fewer points, cleaner rhythm, and better human-readable labels;
  - small period toggle is still desired in the dashboard traffic card: `24ч / 7д / 30д`.
- user-level stats are improved but not complete:
  - per-user traffic and device activity now exist in operator UI;
  - exact live node attribution is only partial until node-id metadata is sent consistently;
  - user wants clear visibility of which node(s) a user is actually using, especially once cascades grow.
- repository separation from visible `Celerity` identity is not complete:
  - visible references still exist in UI, login, metadata, TOTP screens, docs, and comments;
  - user wants this fork to continue moving away from the original branding.
- dashboard and shell redesign still need more polish:
  - sidebar collapse affordance is not obvious enough;
  - settings item was reported without a visible icon in one state;
  - language switcher should live near theme controls on the right, not in the sidebar;
  - background texture should be more neutral and less busy;
  - circular metrics should use a segmented / dashed ring style like the provided reference;
  - subscription QR code background/frame should use the project blue instead of the default black feel.
- upstream comparison baseline exists, but adoption triage is still not finished.

## Known Broken / Risky / Pending

- page-drift / width-shift bug is still active and is the highest current UX blocker;
- some screenshots referenced by the user could not be loaded locally because the files were no longer present at the provided paths;
- dashboard graph interaction works, but current density / scaling still looks wrong to the user;
- HAPP behavior should keep being tested on real clients after UI changes;
- user live-node visibility currently depends on optional device metadata headers and is not guaranteed for every session;
- old historical docs exist, but the new continuity set is now the primary path.

## Stop Point

The continuity layer is now in place.

The repo has a local source of truth and a clean session-entry order.

No automatic next wave is opened by this handoff.

## Next Step

Next practical step:

1. resolve the shell/page-drift bug first and only then deploy new UI changes;
2. review the local uncommitted `public/css/style.css` patch and either complete it safely or discard it;
3. after layout is stable, continue with:
   - dashboard traffic-card cleanup (`24ч / 7д / 30д`, fewer points, better labels);
   - user session node attribution;
   - controlled removal of `Celerity` branding from visible surfaces;
   - upstream adoption triage.

## User-Requested Follow-Up Queue

The next session should keep this exact queue in mind:

1. fix the persistent layout drift / page-width bug;
2. reduce graph point density and improve graph readability;
3. add a compact period switcher to the dashboard traffic card;
4. move language controls next to the theme switcher on the right;
5. make sidebar collapse behavior more obvious;
6. ensure every nav item, including Settings, has a visible icon in all states;
7. neutralize the page background texture further;
8. switch circular meters to a segmented ring style matching the user reference;
9. recolor subscription QR framing / background to project blue;
10. continue stronger visual and textual separation from `Celerity`;
11. complete true node attribution for active user sessions;
12. decide which upstream changes to port first.
