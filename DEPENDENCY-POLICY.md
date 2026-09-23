# Dependency Management Policy

> Never upgrade a package simply because a newer version exists.

## Classification

Every dependency upgrade is classified before merge:

| Class | Definition | Example |
|-------|-----------|---------|
| **PATCH** | Bugfix only, no API change | `cookie 2.0.1 → 2.0.2` |
| **MINOR** | New feature, backward-compatible | `helmet 8.3.0 → 8.4.0` |
| **MAJOR** | Breaking API changes | `cookie 2.x → 3.x` |
| **BREAKING** | Transitive breaking change or ecosystem shift | React 18 → 19, Vite 7 → 8 |

## Review Checklist

For **every** Dependabot PR, before merge:

1. **Changelog** — Read the upstream CHANGELOG / release notes. Identify every breaking change.
2. **Code compatibility** — Search this codebase for usage of changed APIs. Run `grep -r` for import paths, changed function signatures, removed exports.
3. **Tests** — `pnpm test` must pass with zero regressions.
4. **Build** — `pnpm build` must succeed.
5. **E2E** — `pnpm test:e2e:isolated` and `pnpm test:browser:e2e` must pass.
6. **Migration impact** — For MAJOR/BREAKING: document what code changes are required. Do not merge if migration is non-trivial without explicit approval.
7. **Merge only if safe** — If any step fails, the PR is closed with a comment explaining why.

## Special-Attention Packages

These packages are architectural pillars. Upgrades require extra scrutiny:

### cookie (`^2.0.1`)
- Used for session management (`server/_core/cookies.ts`).
- Major upgrade likely changes `SameSite`, `Secure`, `httpOnly` defaults.
- **Risk**: silent session breakage in production.

### Express (`^5.2.1`)
- Already on Express 5 (recent major). Any further major upgrade is a full migration.
- **Risk**: middleware incompatibility, route signature changes.

### React + ReactDOM (`^19.3.0`)
- Already on React 19. Major upgrade = full client rewrite.
- **Risk**: every Radix UI, tRPC-React, and form library depends on React internals.

### Vite (`^8.3.0`)
- Build toolchain core. Major upgrade may change plugin API, config format.
- Rolldown migration (Vite 6+) was already absorbed. Future majors need full rebuild verification.

### Vitest (`^5.0.1`)
- Test runner. Major upgrade may change config schema, snapshot format, coverage provider.
- **Risk**: all 46+ test files may need migration.

### React Day Picker (`^10.0.1`)
- Date component used in forms and reports. API has changed across majors.
- **Risk**: every date-picker usage breaks.

### react-resizable-panels (`^4.12.4`)
- Layout system for the dashboard. API changes break the entire UI shell.

### Tailwind CSS (`^4.3.3`)
- Utility framework. Major upgrade may change config format, class names, plugin API.
- Already on Tailwind v4 (major rewrite from v3). Future majors need full audit.

### TypeScript (`^5.6.0`)
- Type checker. Major upgrade may tighten strictness, remove deprecated flags.
- **Risk**: `tsc --noEmit` may start failing on previously-valid code.

### drizzle-orm / drizzle-kit (`^0.45.2` / `^0.31.10`)
- Database schema and query builder. Breaking changes may invalidate migrations.
- **Risk**: schema drift between code and database.

### zod (`^4.6.5`)
- Validation library used in tRPC routers. API changes break every endpoint's input validation.

### jose (`6.2.12`)
- JWT / JWK library. Pinned (no `^`). Never upgrade without reviewing every crypto operation.

## Upgrade Workflow

```
1. Dependabot opens PR
2. Bot auto-classifies: PATCH / MINOR / MAJOR / BREAKING
3. Maintainer reviews:
   a. Reads changelog (link in PR body)
   b. Runs CI: pnpm check && pnpm test && pnpm build && pnpm test:e2e:isolated
   c. For MAJOR/BREAKING: runs pnpm test:browser:e2e locally
   d. Checks for migration steps needed
4. If all pass and migration is clean → merge
5. If any fail → close with explanation
```

## What We Never Do

- Auto-merge any dependency update.
- Upgrade a package "because it's new."
- Skip tests to make a dependency PR pass.
- Accept a major upgrade without reading the changelog.
- Merge a breaking change to a critical package without explicit approval.
