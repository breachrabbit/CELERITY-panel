# Isolated Project Rule

## Canonical Context

- `rabbit-platform` is the canonical governing center (external to this repo).
- `S4-Core` is the canonical active platform order (external to this repo).
- `BR Labs.hrlab` is this repository track: incubation/proving-ground/controlled production utility.
- `Hidden Rabbit` remains the target product and is not automatically updated from this track.

## Status

This repository is an isolated fork used for practical support of a VPN/panel system for a limited circle of users.

It is maintained as its own working project and must stay independent.

## Hard Isolation Rule

This project:

- is not the governing center (`rabbit-platform`);
- is not the canonical order (`S4-Core`);
- is not Hidden Rabbit product truth;
- does not participate in platform sequencing;
- does not use any bridge model with the main system;
- does not inherit Rabbit Platform rules as a governing model.

All changes in this repository apply only to this fork.

## Local Source Of Truth

The source of truth for this fork lives inside this repository:

1. `docs/PROJECT-BASELINE.md`
2. `docs/ROADMAP.md`
3. `docs/SESSION-HANDOFF.md`
4. `docs/KNOWN-ISSUES.md`
5. `docs/DEVELOPMENT-LOG.md`
6. `docs/SESSION-LEDGER.md`
7. current code in this repository

Upstream repositories, external chats, and other project systems are reference material only.

## Scope Rule

Allowed:

- stability work;
- deploy and install fixes;
- UX and admin panel improvements;
- HAPP and subscription improvements;
- compatibility fixes;
- controlled local feature work needed for operations.

Not allowed without an explicit decision:

- mixing this fork with Rabbit Platform or any shared product memory;
- turning this fork into a platform component;
- using Factory/Vault/platform sequencing as the operating model of this repo;
- opening unrelated feature waves;
- rewriting the architecture "for beauty";
- treating this repository as shared infrastructure for the wider ecosystem.

## Critical Rule

BR Labs.hrlab uses **Cutover model**.

Not Rename model.

Any work must assume:

- repo identity already exists;
- active task is controlled migration cutover.

## Active Order (Mandatory)

1. Migration Cutover Audit
2. Migration Cutover
3. Legacy Cleanup
4. Unresolved engineering work

Order cannot be changed.

## Permanent Operating Laws

### LAW 1

BR Labs.hrlab is a separate evolving system.

### LAW 2

Cutover before cleanup. Always.

### LAW 3

Production continuity has priority over refactor purity. Always.

### LAW 4

Nothing transfers automatically to Hidden Rabbit. Ever.

### LAW 5

Fork-specific hacks default to quarantine until proven otherwise.

### LAW 6

Every session must end with handoff. No exceptions.

## Continuity Law

Every new session must begin with this reading order:

1. `docs/PROJECT-BASELINE.md`
2. `docs/ROADMAP.md`
3. `docs/SESSION-HANDOFF.md`
4. `docs/KNOWN-ISSUES.md`
5. `docs/DEVELOPMENT-LOG.md`
6. `docs/SESSION-LEDGER.md`

Only after that:

- code inspection;
- fixes;
- implementation;
- deployment work.

## Session Close Law

Before ending a session, it is mandatory to:

- update `docs/SESSION-HANDOFF.md`;
- append the main changes to `docs/DEVELOPMENT-LOG.md`;
- add a short entry to `docs/SESSION-LEDGER.md`;
- record the next step;
- mark current state as `stable`, `broken`, or `pending`.

If this is skipped, the session is considered closed poorly.

## Practical Principle

This fork must stay useful, isolated, and maintainable.

It should remain simple, operational, and easy to continue between sessions.
