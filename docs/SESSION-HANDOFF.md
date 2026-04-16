# Session Handoff

## Current State

- State: `pending`
- Repository mode: isolated operational fork
- Deployment mode in active use: Coolify + `docker-compose.coolify.yml`
- Current active stand: `https://tunnel.hiddenrabbit.net.ru/panel`

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

## Done Recently

- added isolated continuity docs layer under `docs/`;
- formalized project isolation rules inside repo;
- formalized continuity law and session close law inside repo;
- redesigned major parts of the admin panel UI;
- deployed latest dashboard chart update to the live stand.

## Not Done Yet

- user-level stats are improved but not complete:
  - per-user traffic and device activity now exist in operator UI;
  - exact live node attribution is only partial until node-id metadata is sent consistently;
- upstream comparison review is not yet done;
- repository separation from visible Celerity identity is not complete;
- dashboard traffic graph still uses derived points, not true historical samples.

## Known Broken / Risky / Pending

- some panel behavior still needs manual UX verification on live pages after redesign;
- dashboard graph interaction is working, but it still needs fuller history-backed analytics in all views;
- HAPP behavior should keep being tested on real clients after UI changes;
- user live-node visibility currently depends on optional device metadata headers and is not guaranteed for every session;
- old historical docs exist, but the new continuity set is now the primary path.

## Stop Point

The continuity layer is now in place.

The repo has a local source of truth and a clean session-entry order.

No automatic next wave is opened by this handoff.

## Next Step

Next practical step:

1. implement real user operational statistics in panel views and/or data routes;
2. audit upstream project changes and identify safe ports;
3. begin controlled repository separation from Celerity naming and fork identity.
