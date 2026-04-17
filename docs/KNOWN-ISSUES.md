# Known Issues

## Active Product / UX Issues

### 0. Cascade Builder is experimental and still transitional

Current state:

- there is now a separate experimental builder page and API;
- builder reads live topology from `cascadeService.getTopology()`;
- builder drafts/layout are stored separately in Redis as operator-scoped draft state;
- accepted drag-connect drafts survive refresh for the same operator;
- builder can now commit drafts into legacy cascade links, but only through a batch transitional bridge.
- builder now also has a pure deploy-preview / commit-plan layer over the current draft state.

Still missing:

- shared/persistent flow storage;
- per-hop settings before commit;
- executable synthetic chain preview against in-memory links;
- richer per-hop commit/configuration UI;
- local bundled graph assets instead of CDN dependency;
- true flow-native role storage independent of legacy node `cascadeRole`.

Status: `pending`

### 1. Shell layout still drifts / shifts after navigation

User reports that parts of the panel still move outside the browser width until the window is nudged or layout is recalculated.

Current state:

- multiple earlier stabilization attempts were already deployed;
- the shell rewrite (`grid + sticky sidebar` plus overflow containment) is now committed and deployed;
- bug still needs live verification because the user previously reported the drift across multiple views.

Status: `broken`

### 1a. Left sidebar does not always stretch to full height

User reported on the settings screen that the left sidebar/footer block can stop early instead of visually reaching the bottom of the page content.

Current state:

- shell was already moved toward `grid + sticky sidebar`;
- footer controls were moved around during the redesign;
- this still needs a proper height/flow fix instead of more local spacing tweaks.

Status: `broken`

### 2. User-level operational stats are only partially complete

Done now:

- per-user traffic progress in admin UX;
- connected-device visibility from Redis activity;
- effective node coverage per user.

Still missing or incomplete:

- exact live node attribution for every session;
- reliable cascade-hop visibility per user session when topology grows;
- protocol-specific attribution for Xray paths equal to Hysteria device tracking.

Status: `pending`

### 8. Some shell drift still reproduces on the live stand

Latest attempt:

- commit `aad44b4` added stronger shell containment and replaced remaining hardcoded top-level dashboard/local shell strings with locale keys.

Still needs confirmation:

- whether right-edge drift is fully fixed on the deployed stand, or only reduced;
- which exact page transition still reproduces it if the issue remains.

Status: `pending`

### 3. Dashboard traffic graph still needs UX correction

Current chart is interactive and visually improved, but the user still reports:

- too many visible points in earlier iterations;
- awkward visual density;
- need for better labels and calmer presentation.

Latest progress:

- compact period switchers are now present;
- point density is reduced adaptively based on dataset length;
- time-axis labels are more human-readable.

Status: `pending`

### 4. HAPP flow still needs ongoing real-device verification

Recent fixes improved labels, support messaging, and import behavior, but HAPP remains a client-specific integration and should continue to be tested on live devices after changes.

Status: `pending`

### 5. Branding separation is incomplete

There are still visible references to `Celerity` in repo text, UI labels, comments, and deployment metadata.

Status: `pending`

### 6. Upstream divergence is mapped, but not yet triaged for adoption

The fork already has meaningful local divergence. A fresh comparison against `upstream/main` now exists, but safe ports still need triage.

Main upstream areas worth evaluating:

- onboarding and first-run bootstrap;
- broadcast execution tooling for nodes;
- Marzban migration/import flow;
- client statistics experiments.

Status: `pending`

### 11. Node auto-setup / agent onboarding is still architecturally fragile

Audit result:

- current setup state lives only in process memory;
- Xray install, agent install, and post-setup sync are still separate phases that trust each other too early;
- one of the current success paths still tolerates weak agent verification (`strictAgent: false`);
- first-run health can depend on retrying setup instead of resuming from a durable step state;
- agent delivery still depends on external release/latest resolution.

Practical effect:

- a fresh node can appear “almost installed” but still need a second setup pass;
- process restarts can erase the current install state;
- panel/operator UX still hides too much of the real onboarding contract.

Decision:

- do not keep patching this forever as a legacy flow;
- move toward a dedicated Hidden Rabbit onboarding pipeline with:
  - durable job state;
  - explicit steps;
  - real runtime verification;
  - real panel-to-agent handshake;
  - resume/repair behavior.

Reference:

- `docs/node-onboarding-rewrite-blueprint.ru.md`

Latest progress:

- durable onboarding scaffold is now in code:
  - `NodeOnboardingJob` Mongo model;
  - onboarding state-machine/service/runner scaffold;
  - isolated onboarding API endpoints under `/api/nodes/:id/onboarding/*`.
- staged bridge integration started:
  - panel/API setup starts now initialize onboarding jobs;
  - setup success/failure is mirrored to durable onboarding status.
- first real handlers started:
  - executable `preflight` and `prepare-host` onboarding steps exist;
  - API trigger exists to run these early steps.
- runtime handlers started:
  - executable `install-runtime` and `verify-runtime-local` exist;
  - API trigger exists to run pipeline until agent-install boundary.
- this new layer is intentionally still separate from legacy setup flow.

Still missing:

- integration of durable onboarding jobs into panel setup UI/status polling;
- agent executable handlers (`install-agent`, local/panel verify steps);
- staged cutover from in-memory `setupJobs` to durable job status.

Status: `pending`

### 7. Several visual follow-ups are captured but not yet implemented

Open user requests include:

- make language control visually match the theme switcher;
- remove light/dark/system labels and keep icons only;
- move sidebar collapse control near logout in the footer block;
- ensure Settings has a visible icon in all states;
- replace the background texture with a neutral paper-like noise;
- use segmented ring styling matching the provided reference;
- recolor subscription QR presentation toward project blue.
- replace remaining green accent states with the project Java color family;
- ensure dark-theme dashboard rings are not rendered as black.

Latest progress:

- language control was moved to the topbar near theme controls;
- sidebar collapse control is now more explicit;
- background was neutralized;
- QR presentation was recolored toward the project palette.

Status: `pending`

### 9. Users list actions are incomplete

User wants the users list to provide a more operator-friendly set of actions:

- open subscription page directly;
- copy subscription;
- edit user profile;
- open details/profile page.

Also:

- wording like "Unlimited traffic" / "Без лимита трафика" should be replaced with `∞` where this is shown as a compact metric.

Current state:

- edit exists on user detail page;
- list view still needs final action layout cleanup and verification;
- there are uncommitted local edits in `views/users.ejs` related to this.

Status: `pending`

### 10. HAPP color profile defaults are not yet aligned to panel theming

User requested:

- default HAPP color profile matching the dark panel theme;
- investigation whether iOS/macOS HAPP can support both light and dark themes in a system-driven way.

Current state:

- HAPP color profile setting was restored in settings;
- theming behavior across iOS/macOS still needs practical implementation review.

Status: `pending`

## What Has Already Been Tried

- live deployment and iterative UI fixes through Coolify;
- HAPP-specific settings cleanup and banner behavior adjustments;
- layout stabilization after navigation / resize-related visual drift;
- dashboard redesign with flatter styling and less heavy gradients.
- shell rewrite attempt toward `grid + sticky sidebar` started locally but paused before deployment.
- several later UI requests were collected and partially started locally without final deployment:
  - users list action expansion;
  - footer sidebar toggle placement;
  - topbar language/theme visual unification;
  - paper-noise background direction.

## What Is Stable Enough For Now

- deployment from `main` to the current Coolify stand;
- redesigned panel foundation;
- current docs-based continuity layer.
