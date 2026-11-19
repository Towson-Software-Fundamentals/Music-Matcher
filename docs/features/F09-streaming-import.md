# F09: Streaming import (Spotify beta)

Status: planned, not implemented. Dependencies: F03 (preference editor and validation), F01 (signed-in routes). Read: the shared contract, F03's `PreferenceInput` and `validatePreferences`, and `src/features/preferences/screen.tsx`.

This is a new scope addition. The MVP plan deferred streaming imports. It speeds up profile setup but doesn't replace it: manual entry and catalog search stay the main path.

## Goal

A signed-in user can connect Spotify once, see their top artists and songs (and genres taken from those artists), tick the ones they want, and add them to the preference editor's **unsaved draft**. They then review the draft and click Save as usual. Nothing is saved automatically, and nothing about the Spotify account is kept.

## Constraints that shape the design

These were checked on 2026-11-19 and must be rechecked before building.

| Constraint | Source | Consequence |
| --- | --- | --- |
| Spotify's tester mode allows **5 users per app**, each added by hand in the Spotify dashboard. The app owner needs **Spotify Premium**. | [Spotify, Feb 2026](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security) | Ship as a **"Beta: limited testers"** feature. Opening it to everyone requires Spotify's approval for wider access, which reportedly needs a registered business with about 250k monthly users. A class project can't qualify. |
| `GET /v1/me/top/{artists,tracks}` needs the `user-top-read` permission. `time_range` is `short_term` (~4 weeks), `medium_term` (~6 months, the default) or `long_term` (~1 year). At most 50 items. | [API reference](https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks) | Request only `user-top-read`. Fetch 50 artists and 50 tracks for one user-chosen time range. |
| The artist `genres` field is **deprecated** and can be empty. Artist `popularity` was removed in the Feb 2026 changes. | [API reference](https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks), [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) | Genres are a bonus: hide the Genres section when there's no data. Don't rely on popularity. |
| PKCE sign-in (Authorization Code with PKCE) needs no client secret. The redirect URI must match a registered URI exactly. | [PKCE guide](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) | Everything runs in the browser. No Edge Function, no stored secret and no database changes. |
| Users who aren't on the allowlist can sign in to Spotify, but their API calls fail. | Tester-mode behavior | Show a clear message: "Spotify import is in limited beta." |

## Data flow

```text
Preferences screen ──"Import from Spotify (beta)"──► accounts.spotify.com/authorize (PKCE, state, scope=user-top-read)
        ▲                                                         │
        │ in-memory router state (never the URL)                  ▼
Review list ◄── map + dedupe ◄── GET /me/top/artists, /me/top/tracks ◄── /import/spotify/callback (exchange code)
        │                                                         └── discard token, verifier, state
        └── "Add selected" ──► preference draft (custom entries) ──► existing Save → save_my_preferences
```

- **Browser only.** The access token stays in memory for the two API calls and is then dropped. It's never sent to our backend, stored in localStorage or the database, or logged. The refresh token is ignored. Importing again means signing in to Spotify again, which is acceptable for a once-per-setup action.
- **PKCE values.** The code verifier and `state` go in `sessionStorage`, which is per-tab. They're deleted as soon as the code is exchanged or the flow fails. The callback rejects a missing or mismatched `state`. After the exchange it calls `history.replaceState` to remove `code` from the address bar.
- **Unsaved edits.** Starting the import leaves the page, so the button is disabled while there are unsaved edits ("Save or cancel your edits first"). This avoids losing the draft.
- **No server changes.** Imported items become ordinary `custom` preferences, so the existing validation, the 100-item cap, duplicate checks and comparison all apply unchanged.

## Mapping rules

Mapping is done by pure functions, which makes it easy to unit test.

- **Artist** → `{type: 'artist', source: 'custom', displayValue: artist.name}`.
- **Track** → `{type: 'song', source: 'custom', displayValue: track.name}`. The artist names are shown as a subtitle in the review list but **not saved**. Catalog-picked songs store only the title, so text matching (`jaccard-text-v1`) works the same both ways. Same-title songs by different artists are an existing limitation.
- **Genre** → count `genres` across the imported artists and offer the top 10 by count. If every artist has empty genres, the section is hidden.
- **Cleanup:** trim, drop empty names or names over 200 characters, and remove duplicates by `type + normalize(name)`.
- **Already in your draft:** items whose normalized value is already there are shown as "Already added" and can't be selected.
- **Default ticks:** items are pre-ticked in Spotify's rank order, about 15 artists, 15 songs and 5 genres, but never more than the remaining room under the 100-item limit. The counter shows "N selected · M of 100 used".

## Ownership and files

```text
src/features/streaming-import/
  public.ts          # ImportCandidate type, SpotifyImportButton, SpotifyCallback screen, isSpotifyImportEnabled()
  spotify.ts         # PKCE helpers, authorize URL, token exchange, top-items fetch (fetch injected for tests)
  mapping.ts         # pure mapping/dedupe/genre-derivation/default-selection
  review.tsx         # selectable review list
src/app/App.tsx      # adds protected route /import/spotify/callback
src/features/preferences/screen.tsx  # button + accepts candidates from router state into the draft
tests/streaming-import.test.ts       # unit tests (mocked fetch)
tests/e2e/streaming-import.spec.ts   # Playwright with intercepted Spotify routes
```

