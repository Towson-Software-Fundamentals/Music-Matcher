# Party Music Matcher

React + TypeScript music-preference comparison, with Supabase Auth/PostgreSQL and MusicBrainz catalog search. Dark surfaces, rainbow accents, and responsive layouts are included.

## Team members

- Billy Mitchell
- Oseje Ehi-Douglas
- Kamryn Johnson
- Yukta Malla

## Current status

The app and backend implementation are present. A free Supabase project was created with approval in **Billy Mitchell Design**, US East (Northern Virginia):

- [Supabase project dashboard](https://supabase.com/dashboard/project/cilswqtuswmuktzhifsn)
- Project reference: `cilswqtuswmuktzhifsn`
- Local application: **http://127.0.0.1:5180**

All five migrations and catalog Edge Function version 2 are applied to that project. Seven verified MusicBrainz genres are seeded. The local ignored `.env` contains only the project URL and publishable key, not privileged credentials.

**Not release-complete:** Supabase Auth URLs and Resend SMTP are configured; Resend verifies `matchmymusic.app`, and a real recovery email was delivered and used successfully against the local app. The recovery-callback fix and default-on comparison-sharing update were pushed to `main` and deployed to the Cloudflare Worker; the deployed signup disclosure was verified in a browser. Production password reset, deep-link reloads, signed-in catalog search, and a live two-account journey remain unverified. Do not treat mocked browser tests or SQL fixture tests as proof of those release gates.

## Run the application

Validated with Node.js **24.18.0** and npm **11.16.0** on macOS. Use Node 22.12+ or a supported newer LTS.

```sh
npm ci
cp .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.
npm run dev -- --strictPort
```

In the current workspace, `.env` is already configured for the approved project; do not overwrite it unless changing targets.

Open http://127.0.0.1:5180. A missing/invalid configuration shows an explicit setup screen; there is no production mock backend.

### Hosted authentication configuration

In [Auth URL Configuration](https://supabase.com/dashboard/project/cilswqtuswmuktzhifsn/auth/url-configuration):

- Site URL: `https://matchmymusic.app`
- Redirect allowlist includes `/login` and `/reset-password` on `https://matchmymusic.app`, `https://music-matcher.nerva-corporation.workers.dev`, and `http://127.0.0.1:5180`.

These settings were verified in the Supabase dashboard on November 8, 2026.

Custom SMTP is enabled using Resend:

- Sender: `Party Music Matcher <no-reply@matchmymusic.app>`
- SMTP: `smtp.resend.com`, port `465`, username `resend`
- The sending domain is verified. Supabase stores the Resend API key; its secret is not in this repository.
- The key has Sending access and was scoped to all domains because Resend's domain selector was unavailable. The account currently has only `matchmymusic.app`.

The Resend one-click Supabase integration was not used because its domain selector was empty. An organization-wide Resend OAuth grant for Auth and Projects read/write was authorized during setup and is unused by the manual SMTP configuration; revoke it if the integration will not be used.

The real recovery email was marked delivered by Resend. Its link worked when opened in the browser profile that requested it, and the password reset completed against the local app. Recovery links use PKCE; open them in the same browser profile that requested them. Do not disable confirmation to work around email configuration.

The deployed frontend is built by the Cloudflare Worker connected to `main`. Retest a production password reset before considering recovery complete.

To try the complete experience after email setup:

1. Sign up, confirm email, and sign in.
2. Create a display name and unique handle.
3. Add artists, genres, and songs, from search or as custom entries, then Save.
4. Review the default-on comparison-sharing setting when creating a profile; turn it off there or later in Settings if preferred.
5. Have a second consenting account do the same, then look it up by exact handle.
6. Compare and reopen the saved result from the dashboard.

No sample account passwords or permanent test users have been provisioned.

## Reproduce the backend locally

Requires the Supabase CLI and a running Docker-compatible engine, neither of which was available in the implementation environment. These commands are the standard setup path, **not locally verified in this environment**:

```sh
supabase start
supabase db reset
supabase status
# Use the reported local API URL/publishable or anon key in .env.
supabase functions serve catalog-search --no-verify-jwt
```

The Edge Function validates bearer tokens with `auth.getUser` itself. Disabling the gateway's legacy JWT verifier is intentional for modern publishable-key compatibility; it does not make search anonymous.

Local confirmation and recovery messages are captured in the local email interface at http://127.0.0.1:54324. Keep local Auth redirect settings synchronized with the frontend origin.

### Deploy to a different approved Supabase project

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy catalog-search --no-verify-jwt
```

Confirm the target before pushing. Migration versions match the already-deployed project's history. Do not reapply their SQL manually to that project.

The function uses built-in `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` runtime secrets. Optional configuration:

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact frontend origin permitted by CORS; defaults to `http://127.0.0.1:5180`. Set this to the public HTTPS origin before release. |
| `MUSICBRAINZ_USER_AGENT` | Maintainer contact identifier; defaults to `PartyMusicMatcher/0.1 (+https://github.com/Towson-Software-Fundamentals/Music-Matcher)`. Override if the maintainer changes. |

Set server secrets through the Supabase dashboard or CLI, never as frontend `VITE_` variables. A service key must never be copied into browser code or committed.

## Catalog data

Artists and recordings are queried through the authenticated Edge Function; recordings appear as Songs. Search is debounced, returns at most ten suggestions, and uses a shared database request gate and 24-hour cache. Provider errors remain visible; explicit custom entry stays available.

Genres filter locally. The starter migration includes indie folk, indie pop, indie rock, industrial, J-pop, J-rock, and jazz, with provider IDs checked against the live MusicBrainz genre endpoint on October 28, 2026.

To import the full provider genre list, set these **server-only shell variables** securely: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `MUSICBRAINZ_USER_AGENT`, then:

```sh
npm run catalog:import
```

Run the import in maintenance with catalog search stopped because the upstream one-request-per-second IP limit is shared. The command upserts stable provider IDs, paces requests, and stops explicitly on errors; rerunning is safe. Full import was not executed here. Actual MusicBrainz 503 responses were observed during implementation, so catalog availability cannot be guaranteed.

MusicBrainz API use is free for non-commercial use under its [API terms](https://musicbrainz.org/doc/MusicBrainz_API). Review [core versus supplementary data licenses](https://musicbrainz.org/doc/About/Data_License) before redistributing data or commercializing. No audio or artwork is imported. Custom entries stay in the owner's preferences and are not submitted to MusicBrainz.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

- Unit/database tests execute the real migrations and PostgreSQL functions in PGlite, with test-only `auth.uid()`/roles. They cover validation, rollback injection, RLS/grants, scoring, snapshots, history, catalog labels, normalization, cache, gate, and 100-preference timing.
- Browser tests start a separate server on port 5178 with **test-only mocked Supabase responses**. They exercise desktop/mobile flows and axe accessibility checks. Mocking is confined to the tests.
- Browser screenshots are generated in ignored `test-results/`; they are not shipped.
- A live hosted PostgreSQL smoke test exercised profiles, sharing, saving, 33.3% comparison, and immutable snapshots inside a rolled-back transaction. It did not create real Auth sessions or leave fixture accounts.
- Anonymous hosted RPC and catalog requests were confirmed rejected; CORS preflight for the local frontend passed.

See [release verification and blockers](./docs/features/F07-release.md) for what remains untested. The build currently emits a non-fatal bundle-size warning; initial scaling/performance optimization remains outside scope.

## Data contracts and architecture

- [API contract](./docs/API-CONTRACT.md)
- [Feature index and context-window work packets](./docs/features/README.md)
- [Development roadmap](./docs/DEVELOPMENT-ROADMAP.md)
- [Original implementation plan](./MVP-IMPLEMENTATION-PLAN.md)

Feature APIs return `{ data, error }` envelopes and validate runtime responses. SQL owns normalization, equal-weight Jaccard scoring, revisions, and transactional writes. Components use public feature entrypoints rather than raw table writes. One initial migration establishes the related schema/RPCs together; follow-up migrations harden private helper search paths and seed genres.

Sharing is off by default. Opting in discloses shared and unique preferences to both comparison participants. Opting out blocks new comparisons but does not delete historical participant-only snapshots. v1 matches normalized text, so aliases/homonyms and same-title songs have known limitations. No fuzzy matching or AI scoring is included.

## Public frontend release

Cloudflare GitHub integration is the selected hosting route. The current dashboard deployment uses Workers Static Assets; the included `wrangler.jsonc` configures its native SPA fallback. Follow the [Cloudflare deployment checklist](./docs/CLOUDFLARE-DEPLOYMENT.md) for exact build settings, production environment variables, and Supabase follow-up configuration.

Use `npm run build`, output directory `dist`, and configure only the two public Vite variables at build time. For Workers, deploy with `npx wrangler deploy`; its native `single-page-application` asset handling serves client-side routes without a catch-all redirect. Cloudflare Pages also supports SPA fallback automatically when no top-level `404.html` is present. Other hosts may require their own fallback setting.

Set the production Auth URLs and Edge Function `APP_ORIGIN`, rebuild, and verify signup/confirmation/recovery, a real signed-in catalog search, save/reload, two-account comparison, and result deep-link reload. Do not call the release done until these live checks pass. No frontend hosting account was provisioned or changed.
