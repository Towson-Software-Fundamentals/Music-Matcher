# F07: Integration and reproducible release

Status: partial; live Auth/SMTP and frontend hosting explicitly deferred. Dependencies: F01, F04, F06 and their completed prerequisites.

## Ownership and API boundary

Own route wiring verification, cross-feature browser journeys, reproducible setup, deployment configuration, and evidence. This feature adds **no business API or new database owner**. Found defects are fixed in the owning feature and its contract tests.

Public release inputs:

| Configuration | Consumer and exposure |
| --- | --- |
| `VITE_SUPABASE_URL` | Shared frontend client; public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Shared frontend client; public, protected by RLS |
| Supabase service credentials | Trusted server/runtime only; never `VITE_` variables |
| `MUSICBRAINZ_USER_AGENT` | Catalog Edge Function; app/version plus maintainer contact |
| Auth redirect allowlist and SMTP settings | Supabase Auth configuration; credentials remain server-side |

Use Supabase's documented built-in Edge runtime secrets rather than inventing duplicate service-key configuration. Verify exact names when implementing.

Release output is a production build and, after deployment approval, a working application URL plus setup instructions and actual test evidence. Neither an IDE nor MCP is required to run the project.

## Context-bounded packets

**A: cross-feature acceptance.** Read public contracts and browser tests, not every implementation file. Exercise:

1. Sign up/confirm/login -> create profile -> enable sharing.
2. Add custom preferences and catalog artists/songs/genres -> save -> reload.
3. Reject an invalid save and verify the prior set remains.
4. Compare two consenting nonempty profiles -> view result -> reopen history.
5. Change preferences and opt out -> historical result unchanged; new comparisons blocked.
6. Simulate catalog failure -> explicit error and custom entry still usable.
7. Password recovery using valid then expired/reused links.
8. Session loss -> protected data hidden and local drafts cleared.

Check 375px/1280px, keyboard/focus, contrast, reduced motion, console errors, and the local 100-preference comparison timing target. Run database access tests separately; UI success does not prove security.

**B: setup/deployment.** From a clean environment, follow only documented commands to install locked dependencies, start local Supabase, apply migrations, seed isolated fixtures, run tests, and build. Verify the hosting SPA fallback so result/recovery deep links reload correctly. Set auth redirects, email delivery, CORS as needed, and confirm the hosted app is responsive.

Use approved provisioning only; do not create or alter remote projects automatically because this packet exists.

## Required acceptance output

Record revision, environment, commands, actual pass/fail/unrun status, timing observations, deployment URL if present, and evidence paths. Never publish real credentials in screenshots or fixtures. Update the Sprint 3 architecture and implementation claims to reflect what actually runs.

If a failure needs another module's internals and exceeds the context budget, create a focused follow-up packet in that module's existing handoff section, then resume release testing. Do not rewrite the architecture during final integration.

## Verification handoff — October 28, 2026

Environment: macOS, Node 24.18.0, npm 11.16.0. Verification ran before Git integration. The workspace was subsequently linked to the existing team repository, preserving its history; use the implementation commit for the source revision.

Passed:

- `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm test`: **15 tests** (11 PostgreSQL/PGlite, 4 shared/provider contracts).
- `npm run test:e2e`: **10 tests**, desktop 1280px/mobile 375px, mocked APIs; axe WCAG A/AA automated scans of welcome/editor/results pass.
- 100-preference SQL comparison/persistence: **2.4 ms** locally in PGlite, below 2 seconds; not hosted timing.
- Hosted rolled-back SQL smoke: profiles, consent, preferences, 33.3% score, immutable snapshot. No fixture accounts remain.
- Anonymous hosted RPC/Edge rejection and port-5180 CORS preflight.
- Supabase advisor mutable-search-path warnings fixed. Remaining [authenticated SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) is intentional for the documented authenticated, ownership-checking RPC boundary; it is not an all-clear security certification.

Deployed: free project `cilswqtuswmuktzhifsn`, three migrations, catalog function v2, seven starter genres. Local dev server is responsive at http://127.0.0.1:5180.

Blocked/unrun: real signup confirmation/recovery, signed-in deployed catalog search, live two-account browser journey, multi-connection races, full genre import, Docker/CLI clean setup, hosted frontend deep links, and public HTTPS release. User chose to defer Auth URL/SMTP and public hosting. Provider 503s occurred during metadata retrieval. No email-delivery or provider uptime claim is made.

Next: follow [README setup](../../README.md), complete Auth/SMTP, exercise real accounts/search, configure a free static host and `APP_ORIGIN`, and repeat live acceptance. This is implemented code with a deployed backend, **not a completed release gate**.
