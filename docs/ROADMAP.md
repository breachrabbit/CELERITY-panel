# Roadmap

## Current Active Order

1. Migration Cutover Audit
2. Migration Cutover
3. Legacy Cleanup
4. Unresolved engineering work

Do not change order.

## Current First Priority

Run Migration Cutover Audit only:

- Remote/Repo Audit;
- Identity Residue Sweep;
- Runtime Dependency Audit;
- Production Continuity Audit;
- Rollback Plan.

## Near Term

- run a focused upstream delta audit for `CELERITY-panel v1.0.0...v1.1.0`:
  - source: `https://github.com/ClickDevTech/CELERITY-panel/compare/v1.0.0...v1.1.0`;
  - classify each upstream change as:
    - safe-and-useful-to-port now,
    - useful-but-needs-adaptation,
    - skip for this fork;
  - port only high-signal stability/security fixes with regression checks;
- stabilize the experimental `Cascade Builder` route:
  - verify the separate page on the live stand;
  - keep the topology read-source and draft write-source boundaries explicit;
  - decide whether to add `commit draft -> legacy link` before deeper UX work;
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
- replace the current node auto-setup with a stricter Hidden Rabbit onboarding pipeline:
  - persistent onboarding jobs instead of in-memory setup state;
  - pinned installer channel instead of external `latest`;
  - local runtime verification plus panel-to-agent handshake before a node is marked ready;
  - resume/repair semantics instead of “run setup again”.

## Mid Term

- review upstream changes and decide which fixes or improvements should be ported;
- turn the current network-map/cascade layer into an experimental visual cascade builder track:
  - separate flow-centric builder direction from the current link-centric UI;
  - validate drag-to-connect, inspector, draft-state, and deploy-preview UX in this fork first;
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
