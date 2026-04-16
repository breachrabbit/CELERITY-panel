# Isolated Project Rule

## Status

This repository is an isolated fork used for practical support of a VPN/panel system for a limited circle of users.

It is maintained as its own working project and must stay independent.

## Hard Isolation Rule

This project:

- is not part of Rabbit Platform;
- is not part of BR Labs Factory;
- is not part of S4-Core;
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
- using Factory, Vault, S4-Core, or platform sequencing as the operating model;
- opening unrelated feature waves;
- rewriting the architecture "for beauty";
- treating this repository as shared infrastructure for the wider ecosystem.

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
