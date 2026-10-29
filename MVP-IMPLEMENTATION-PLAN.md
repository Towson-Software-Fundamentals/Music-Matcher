# Party Music Matcher: Initial MVP Implementation Plan

> Implementation update: the React app and free Supabase backend now exist. See the [README](./README.md) for running the app and the [release handoff](./docs/features/F07-release.md) for verified checks and deferred Auth/SMTP/hosting blockers. The original proposal below is retained as design context, not a claim that every release gate has passed.

## 1. Goal and source of truth

Build a React web application where two people can save their favorite artists, genres, and songs, then compare their tastes without connecting a streaming account.

This plan follows the supplied **Party Music Matcher Sprint 3 Draft**, particularly UC-05 Update Music Preferences and UC-06 Compare Music Profiles. It is a proposed implementation plan, not evidence that the application exists or tests have passed. The application workspace was empty when reviewed.

### Context-bounded implementation guide

Use the [feature implementation index](./docs/features/README.md) to execute this plan in small, dependency-ordered work packets. Each feature has its own documented API, data ownership, reading scope, and acceptance criteria. The [shared API contract](./docs/API-CONTRACT.md) defines transport, errors, and common data shapes.

The [prioritized development roadmap](./docs/DEVELOPMENT-ROADMAP.md) orders these packets into core proof, MVP completion, and follow-up work, with explicit acceptance and release gates.

These are planned contracts, not implemented endpoints. The feature documents refine this overview, including optimistic-concurrency protection for preference saves and explicit cross-module boundaries. Where this overview is less specific, use the feature contract. Behavioral changes still require team confirmation.

The first release should deliver:

1. Account creation, login, logout, and password recovery.
2. One music profile per account.
3. External catalog search and custom entries for artists, genres, and songs.
4. Atomic preference editing with Save and Cancel.
5. Comparison with another eligible, consenting profile.
6. A saved compatibility score with shared and unique preferences.
7. A polished, responsive dark interface with rainbow-gradient accents.

Defer party management, group matching, DJs, playback, playlist exports, streaming imports, and social feeds. AI explanations and recommendations remain documented follow-up requirements, not prerequisites for the first working release.

## 2. Recommended stack

| Area | Choice | Reason |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | Small client application with fast development and a static production build. |
| Navigation | React Router | Authentication, editor, comparison, and saved-result routes. |
| Styling | CSS variables and component styles; Lucide React icons | A consistent custom theme without a large UI framework. |
| State | `useState`, `useReducer`, and a small authentication context | Sufficient for this MVP; no Redux or complex cache infrastructure. |
| Backend | Supabase Auth, PostgreSQL, database functions, and one catalog Edge Function | Managed identity and persistence without maintaining an Express server. |
| Music data | MusicBrainz | Artist and recording metadata, stable external IDs, and a genre catalog. |
| Tests | Vitest + React Testing Library; Supabase database tests; Playwright | Cover logic, database authorization, and complete user journeys. |
| Hosting | Supabase Free + a free static host such as Cloudflare Pages | Target a $0 classroom deployment within provider limits. Verify terms before provisioning. |

Use current stable compatible package versions when implementation begins, record the Node.js version, and commit the lockfile. Do not select preview releases merely because they are newer.

### Architecture change from the draft

Replace the draft's Node.js/Express API with Supabase's managed API, database functions, and Edge Functions. Keep validation, matching, and persistence responsibilities separated, but do not add repository classes or a second API server just to mirror the original diagram.

```text
React browser application
  |-- Supabase Auth: account sessions and recovery
  |-- Supabase HTTPS API: permitted profile and result reads
  |-- PostgreSQL RPC functions: atomic saves and comparisons
  `-- Catalog Edge Function: validated, cached MusicBrainz requests
                                  |
                               MusicBrainz
