# Project Baseline

## What This Repository Is

This repository is an operational fork of the Celerity panel codebase, maintained as a separate project for Hidden Rabbit panel and node operations.

It exists to support a real working VPN/panel setup, not to serve as part of a shared product platform.

Current track identity:

- `BR Labs.hrlab` (internal incubation/proving-ground/controlled production utility).
- This is not the Hidden Rabbit product repository itself.
- Current migration state is a **Cutover Event** (not simple rename/cleanup).

## Why It Exists

The fork is used to:

- keep panel installation and node onboarding stable;
- support subscription and HAPP behavior needed by real users;
- test practical improvements before any future in-house replacement exists;
- maintain a controllable admin surface for ongoing operations.

## Who It Is For

Primary users:

- project operator / maintainer;
- limited set of real users connected to this infrastructure;
- internal testing of operational fixes and UX decisions for this fork only.

## Real Boundaries

This project is:

- a standalone operational fork;
- a place for practical stability and UX work;
- a local test bed for features directly tied to this panel.

This project is not:

- the governing center (`rabbit-platform`);
- the canonical active platform order (`S4-Core`);
- the final Hidden Rabbit product truth;
- a bridge into main product memory.

## Current Operating Shape

Current stack and shape:

- backend: `Node.js + Express`;
- templates: `EJS`;
- frontend: server-rendered HTML with local CSS/JS;
- deploy target in current practice: Coolify with `docker-compose.coolify.yml`;
- public working stand currently used: `tunnel.hiddenrabbit.net.ru`.

## What Counts As Acceptable Work

Acceptable work inside this fork:

- install and deploy fixes;
- node setup and subscription fixes;
- HAPP-specific improvements;
- admin panel redesign and UX cleanup;
- reliability, observability, and operator tooling;
- selective upstream sync when it helps stability;
- local divergence where upstream does not fit operational needs.

## What We Do Not Touch Without A Separate Decision

Not in scope by default:

- large architecture rewrite;
- migration of this fork into Next.js as a platform initiative;
- turning this repository into a shared base for other products;
- mixing it with Rabbit Platform governance or memory;
- large unrelated feature programs.

## Local Source Of Truth

The active continuity layer for this fork is:

1. `docs/PROJECT-BASELINE.md`
2. `docs/ROADMAP.md`
3. `docs/SESSION-HANDOFF.md`
4. `docs/KNOWN-ISSUES.md`
5. `docs/DEVELOPMENT-LOG.md`
6. `docs/SESSION-LEDGER.md`

Older docs in `docs/` remain useful as historical references, but the files above are the primary continuity set.
