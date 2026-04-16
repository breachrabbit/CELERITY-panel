# Known Issues

## Active Product / UX Issues

### 1. Shell layout still drifts / shifts after navigation

User reports that parts of the panel still move outside the browser width until the window is nudged or layout is recalculated.

Current state:

- multiple earlier stabilization attempts were already deployed;
- one additional shell rewrite attempt exists locally in `public/css/style.css`;
- that patch is paused, uncommitted, and undeployed.

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

### 3. Dashboard traffic graph still needs UX correction

Current chart is interactive and visually improved, but the user still reports:

- too many visible points;
- awkward visual density;
- need for a compact period switcher;
- need for better labels and calmer presentation.

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

### 7. Several visual follow-ups are captured but not yet implemented

Open user requests include:

- move language control near the theme switcher on the right;
- make sidebar collapse affordance clearer;
- ensure Settings has a visible icon in all states;
- make background texture more neutral;
- use segmented ring styling matching the provided reference;
- recolor subscription QR presentation toward project blue.

Status: `pending`

## What Has Already Been Tried

- live deployment and iterative UI fixes through Coolify;
- HAPP-specific settings cleanup and banner behavior adjustments;
- layout stabilization after navigation / resize-related visual drift;
- dashboard redesign with flatter styling and less heavy gradients.
- shell rewrite attempt toward `grid + sticky sidebar` started locally but paused before deployment.

## What Is Stable Enough For Now

- deployment from `main` to the current Coolify stand;
- redesigned panel foundation;
- current docs-based continuity layer.