```

The browser never receives a PostgreSQL connection string or privileged Supabase key. Update the Sprint 3 architecture and sequence diagrams to reflect this change if adopted.

## 3. User experience and screens

| Screen | Main behavior |
| --- | --- |
| Welcome / authentication | Product introduction; sign up, sign in, and forgot-password links. |
| Password recovery | Send recovery email; accept a valid recovery session and set a new password. |
| Dashboard | Preference counts, Edit Preferences action, Compare action, and recent saved comparisons. |
| Preference editor | Artists / Genres / Songs tabs, search suggestions, selected chips, custom-entry action, Save, and Cancel. |
| Compare | Look up a consenting profile by exact unique handle, review selection, and compare. |
| Results | Percentage, participant names, shared items, unique-to-you items, unique-to-them items, and comparison timestamp. |
| Profile settings | Display name, unique handle, and an explicit comparison-sharing toggle. |

### Editing behavior

- Keep a local draft separate from the last saved preference set.
- Catalog selection and custom entry use the same selected-item interface.
- Show artist disambiguation and recording artist credits in search suggestions.
- Always offer an explicit `Add custom "[value]"` action; do not silently create an entry after a provider failure.
- Allow users to edit custom text and remove any preference.
- Validate nonblank values, supported types, and normalized duplicates on both client and server.
- Save replaces the entire set in one database transaction and returns the complete saved set.
- On validation or database failure, retain the draft and show a useful error; do not show a success toast.
- Cancel restores the saved set. Saving an empty set is valid, but an empty profile cannot be compared.
- Warn before navigating away from unsaved edits.

## 4. Visual direction

Use a sleek, restrained dark theme rather than covering every surface with gradients.

| Token | Initial value / treatment |
| --- | --- |
| Page background | `#09090F` |
| Surface | `#15151F` |
| Raised surface | `#1D1D2B` |
| Border | `#303043` |
| Primary text | `#F5F5FA` |
| Secondary text | `#B6B6C8` |
| Accent | `linear-gradient(110deg, #FF5C7A, #FFB347, #F5E663, #59D98E, #53C8FA, #A78BFA)` |
| Shape | 12-16px card radii; pill-shaped preference chips |
| Typography | System sans-serif stack; strong headings and generous spacing |

Use the rainbow for the logo detail, selected-tab underline, compatibility ring, and primary-action border. Put readable text on a solid dark button interior; do not assume white text is readable over every gradient stop. Use a solid accessible focus ring.

Results should feature one large compatibility percentage, followed by clearly labeled overlap and differences. Do not imply that a score predicts relationship success. Display source/custom badges in preferences without relying on color alone.

Use a compact mobile layout and wider desktop cards. Validate at 375px and 1280px, keyboard-only navigation, visible focus, screen-reader labels, WCAG AA text contrast, and reduced-motion preferences. No animation should be required to understand a result.

## 5. Music catalog and custom entries

### MusicBrainz integration

- Search artists and recordings through a Supabase Edge Function; map recordings to the UI's "Songs" category.
- Import a small genre list from MusicBrainz into the local catalog and filter it locally. Verify the supported genre-list endpoint during implementation; do not assume genre search behaves like artist search.
- Store provider name, entity type, MusicBrainz ID, display name, and attribution/source URL for selected catalog items.
- Display source attribution and review the license of every imported field. MusicBrainz core and supplementary data have different licenses.
- Use a meaningful server-side User-Agent identifying the application and a maintainer contact.
- Enforce no more than one upstream request per second across the application, not merely per browser or Edge Function instance.
- Use a PostgreSQL-backed shared request gate plus query-result cache. For an uncached request, reserve a request slot atomically; return a retryable busy response if unavailable rather than starting an unbounded queue.
- Debounce search around 400ms, require at least two characters, limit results, and ignore stale search responses. Debouncing is a UX optimization, not the upstream rate limiter.
- Cache successful searches for a proposed 24 hours. Display a catalog-unavailable/retry message on timeouts or provider errors while keeping saved preferences and explicit custom entry usable.
- Validate category and query length, escape provider query syntax, and construct only allowlisted MusicBrainz URLs. Do not accept arbitrary proxy URLs.

MusicBrainz currently supports free non-commercial API use without an API key. Reassess terms before commercial use. No audio files, album art, or streaming subscriptions are required.

### Custom data policy

Store custom entries directly in the owner's preferences, not in a global user-editable music catalog. This avoids moderation work and accidental publication. Do not submit custom entries to MusicBrainz.

