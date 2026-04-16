# Known Issues

## Active Product / UX Issues

### 1. User-level operational stats are incomplete

Missing or incomplete:

- per-user traffic visibility in admin UX;
- connected devices per user profile in an operator-friendly view;
- node / cascade visibility for user sessions when topology grows.

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

### 5. Upstream divergence has not been fully audited

The fork already has meaningful local divergence, but upstream changes have not yet been systematically reviewed for safe adoption.

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
