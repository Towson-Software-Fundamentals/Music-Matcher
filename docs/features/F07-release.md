# F07: Integration and reproducible release

Status: partial; Auth URLs and custom SMTP are configured, and local recovery is verified. The recovery fix is ready for the approved main-branch deployment; production reset verification, signed-in catalog, live two-account acceptance, and frontend release checks remain. Dependencies: F01, F04, F06 and their completed prerequisites.

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

Blocked/unrun: signup confirmation using the newly configured Resend sender, production recovery after the callback fix deploys, signed-in deployed catalog search, live two-account browser journey, multi-connection races, full genre import, Docker/CLI clean setup, hosted frontend deep links, and final public release acceptance. Auth URLs and SMTP are now configured, and the public site responds over HTTPS. Provider 503s occurred during metadata retrieval. No provider uptime claim is made.

Next: verify the approved main-branch deployment and production recovery, then exercise signed-in catalog search and the live two-account comparison/history journey. Complete the remaining clean-setup and deep-link checks before marking release acceptance. This is implemented code with a deployed backend, **not a completed release gate**.

## Verification handoff — November 2, 2026 (Windows workspace)

Environment: Windows, Node 24.18.1, npm 11.16.0, Supabase CLI 3.0.0. The workspace has a local Supabase stack available at the documented ports. The existing ignored `.env` targets the approved hosted project; Playwright's browser suite uses its own local mock endpoint and does not touch hosted data.

Passed in this workspace:

- `npm run typecheck`
- `npm run lint`
- `npm test`: 15 tests across 2 files.
- `npm run test:e2e`: 10 desktop/mobile tests (Chromium), all passed. These mock Supabase responses.
- `npm run build`: production bundle generated; Vite reported advisory Zod annotation and 500 kB chunk-size warnings.
- `npx supabase status`: local API is available. No database reset or hosted project mutation was performed.

Still unverified: real signup confirmation and recovery, signed-in hosted catalog search, live two-account comparison/history, multi-connection race behavior, clean local-stack setup from reset, hosted deep-link reload, and public HTTPS deployment. These require live email/account access and a hosting target. The local Supabase CLI and stack availability does not close those gates.

Next packet: complete F07A with two consenting real accounts after Auth redirects and email delivery are configured; verify catalog search, preference persistence, comparison consent, and history. Then complete F07B against a selected static host, including deep-link fallback and public HTTPS checks. Do not mark F07 release-complete until both packets have recorded evidence.

## Verification handoff — November 8, 2026 (macOS workspace)

Scope: hosted Auth/SMTP setup and recovery testing. No production frontend deployment was performed.

- Supabase Site URL is `https://matchmymusic.app`; the allowlist includes `/login` and `/reset-password` for the public site, the existing Workers URL, and local `127.0.0.1:5180`.
- Resend domain `matchmymusic.app` was verified after adding its DKIM TXT and DNS-only CNAME records in Cloudflare.
- Supabase custom SMTP is enabled with sender `Party Music Matcher <no-reply@matchmymusic.app>`, host `smtp.resend.com`, port `465`, and username `resend`. A Resend Sending-access API key is stored in Supabase; the key's domain scope is all domains because the domain selector was unavailable.
- A Resend recovery email was marked **Delivered**. The first production reset link verified at Supabase, but the deployed frontend did not recognize the recovery session.
- Fixed the client recovery callback state in `src/features/identity/api.ts` and `src/features/identity/public.tsx`; added a full mocked recovery flow in `tests/e2e/app.spec.ts`. `npm run typecheck`, `npm run lint`, and `npx playwright test tests/e2e/app.spec.ts --grep 'recovery'` passed (4 browser cases across desktop/mobile).
- The user completed a recovery/password reset using the local app after pasting the link into the same Chrome profile that requested it. PKCE links are bound to that browser's verifier; opening a link in another profile can fail.
- The public site at `https://matchmymusic.app` responded over HTTPS, but the callback fix remains local and production password recovery is still unverified until the frontend is deployed and retested.
- Resend's one-click Supabase integration was not used because its domain list was empty. The user authorized its Auth/Projects read-write OAuth grant; it is unused by manual SMTP and should be revoked if the integration is not needed.

No Supabase schema or email-confirmation policy changed. The full automated suite was not rerun after the focused identity test.

Next: verify the approved deployment and production reset flow. Continue F07A with signed-in catalog search and a live two-account comparison/history journey. Deep-link reload, clean setup, and other release checks remain open; do not mark F07 complete yet.
