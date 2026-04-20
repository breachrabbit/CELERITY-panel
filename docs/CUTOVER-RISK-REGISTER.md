# Cutover Risk Register

Track: `BR Labs.hrlab`  
Model: `Migration Cutover` (not rename)  
Last updated: `2026-04-20`

## Risk Register

| Risk | Impact | Likelihood | Mitigation | Rollback | Status |
|---|---|---|---|---|---|
| Legacy repo/source leakage during runtime install (agent/setup artifacts still refer to old identity) | Wrong binaries/channels, unstable onboarding, compliance/identity drift | Medium | Enforce source whitelist in runtime scripts and config; cutover audit on all installer/download paths before switch | Revert source-switch commit and restore last known-good release base, redeploy | Open |
| Production continuity break during cutover (subscriptions/nodes/cascades) | User-facing outages, node downtime, broken links | High | Freeze cleanup/refactor; execute staged cutover only after audit + smoke checklist | Roll back to previous deploy image and restore prior config snapshot | Open |
| Deploy path mismatch (Coolify hooks/workflows/secrets still wired to legacy naming) | Failed deploys, non-deterministic release behavior | Medium | Audit workflows/secrets/deploy hooks first; verify one explicit dry-run/deploy validation | Switch deploy trigger to previous stable pipeline and pin last healthy image | Open |
| Identity residue in UI/docs/package metadata remains after cutover | Operator confusion, mixed branding and wrong runbooks | High | Identity residue sweep with explicit allow-list (what stays temporarily) and quarantine list | Reapply previous docs/metadata baseline if cutover blockers found | Open |
| Legacy cleanup executed before cutover parity proof | Breaks working production utility path | Medium | Enforce active order in `START-HERE`/handoff and session rules; block cleanup tasks until cutover signed | Abort cleanup wave and restore previous stable branch/deploy | Open |
| Node delete remote cleanup removes too much or too little | Either remote leftovers or accidental service damage on node | Medium | Add guarded cleanup steps + post-check diagnostics + dry-run mode where possible | Re-run node re-onboarding from known-good template and restore services | Monitoring |
| Hysteria sidecar edge instability under forced hybrid defaults | TLS/runtime fail despite “completed” setup status | Medium | Keep step-level diagnostics and patch only failing step with live logs; add targeted smoke matrix | Disable affected node path to standalone and restore previous stable setup mode | Open |

## Notes

- This register is mandatory before and during cutover.
- Update each row with concrete evidence during audit and migration execution.
- `Status` vocabulary suggested: `Open`, `Monitoring`, `Mitigated`, `Accepted`, `Closed`.

