# Roadmap

## Near Term

- finish current admin UI redesign in a flatter, cleaner visual language;
- improve dashboard analytics and make traffic graphs reflect real data history;
- add user-level operational stats:
  - extend current traffic/device view into exact node attribution;
  - add better cascade visibility where technically possible;
- complete HAPP polish:
  - clean texts;
  - reliable import flow;
  - clear settings behavior;
- continue fixing install and node-add flows so the panel works out of the box.

## Mid Term

- review upstream changes and decide which fixes or improvements should be ported;
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
