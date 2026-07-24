# ADR-008: Foundation quality gate

- Status: accepted
- Date: 2026-07-24
- Owners: TutorBoard maintainers

## Context

The Technical Spike will introduce coordinate transforms, stored documents and
external contracts. A permissive bootstrap would allow unsafe boundaries to
become established before those high-risk surfaces exist.

## Decision

The repository pins Node and npm dependencies through `.nvmrc`,
`package.json` and `package-lock.json`. Pull requests run formatting, ESLint,
strict TypeScript, Vitest, architecture enforcement, a production build and a
Playwright Chromium smoke.

The architecture gate uses the TypeScript parser rather than text-only regular
expressions, and it inspects static imports, re-exports, dynamic imports and
CommonJS `require` calls.

## Alternatives considered

### Lint and build only

- Advantages: faster CI.
- Disadvantages: compiles invalid dependency directions and cannot prove the
  browser entry point starts.
- Rejection reason: it does not enforce the accepted architecture contract.

### Full end-to-end matrix from the first pull request

- Advantages: broad browser coverage.
- Disadvantages: high runtime without corresponding product behavior.
- Rejection reason: one Chromium smoke is sufficient until canvas behavior is
  introduced.

## Consequences

### Positive

- local and CI commands use the same locked toolchain;
- future invariant owners have a place to add targeted enforcement.

### Negative and risks

- the custom import gate must evolve when path aliases or new source extensions
  are introduced;
- GitHub Actions major versions remain an external operational dependency.

## Verification

`npm run check` covers the non-browser gate. `npm run e2e` validates the
production preview after `npm run build`. CI executes both paths.

## Revisit or rollback conditions

Replace the custom gate if a maintained tool provides equivalent invariant
coverage with lower ownership cost. A replacement must first run against the
existing negative fixtures.