```ts
type ImportCandidate = {
  type: "artist" | "genre" | "song";
  name: string;            // saved as displayValue
  subtitle: string | null; // e.g. track artists; display only
  rank: number;            // provider order, 1-based
  source: "spotify";
};
type ImportError = "CANCELLED" | "STATE_MISMATCH" | "NOT_ALLOWLISTED" | "PROVIDER_UNAVAILABLE" | "NO_DATA";
```

The candidate type doesn't depend on any one provider. A later Last.fm or Apple Music adapter would only need to produce `ImportCandidate[]` to reuse the review screen.

## Configuration

| Name | Where | Notes |
| --- | --- | --- |
| `VITE_SPOTIFY_CLIENT_ID` | frontend env and the Cloudflare build | PKCE client IDs are **public**, not secrets. If it's unset, the import button is hidden. |
| Redirect URIs | Spotify dashboard | `https://matchmymusic.app/import/spotify/callback` and `http://127.0.0.1:5180/import/spotify/callback`. Use `127.0.0.1`, not `localhost`, to match the dev server. |
| Tester allowlist | Spotify dashboard → User Management | At most 5 Spotify accounts. Their emails stay in the dashboard and are never committed. |

The callback is a deep link, so it relies on the Worker's SPA fallback (`not_found_handling: single-page-application`). Direct-link reloads are still listed as unverified in F07B, so test this route as part of that check.

## Errors and states

- The user denies access, or Spotify returns `error=access_denied` → back to Preferences with "Spotify import was cancelled". Nothing changes.
- `state` missing or mismatched, or the verifier is missing (for example the callback opened in a different tab) → "Import link expired. Start again."
- 403 from `/me/top` → "Spotify import is in limited beta and your account isn't enabled yet."
- 429, 5xx, network error or timeout → "Spotify is unavailable. Try again or add music manually." The editor stays usable.
- Both lists empty, which happens for new Spotify accounts → "Spotify doesn't have enough listening history yet."
- Every error clears the PKCE values in `sessionStorage`.

## Privacy and terms

- Disclose next to the button: "We read your top artists and songs from Spotify once. We don't store your Spotify login or listening history. Only the items you choose are added, and only after you click Save."
- Show "Data from Spotify" with Spotify's attribution in the review list. Follow Spotify's branding guidelines for the button.
- **Open question (decision 3 below):** Spotify's developer terms restrict using Spotify content with AI or machine learning, and F08 sends saved preferences to DeepSeek. Once saved, imported items are indistinguishable from typed ones. Either confirm the terms allow this, or add an `origin` marker to preferences (new migration, save RPC and snapshot change) and leave imported items out of AI input.

## Packets and acceptance

- **F09A: Spotify client and mapping (no UI).** PKCE verifier and challenge (base64url SHA-256), the authorize URL (the only permission is `user-top-read`), the token exchange, and fetching top items with a timeout, all with `fetch` injected. Mapping, removing duplicates, deriving genres and default ticks against the 100-item limit. Unit tests: challenge test vectors, state mismatch, `access_denied`, 403 → `NOT_ALLOWLISTED`, 429/5xx/timeout, empty lists, empty genres, overlong and blank names, items already in the draft, the limit when 95 items are already used, and that the token never reaches storage (spy on `localStorage` and `sessionStorage`).
- **F09B: Callback route and review UI.** The protected `/import/spotify/callback` route, URL cleanup, passing candidates to `/preferences` through router state, the review list with tick boxes, "Already added" items, the counter and "Add selected" into the draft, and the button disabled while there are unsaved edits. Playwright tests mock `accounts.spotify.com` and `api.spotify.com` for the happy path, cancel, not-allowlisted and provider errors. Run them at 375px and 1280px with axe. Check that nothing is saved until Save is clicked.
- **F09C: Beta setup and live check.** With your approval: register the Spotify app (the owner needs Premium), add the redirect URIs and allowlist the demo accounts, then set `VITE_SPOTIFY_CLIENT_ID` in the Cloudflare build. On the live site, import with one allowlisted account and one account that isn't allowlisted. Save, reload, compare with a second account, and record the results. Update the README setup notes.

Estimated effort: about 1–2 days in total. That's a rough figure; re-estimate after F09A.

## Decisions to confirm before coding

1. Accept Spotify import as a **5-tester beta**. The real fix, Spotify's approval for wider access, isn't available to this project.
2. Who owns the Spotify developer app (they need Premium), and which up to 5 accounts are the testers?
3. AI and Spotify terms: confirm that saved imported preferences may go to F08 insights, or add the `origin` marker and leave them out.
4. Which time range to fetch by default: `medium_term` (~6 months, proposed) or a selector for all three.
5. Out of scope: Apple Music ($99/yr developer account, no "top artists" data) and Last.fm (only covers people who track their listening with Last.fm). Either can reuse `ImportCandidate` and the review UI later.

## Implementation handoff

Not started.
