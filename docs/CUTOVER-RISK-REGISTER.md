# Cutover Risk Register

Track: `BR Labs.hrlab`  
Model: `Migration Cutover` (not rename)  
Last updated: `2026-04-20` (Phase 2A / Batch 1B-AUTH gate check)

## Risk Register

| Risk | Impact | Likelihood | Mitigation | Rollback | Status |
|---|---|---|---|---|---|
| Coolify deployment source is still bound to `breachrabbit/CELERITY-panel.git` | Cutover is not yet effective; production still consumes old source path | High | Batch 1B switch was attempted; fix Coolify access path to private target repo and re-run Batch 1B with same rollback gates | Rebind Coolify source back to previous repo and redeploy last healthy commit | Open (Batch 1B blocked, rollback applied) |
| Target identity repo `breachrabbit/brlabs.hrlab` was empty at audit start | Could block cutover execution entirely | High | Phase 2A Batch 0 executed: pushed `main` + tags, validated branch/tag/workflow/settings | Keep origin/deploy on current repo until target is deployment-ready | Closed (Batch 0 done) |
| Runtime agent release channel still points to `breachrabbit/CELERITY-panel/releases` while source repo releases are `0` | Agent install/update path may become non-deterministic after source cutover | High | Approve explicit release-channel strategy before Batch 2 runtime switch (target has `v1.1.0` release assets) | Revert `CC_AGENT_RELEASE_BASE` to last known-good value and redeploy | Open (Blocker) |
| Coolify cannot fetch private target repo `breachrabbit/brlabs.hrlab` after source switch (`git ls-remote` auth failure) | Batch 1B fails immediately; cutover cannot proceed to smoke phase | High | Configure/repair Coolify GitHub access for target private repo (app install/token/repo grant), then re-run Batch 1B | Keep source on `breachrabbit/CELERITY-panel.git`, redeploy and verify healthy | Open (Hard blocker, AUTH gate not cleared) |
| Legacy repo/source leakage during runtime install (agent/setup artifacts still refer to old identity) | Wrong binaries/channels, unstable onboarding, compliance/identity drift | High | Keep source whitelist guard; migrate quick-install/runtime URLs in controlled batch with post-smokes | Revert source-switch commit and restore last known-good release base, redeploy | Open |
| Production continuity break during cutover (subscriptions/nodes/cascades) | User-facing outages, node downtime, broken links | High | Freeze cleanup/refactor; execute staged cutover only after audit + smoke checklist | Roll back to previous deploy image and restore prior config snapshot | Open |
| Deploy path mismatch (workflows/image namespace/manual hooks still legacy-oriented) | Failed deploys, non-deterministic release behavior | High | Migrate workflow/image paths in micro-batches with deploy validation and rollback gates | Switch deploy trigger to previous stable pipeline and pin last healthy image | Open |
| Target repo workflows currently fail on push/tag (`Docker Hub` runs failed) | Can create false confidence during cutover and break release confidence checks | Medium | Batch 1A classified this as missing Docker Hub secrets (`Username and password required`) + workflow assumption; keep as separate CI/release fix batch | Keep deployment verification bound to live stand smokes; if needed disable/guard Docker Hub workflow until secrets/config are aligned | Accepted (Non-blocking root cause for CI path) |
| Identity residue in UI/docs/package metadata remains after cutover | Operator confusion, mixed branding and wrong runbooks | Medium | Identity residue sweep with explicit allow-list (what stays temporarily) and quarantine list | Reapply previous docs/metadata baseline if cutover blockers found | Open |
| Legacy cleanup executed before cutover parity proof | Breaks working production utility path | High | Enforce active order in `START-HERE`/handoff and session rules; block cleanup tasks until cutover signed | Abort cleanup wave and restore previous stable branch/deploy | Mitigated (Process Guard) |
| Node delete remote cleanup removes too much or too little | Either remote leftovers or accidental service damage on node | Medium | Add guarded cleanup steps + post-check diagnostics + dry-run mode where possible | Re-run node re-onboarding from known-good template and restore services | Monitoring |
| Hysteria sidecar edge instability under forced hybrid defaults | TLS/runtime fail despite “completed” setup status | Medium | Keep step-level diagnostics and patch only failing step with live logs; add targeted smoke matrix | Disable affected node path to standalone and restore previous stable setup mode | Open |
| GitHub App installation scope for Coolify cannot be fully introspected with current operator token | False-positive readiness risk for private-repo cutover attempts | Medium | Validate provider auth/scope directly in Coolify GitHub integration (or use app-authorized token) before any new source switch | Keep Batch 1B blocked and source pinned to current healthy repo | Open (Auth observability gap) |

## Notes

- This register is mandatory before and during cutover.
- Update each row with concrete evidence during audit and migration execution.
- `Status` vocabulary suggested: `Open`, `Monitoring`, `Mitigated`, `Accepted`, `Closed`.
