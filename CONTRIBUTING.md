# Contributing to OpenMini

Thanks for helping build the open mini-app runtime. This guide is short;
the [PR template](.github/PULL_REQUEST_TEMPLATE.md) and CI enforce most of
it mechanically.

## The invariants (read first)

These are the rules that make OpenMini what it is — PRs that break them
won't merge:

- **Specs are the source of truth.** Any change to the bridge protocol,
  manifest, package format, or registry protocol updates the spec in
  [`specs/`](specs/) **before** the code, and the conformance suite
  ([`conformance/`](conformance/)) must still pass.
- **The v0.1 bridge surface is frozen** (6 built-in APIs + 3 host events +
  the `host.*` passthrough). New built-ins are spec changes first — open an
  issue before writing code.
- **Host-framework independence.** Nothing in `packages/runtime`, `specs/`,
  or `conformance/` may reference React Native, Flutter, or any host.
  React Native is just the first host adapter.
- **Hexagonal architecture is law** — dependencies point inward, side
  effects behind ports, one composition root per package. See
  [`specs/architecture.md`](specs/architecture.md).

## Dev setup

Node 22 and [pnpm](https://pnpm.io). Then:

```bash
pnpm install
pnpm build    # tsc across all packages
pnpm test     # vitest, repo-wide (includes the conformance suite)
pnpm lint     # eslint
pnpm format   # prettier --write
```

## Workflow

1. Open or pick an issue (use the issue forms). Roadmap items in
   [`ROADMAP.md`](ROADMAP.md) are pull-gated — describing your real-world
   need is exactly the pull that un-gates them.
2. Fork/branch — `main` is protected; all changes land via pull request
   with green CI (`verify` runs build, tests, lint, and format check).
3. Tests come with the change: new behavior means new tests, bug fixes
   start with a failing regression test.
4. Use [Conventional Commits](https://www.conventionalcommits.org):
   `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci` —
   e.g. `fix(cli): tolerate whitespace inside scaffold placeholders`.
5. Fill in the PR template checklist; link the issue (`Fixes #123`).

Keep PRs to one logical change. Small and reviewable beats big and clever.

## Reporting

- **Bugs / feature requests** — the
  [issue forms](https://github.com/BoumouzounaBrahimVall/openmini/issues/new/choose).
- **Security issues** — never in a public issue; see [SECURITY.md](SECURITY.md)
  for private vulnerability reporting.

## Code of conduct

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).
