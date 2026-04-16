# Roadmap

## Near Term

- resolve the persistent shell/layout drift bug across dashboard, stats, login, and page navigation;
- make the left sidebar reliably stretch to full height on long pages;
- finish current admin UI redesign in a flatter, cleaner visual language;
- replace the current background square/grid texture with a more neutral paper-like noise;
- unify topbar controls:
  - language switcher should match the theme switcher visually;
  - theme switcher should use icon-only controls;
- move sidebar collapse control into the footer action group near logout;
- normalize the left navigation icon set and verify no icon is missing;
- replace remaining green system accents with the project `Java` accent family;
- ensure dark-theme dashboard rings follow project colors and never render as black;
- improve dashboard analytics and make traffic graphs reflect real data history;
- refine dashboard card UX:
  - add compact period switcher (`24ч / 7д / 30д`);
  - reduce point density;
  - improve human-readable time labels;
- finish users-list operator UX:
  - open subscription page directly from the list;
  - provide edit action directly from the list;
  - keep copy/details actions coherent;
  - use `∞` for unlimited traffic where appropriate;
- add user-level operational stats:
  - extend current traffic/device view into exact node attribution;
  - add better cascade visibility where technically possible;
- continue stronger visual and textual movement away from visible `Celerity` branding;
- complete HAPP polish:
  - clean texts;
  - reliable import flow;
  - clear settings behavior;
  - align default color profile with panel themes where supported on iOS/macOS;
- continue fixing install and node-add flows so the panel works out of the box.

## Mid Term

- review upstream changes and decide which fixes or improvements should be ported;
- turn the current network-map/cascade layer into an experimental visual cascade builder track:
  - separate flow-centric builder direction from the current link-centric UI;
  - validate drag-to-connect, inspector, and deploy-preview UX in this fork first;
  - later reuse only the mature topology/domain ideas in Hidden Rabbit;
- evaluate specific upstream features now visible in audit:
  - onboarding flow;
  - broadcast tools;
  - Marzban migration;
  - client stats experiments;
- separate local branding and language from legacy Celerity naming where safe and license-compliant;
- tighten deployment notes and repeatable update flow;
- improve observability around panel state, node health, and subscription behavior;
- reduce hidden operational knowledge by moving it into repo docs.

## Later / Optional

- deeper user analytics by node and by cascade path;
- more complete rebrand of user-facing surfaces;
- more advanced reporting or operator dashboards;
- payment integration for voluntary support after the current UX layer is stable.

## Not A Priority Right Now

- platformization of this fork;
- integration with Rabbit Platform or shared memory systems;
- broad architecture rewrite for its own sake;
- opening large new feature programs unrelated to operational use.
