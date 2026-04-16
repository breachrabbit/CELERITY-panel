# Deployment Notes

## Current Practical Deployment Mode

Current active practice for this fork:

- deploy from `main`;
- run inside Coolify;
- use `docker-compose.coolify.yml`;
- public panel stand currently used: `https://tunnel.hiddenrabbit.net.ru/panel`.

## Important Runtime Notes

- Coolify is expected to own public `80/443`;
- this app should stay behind Coolify / Traefik routing;
- backend runs on internal `3000`;
- health endpoint is used for readiness checks.

## Before Updating

- confirm the repo state is committed;
- confirm continuity docs are updated if the session is ending;
- review settings that affect subscription, HAPP, and deploy behavior;
- avoid mixing unrelated experimental changes into the same deploy.

## Deployment Checklist

1. push changes to `main`;
2. trigger Coolify deployment for the panel application;
3. confirm deployment finished successfully;
4. check panel login page;
5. verify main dashboard loads;
6. verify health / runtime status;
7. spot-check critical flows:
   - nodes page;
   - users page;
   - settings;
   - subscription / HAPP behavior if touched.

## Critical Config Areas

- `PANEL_DOMAIN`
- Mongo credentials
- Redis credentials
- session secret
- encryption key
- HAPP provider and subscription settings
- any node-setup related feature flags

## Do Not Forget

- this fork is isolated and should not borrow governance from external systems;
- docs updates are part of deployment hygiene when a session closes;
- if a deploy changes UX or subscription behavior, verify it on the live stand, not only in code.
