# What & why

<!-- What does this PR change, and what problem does it solve?
     Link the issue it fixes: Fixes #123 -->

## How

<!-- Anything a reviewer needs to know about the approach. -->

## Checklist

- [ ] `pnpm build` · `pnpm test` · `pnpm lint` · `pnpm format` all green
- [ ] Tests cover the change (new behavior = new tests)
- [ ] If this touches the bridge protocol, manifest, package format, or
      registry protocol: the spec in `specs/` was updated **first**, and the
      conformance suite (`conformance/`) still passes
- [ ] Nothing in `packages/runtime`, `specs/`, or `conformance/` references a
      specific host framework (RN, Flutter, ...)
- [ ] No breaking change — or it's called out below and labeled `breaking-change`

## Breaking changes

<!-- Delete this section if none. -->
