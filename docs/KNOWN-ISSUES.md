# Known Issues

## Active Product / UX Issues

### 1. User-level operational stats are only partially complete

Done now:

- per-user traffic progress in admin UX;
- connected-device visibility from Redis activity;
- effective node coverage per user.

Still missing or incomplete:

- exact live node attribution for every session;
- reliable cascade-hop visibility per user session when topology grows;
- protocol-specific attribution for Xray paths equal to Hysteria device tracking.

Status: `pending`

### 2. Dashboard traffic graph is not yet fed by true historical series

Current chart is interactive and visually improved, but points are still derived from current aggregate traffic values rather than stored timeline samples.

Status: `pending`

### 3. HAPP flow still needs ongoing real-device verification

Recent fixes improved labels, support messaging, and import behavior, but HAPP remains a client-specific integration and should continue to be tested on live devices after changes.

Status: `pending`

### 4. Branding separation is incomplete

There are still visible references to `Celerity` in repo text, UI labels, comments, and deployment metadata.

Status: `pending`

### 5. Upstream divergence is mapped, but not yet triaged for adoption

The fork already has meaningful local divergence. A fresh comparison against `upstream/main` now exists, but safe ports still need triage.

Main upstream areas worth evaluating:

- onboarding and first-run bootstrap;
- broadcast execution tooling for nodes;
- Marzban migration/import flow;
- client statistics experiments.

Status: `pending`

## What Has Already Been Tried

- live deployment and iterative UI fixes through Coolify;
- HAPP-specific settings cleanup and banner behavior adjustments;
- layout stabilization after navigation / resize-related visual drift;
- dashboard redesign with flatter styling and less heavy gradients.

## What Is Stable Enough For Now

- deployment from `main` to the current Coolify stand;
- redesigned panel foundation;
- current docs-based continuity layer.
