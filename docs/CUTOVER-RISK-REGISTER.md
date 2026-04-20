# Cutover Risk Register

Track: `BR Labs.hrlab`  
Model: `Migration Cutover` (not rename)  
Last updated: `2026-04-20` (external audit closure pass)

## Risk Register

| Risk | Impact | Likelihood | Mitigation | Rollback | Status |
|---|---|---|---|---|---|
| Coolify deployment source is still bound to `breachrabbit/CELERITY-panel.git` | Cutover cannot be considered effective; runtime may continue consuming old source path | High | Execute Batch 2 source rebind only after target repo is populated and smoke-gated | Rebind Coolify source back to previous repo and redeploy last healthy commit | Open (Blocker) |
| Target identity repo `breachrabbit/brlabs.hrlab` is empty | No executable cutover target; migration stalls mid-phase | High | Execute Batch 1: populate repo baseline + validate branch/default settings before any source switch | Keep origin/deploy on current repo until target is deployment-ready | Open (Blocker) |
| Runtime agent release channel points to repo releases while both repos currently have `releases=0` | Agent install/update path may become non-deterministic during cutover | High | Decide and approve release strategy: panel-bundle-first or publish releases before switch | Revert `CC_AGENT_RELEASE_BASE` to last known-good value and redeploy | Open (Blocker) |
| Legacy repo/source leakage during runtime install (agent/setup artifacts still refer to old identity) | Wrong binaries/channels, unstable onboarding, compliance/identity drift | High | Keep source whitelist guard; migrate quick-install/runtime URLs in controlled batch with post-smokes | Revert source-switch commit and restore last known-good release base, redeploy | Open |
| Production continuity break during cutover (subscriptions/nodes/cascades) | User-facing outages, node downtime, broken links | High | Freeze cleanup/refactor; execute staged cutover only after audit + smoke checklist | Roll back to previous deploy image and restore prior config snapshot | Open |
| Deploy path mismatch (workflows/image namespace/manual hooks still legacy-oriented) | Failed deploys, non-deterministic release behavior | High | Migrate workflow/image paths in micro-batches with deploy validation and rollback gates | Switch deploy trigger to previous stable pipeline and pin last healthy image | Open |
| Identity residue in UI/docs/package metadata remains after cutover | Operator confusion, mixed branding and wrong runbooks | Medium | Identity residue sweep with explicit allow-list (what stays temporarily) and quarantine list | Reapply previous docs/metadata baseline if cutover blockers found | Open |
| Legacy cleanup executed before cutover parity proof | Breaks working production utility path | High | Enforce active order in `START-HERE`/handoff and session rules; block cleanup tasks until cutover signed | Abort cleanup wave and restore previous stable branch/deploy | Mitigated (Process Guard) |
| Node delete remote cleanup removes too much or too little | Either remote leftovers or accidental service damage on node | Medium | Add guarded cleanup steps + post-check diagnostics + dry-run mode where possible | Re-run node re-onboarding from known-good template and restore services | Monitoring |
| Hysteria sidecar edge instability under forced hybrid defaults | TLS/runtime fail despite “completed” setup status | Medium | Keep step-level diagnostics and patch only failing step with live logs; add targeted smoke matrix | Disable affected node path to standalone and restore previous stable setup mode | Open |

## Notes

- This register is mandatory before and during cutover.
- Update each row with concrete evidence during audit and migration execution.
- `Status` vocabulary suggested: `Open`, `Monitoring`, `Mitigated`, `Accepted`, `Closed`.