Catalog IDs are metadata in algorithm version 1. Both catalog and custom entries match using the same normalized text rule below, so entering "Adele" manually can match selecting "Adele" from the catalog. Aliases, misspellings, same-name artists, and different recordings with identical titles remain known limitations. Do not introduce fuzzy matching without a separately versioned scoring change.

## 6. Database and access design

| Entity | Key fields and constraints |
| --- | --- |
| `auth.users` | Supabase-managed account identity; never duplicate passwords in application tables. |
| `music_profiles` | UUID, unique owner FK to `auth.users`, display name, unique normalized handle, `comparison_enabled` default false, timestamps. One profile per account. |
| `music_preferences` | UUID, profile FK, type restricted to artist/genre/song, display value, normalized value, optional catalog FK; unique `(profile_id, type, normalized_value)`. |
| `catalog_items` | Provider, entity type, external ID, display label, source URL, attribution; unique provider/type/external ID. Only trusted server code imports catalog metadata. |
| `matches` | UUID, two distinct profile FKs, requester FK, score constrained to 0..1, immutable participant/preference snapshots, shared and unique items, algorithm version, timestamp. |
| Private catalog support | Search cache and shared upstream request-gate state; inaccessible to browser database requests. |

Keep profile IDs separate from Auth user IDs to preserve the draft's model. Account/profile creation must be transactional or reliably idempotent, including recovery from a missing profile after authentication.

### Server operations

1. `save_my_preferences(items)`: derive owner from `auth.uid()`, validate every entry and catalog reference, reject duplicates, replace the set atomically, and return saved entries. Serialize concurrent saves by locking the profile row.
2. `lookup_comparison_profile(handle)`: return minimal profile identity only for an exact handle with sharing enabled; do not expose email or a browsable user directory.
3. `create_comparison(target_profile_id)`: derive requester, validate distinct existing eligible profiles with nonempty preferences, read both sets from one consistent snapshot, calculate the result, persist snapshots, and return its ID.
4. Result retrieval: read a stored result only if the signed-in user is one of its participants.
5. Catalog Edge Function: authenticate callers, enforce rate and input limits, obtain cached/provider results, and persist only validated metadata.

Use RLS on exposed application tables. Profiles and preferences are owner-readable/writable through approved operations; raw other-user preferences are not exposed. Participants may read their stored comparisons; clients cannot insert fabricated scores or edit snapshots.

Owner-facing profile updates may use RLS-protected writes. Revoke direct preference replacement and match insertion privileges so callers cannot bypass transactional validation. Functions that need controlled access beyond ordinary owner RLS must use tightly scoped `SECURITY DEFINER`, an explicit safe `search_path`, fully qualified relations, caller/eligibility checks, and explicit EXECUTE grants only to the intended authenticated role. Revoke default PUBLIC/anon execution. Test these boundaries through the API, not only the UI.

Enabling sharing explicitly permits other authenticated users who know the handle to obtain a comparison, including the shared and unique preferences disclosed in its result. Explain this before opt-in. Both participants must enable sharing for new comparisons. Disabling it blocks new comparisons but does not erase historical snapshots; disclose that behavior.

Privileged keys and SMTP credentials remain server-side. Only the Supabase project URL and publishable key belong in frontend environment variables. Sanitize database/provider errors for users and retain useful server logs without credentials or recovery tokens.

## 7. Deterministic matching

Retain the draft's proposed Jaccard algorithm:

```text
normalize(value) = trim -> collapse repeated whitespace -> lowercase
key(preference) = (type, normalize(display_value))
score = number of shared keys / number of keys in the union
```

Implement normalization and scoring authoritatively in PostgreSQL for version `jaccard-text-v1`. Client validation mirrors it for immediate feedback; shared fixtures test client/server consistency. Each preference has equal weight regardless of category.

- Reject identical profiles, unavailable/nonconsenting profiles, or either empty set.
- Reject duplicate normalized entries when saving rather than silently dropping them.
- Save the score without display rounding; render a percentage to one decimal place.
- Save the complete inputs, differences, and algorithm version so later preference changes cannot alter a historical result.
- Label results as exact preference overlap, not an AI judgment.

Example: `{genre:jazz, artist:adele}` versus `{genre:jazz, artist:drake}` has one shared key and three union keys, so the display is **33.3%**.

An unsaved comparison is an error, not a successful historical result. Keep any attempted calculation clearly marked unsaved if it is displayed at all.

## 8. MCP use

Interpret "MPC servers" as **MCP servers (Model Context Protocol)**.

Use MCP as development tooling, not a dependency installed in users' browsers:

- **Supabase MCP:** inspect the development schema, apply reviewed migrations, generate TypeScript database types, and run database advisors.
- **Context7 MCP:** check current React and Supabase documentation.
- **Playwright or Chrome DevTools MCP:** exercise the UI, inspect browser errors, and capture acceptance screenshots.
- **GitHub MCP:** optionally create implementation issues and update the team board after confirming the repository and permissions.

Prefer read-only/project-scoped access where available. Keep migrations in source control so setup works without MCP or a specific IDE. Do not give the app or AI unrestricted database tools. Provisioning projects, changing remote schemas, and using paid features require separate approval.

## 9. Implementation milestones

Estimates are initial engineering effort, not commitments from the Sprint 3 report or promises of calendar completion. Owners should be confirmed by the team.

| Phase | Deliverable and exit criterion | Dependency | Estimate |
| --- | --- | --- | --- |
| 0. Confirm scope | Approve scoring, consent, custom-entry behavior, deployment, and deferred AI; confirm team/repository access. | None | 1-2 hours |
| 1. Foundation | Scaffold React/TypeScript, routing, theme tokens, responsive shell, lint/typecheck/test scripts, and safe example environment file. | 0 | 3-5 hours |
| 2. Identity and database | Reproducible migrations, Auth screens, profile creation, RLS/grants, consent setting, recovery flow, and isolated fixtures. | 1 | 5-8 hours |
| 3. Preference vertical slice | Custom artist/genre/song entry, normalized validation, Save/Cancel, atomic RPC, and persistence after reload. | 2 | 5-7 hours |
| 4. Catalog integration | MusicBrainz search, imported genres, source labels, shared rate gate, cache, and visible failure/retry behavior. | 3 | 4-7 hours |
| 5. Comparison vertical slice | Exact-handle lookup, eligible-profile checks, deterministic saved comparison, overlap/differences, and history. | 3 | 5-8 hours |
| 6. Acceptance and deployment | Automated tests, responsive/accessibility checks, clean setup rehearsal, deployed smoke test, screenshots, and updated report. | 4, 5 | 5-8 hours |

Total planning range: **28-45 engineering hours**, excluding optional AI and any email-domain acquisition. Catalog integration and comparison can proceed independently after the preference contract is stable.

For a tight Sprint 3 deadline, prioritize phases 1-3 and 5 to prove UC-05 and UC-06, then complete catalog integration before calling the requested initial MVP finished. Do not label custom-entry-only preference screens as completed external-catalog support.

### Suggested project organization

```text
src/
  app/                 routing, authentication context, application shell
  features/auth/       signup, login, password recovery
  features/profile/    display identity and sharing settings
  features/preferences/
  features/comparisons/
  components/          reused buttons, fields, chips, feedback
  lib/                 Supabase client, generated types, validation
  styles/              tokens and shared layout styles
supabase/
  migrations/
  functions/catalog-search/
  tests/               database constraints, RPCs, and authorization
tests/e2e/
```

Keep the initial implementation straightforward: ordinary lists and local editing state, explicit fetch/loading/error states, and no realtime subscriptions, background workers, SSR, microservices, or performance-oriented global state framework.

## 10. Verification and definition of done

Automate the draft's T01-T17 and T19 acceptance cases. Run T18 only when an actual AI integration exists; otherwise record it as deferred, not passed.

| Area | Required verification |
| --- | --- |
| Preferences | Add, replace, remove last item, cancel, reject blanks/types/normalized duplicates; reload confirms persisted data. |
| Atomicity | Force an error after replacement begins and verify the entire old set remains. Test concurrent saves do not interleave sets. |
| Authorization | Anonymous and cross-account requests cannot edit preferences; direct-write/RPC bypass attempts fail; nonparticipants cannot read results. |
| Eligibility | Same, missing, empty, or nonconsenting profiles are rejected without creating a result. |
| Scoring | Full overlap = 100%; none = 0%; sample partial overlap = 33.3%; case/whitespace normalize; types remain distinct; custom/catalog same-label entries match. |
| History | Reload returns the same saved score and snapshots after either profile is edited. |
| Catalog | Artist/song search, genre selection, custom entries, homonym labels, cache hits, rate gate across concurrent clients, provider failure, and stale-response handling. |
| Auth | Signup/login/logout, protected routes, valid recovery, expired/reused recovery rejection, and correct production redirect URLs. |
| UI | 375px and 1280px flows, labels, keyboard navigation, focus visibility, contrast, reduced motion, and visible save/error feedback. |
| Performance | Two distinct profiles with 100 preferences each: measure comparison RPC plus local persistence, excluding AI/catalog lookup, against the draft's two-second local target. Record hardware/environment and observed timing. |
| Reproducibility | Clean checkout, dependency installation, local database reset/migrations, safe fixture setup, tests, and production build using documented commands. |

Seed isolated demonstration profiles and expected overlap; never seed real personal credentials. Record actual test outcomes, revision, environment, and evidence. Capture saving preferences, a failed validation, and a stored comparison, with a database assertion proving persistence.

Documentation must include verified setup/deployment commands, environment-variable names, Supabase local prerequisites, migrations, fixture creation, SMTP configuration, privacy/consent behavior, catalog attribution, known matching limitations, and the final deployed URL if hosted.

## 11. Free-tier and delivery risks

- **Supabase:** currently lists a 500 MB database and two active free projects, with free projects paused after a week of inactivity. Stay within quotas and check project readiness before a demonstration. Do not assume production uptime or unlimited storage.
- **Email:** Supabase's default SMTP currently sends only to authorized team addresses and is heavily limited. General-user signup confirmation and password recovery need custom SMTP. Verify a free provider and sender-verification requirements; a domain may introduce cost. Use local captured email for development, but do not claim public recovery works until delivery is tested.
- **MusicBrainz:** obey the shared one-request-per-second limit and non-commercial terms. Catalog availability must never block saving custom preferences or viewing existing results.
- **MCP:** development-tool access may depend on the editor/account. The application itself must run without MCP.
- **Scope:** identity and recovery add work beyond the two Sprint 3 focus cases; they still belong in the requested initial MVP.
- **Data limits:** scaling is not a first-release goal, but input length, payload size, request limits, authorization, and transactional integrity are still required.

## 12. Optional follow-up: AI

After deterministic comparisons are reliable, consider a feature-flagged explanation/recommendation Edge Function. No paid model or guaranteed free inference is assumed.

Generate explanations only from an authorized saved comparison; obtain consent before sending preference data to an external provider. Keep model credentials on the server. Treat custom entries as untrusted text, not instructions. Label recommendations as generated and validate catalog references rather than inventing MusicBrainz IDs.

Provider timeout, missing configuration, or quota exhaustion must leave the saved score visible and report AI unavailability. A deterministic summary may be offered as a separate clearly labeled non-AI feature; it must not be presented as a successful AI response.

## 13. Proposed decisions to confirm before coding

1. Adopt Supabase managed APIs/functions instead of the draft's Express backend.
2. Keep the draft's equal-weight text-based Jaccard score for version 1.
3. Use opt-in, exact-handle comparison with the snapshot-retention behavior described above.
4. Use MusicBrainz for this non-commercial release; keep custom entries private to their owners.
5. Deliver AI after the initial MVP unless the course team explicitly requires it in the first release.
6. Select a free deployment target and verify an email delivery route before promising public signup and recovery.

## References

- Source requirements: supplied `Party_Music_Matcher_Sprint_3_Draft.docx`.
- [React: Build a React App from Scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [Supabase: Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase: API Keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase: Pricing and Free-Plan Limits](https://supabase.com/pricing)
- [Supabase: Custom SMTP and Default Email Restrictions](https://supabase.com/docs/guides/auth/auth-smtp)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [MusicBrainz Rate Limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [MusicBrainz Genres](https://musicbrainz.org/doc/Genre)
- [MusicBrainz Data Licensing](https://musicbrainz.org/doc/About/Data_License)

Provider capabilities, pricing, and terms should be rechecked when implementation begins.
