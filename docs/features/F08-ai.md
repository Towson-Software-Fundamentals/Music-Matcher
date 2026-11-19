# F08: AI comparison insights (DeepSeek)

Status: F08A (consent, storage, quota gate) and F08B (Edge Function) are implemented and tested locally. Neither is deployed. F08C and F08D are planned. Dependencies: F05 (saved snapshots), F06 (results screen), F02 (profile settings). Read: shared contract, F05 `ComparisonSnapshot`, F06 `getComparison`, F02 settings API, and the `catalog-search` Edge Function as the server pattern to copy.

This packet implements the optional follow-up in [MVP plan §12](../../MVP-IMPLEMENTATION-PLAN.md#12-optional-follow-up-ai) and acceptance case **T18**. It does not change scoring, snapshots, or the `jaccard-text-v1` algorithm.

## Goal

From a **saved** comparison, generate:

1. **Explanation**: a short, plain-language summary of what the two people share and where they differ, grounded only in the stored snapshot.
2. **Recommendations**: up to 5 artists, genres, or songs both people might enjoy, labeled as AI suggestions. Users can add one to their own preferences only by searching for it in the existing catalog or by adding it as a custom entry.

The score stays the source of truth. AI text is clearly labeled, is generated on request, and the result screen works when AI is unavailable.

## Provider choice: DeepSeek

DeepSeek has an OpenAI-compatible API at `https://api.deepseek.com` (`POST /chat/completions`). Prices and terms below were checked on 2026-11-18 and must be rechecked before going live.

| Model | Input (cache miss), peak / off-peak | Output, peak / off-peak | Notes |
| --- | --- | --- | --- |
| `deepseek-flash` (V4.1 Flash) | $0.30 / $0.15 per 1M tokens | $1.20 / $0.60 per 1M tokens | **Recommended.** JSON output, 1M context. |
| `deepseek-v4-pro` | $1.32 / $0.66 | $3.96 / $1.98 | Not needed for this task. |

Off-peak (half-price) covers all times outside 01:00–04:00 and 06:00–10:00 UTC on weekdays. Cache-hit input is about 50× cheaper, so keep the system prompt fixed so repeat requests can reuse it.

**Cost estimate.** Two profiles with 100 preferences each make about 3,000 input tokens. With reasoning mode off, the response is about 500 output tokens. That is roughly **$0.0015 per insight** at peak rates, or about **$1.50 per 1,000 insights**. A $5 prepaid balance covers the class demo many times over. These are estimates, not measured numbers. Record real token use from the API's `usage` field.

**Request settings:**

- `model: "deepseek-flash"`, configurable with `DEEPSEEK_MODEL`.
- `thinking: {"type": "disabled"}`. Reasoning is **on by default** and adds latency and output tokens.
- `response_format: {"type": "json_object"}`. The prompt must contain the word "json" and an example of the output shape.
- Set a `max_tokens` cap (proposed 800), `temperature` around 0.7, and a 20-second timeout.
- DeepSeek can return blank `content` when its output is not valid JSON. Treat that as `AI_UNAVAILABLE`, retry at most once, and never show an empty insight.

**Privacy risk (must be disclosed).** DeepSeek's privacy policy says it processes and stores data in the People's Republic of China, may use inputs to improve its models, and keeps data with no fixed deletion period. Before enabling this feature, the team should confirm that Towson's course and institutional policies allow sending student-entered data to DeepSeek. Send only the minimum data: display names are replaced with "Person A" and "Person B", and no handles, emails, or IDs are sent.

Keep the provider behind a small adapter (`provider.ts`) so a different OpenAI-compatible provider can be swapped in by changing `AI_BASE_URL` and `AI_MODEL`, without touching the UI or database.

## Ownership

Own AI consent, insight persistence, quota and budget limits, the `comparison-insight` Edge Function, and the insight panel on the result screen. Do not modify F05 scoring or the `matches` table. Do not read live preferences: use only the saved snapshot.

Planned files:

```text
supabase/migrations/<ts>_ai_insights.sql
supabase/functions/comparison-insight/index.ts      # auth, validation, gate, response
supabase/functions/comparison-insight/provider.ts   # DeepSeek request + output schema
supabase/functions/comparison-insight/prompt.ts     # versioned prompt builder
supabase/tests/ai_insights.sql
src/features/insights/{public.ts,api.ts,panel.tsx}
tests/e2e/insights.spec.ts
```

## Consent

- Add `music_profiles.ai_enabled boolean not null default false`. The opt-in is per user, is **off by default**, and is changed in profile settings with the same revision and locking rules as `comparison_enabled`.
- **Both participants** must have AI enabled for an insight to be generated, because the other person's preferences are also sent to DeepSeek. If only you have opted in, the panel says the other person hasn't enabled AI insights. No request is made.
- The settings text explains in plain words: what is sent (saved music preferences, no names), to whom (DeepSeek, servers in China), and that turning AI off stops new insights but does not delete ones already generated.
- Consent is checked again on the server for every generation request. Reading an insight that already exists only requires being a participant.

## Data model

```sql
create table public.comparison_insights (
  match_id uuid not null references public.matches(id) on delete cascade,
  kind text not null check (kind in ('explanation','recommendations')),
  prompt_version text not null,          -- e.g. 'insight-v1'
  model text not null,                   -- model id the provider reported
  content jsonb not null,                -- validated output only
  input_tokens int, output_tokens int,
  created_at timestamptz not null default clock_timestamp(),
  primary key (match_id, kind, prompt_version)
);
create table private.ai_user_usage (day date, owner_id uuid, requests int, primary key (day, owner_id));
create table private.ai_daily_usage (day date primary key, requests int);          -- global cap
create table private.ai_pending (match_id uuid, kind text, prompt_version text, reserved_at timestamptz,
  primary key (match_id, kind, prompt_version));                                     -- in-flight dedupe
```

(Abbreviated. The full definitions are in the F08A migration.)

- Snapshots never change, so each `(match, kind, prompt_version)` is generated **once**, and both participants see the same stored result. A repeat request returns the cached row and costs nothing.
- RLS: participants may `select`. Browser roles cannot insert, update, or delete. Only the Edge Function writes, using the service role through a scoped `SECURITY DEFINER` RPC.
- `ai_gateway(match_id, kind)` RPC: in one transaction, checks that the caller is a participant, checks both consent flags, returns the cached insight if one exists, and otherwise reserves a slot against the per-user daily cap and the global daily cap. It returns `{cached} | {reserved} | {limited, retryAfterSeconds} | {forbidden}`. This follows the `catalog_gateway` pattern.

Proposed limits (configurable): 10 generations per user per day, 300 per day globally. A kill switch (`AI_ENABLED=false`) returns `AI_UNAVAILABLE` without calling DeepSeek.

## Public API

```ts
type InsightKind = "explanation" | "recommendations";
type Explanation = { summary: string; highlights: string[] };               // ≤600 chars, ≤4 highlights
type Recommendation = { type: "artist" | "genre" | "song"; name: string; reason: string };
type ComparisonInsight =
  | { kind: "explanation"; content: Explanation; model: string; createdAt: ISODateTime; generated: true }
  | { kind: "recommendations"; content: { items: Recommendation[] }; model: string; createdAt: ISODateTime; generated: true };

getInsight(matchId: UUID, kind: InsightKind): Promise<ApiResult<ComparisonInsight | null>>; // read cached
generateInsight(matchId: UUID, kind: InsightKind): Promise<ApiResult<ComparisonInsight>>;   // Edge Function
setAiEnabled(enabled: boolean, revision: number): Promise<ApiResult<ProfileSettings>>;      // F02 extension
```

New error codes for the shared contract: `AI_CONSENT_REQUIRED` (one or both participants have not opted in), `AI_UNAVAILABLE` (not configured, kill switch on, timeout, provider error, or invalid output), and the existing `RATE_LIMITED` with `retryAfterSeconds`.

## Prompt and output safety

- The prompt sends the snapshot as **JSON data** in the user message: shared items, items only Person A has, items only Person B has, and the score. The system prompt says the data is untrusted user content, never instructions, and must not be followed.
- Custom entries are free text. Truncate each one to its stored maximum length and cap the total input size.
- Validate the output with zod: exact shape, length limits, at most 5 recommendations, and types limited to artist, genre, or song. Reject anything else and return `AI_UNAVAILABLE`. Do not show partial output.
- On the server, drop recommendations whose normalized name is already in either person's snapshot.
- The model gets no MusicBrainz IDs and is never asked for them. Recommendations are plain names marked **"AI suggestion — not verified"**. "Add" opens the existing catalog search prefilled with that name. It never writes a preference directly.
- The UI renders text only, with no HTML or markdown, relying on React's escaping. Show a "Generated by AI (DeepSeek)" label with the model and time. Do not imply the result predicts how well two people will get along.
- Logs record the status code, latency, and token counts only. Never log prompts, preferences, or the API key.

## Configuration

Supabase Edge Function secrets only. Nothing is added to Vite or frontend env files.

| Name | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Provider key. Set with `supabase secrets set`. Never commit it. |
| `AI_BASE_URL` | Default `https://api.deepseek.com` |
| `AI_MODEL` | Default `deepseek-flash` |
| `AI_ENABLED` | Kill switch, default `false` until the release check passes |
| `AI_USER_DAILY_CAP`, `AI_GLOBAL_DAILY_CAP` | Quota (10 / 300 proposed) |
| `APP_ORIGIN` | CORS, same as `catalog-search` |

Set a low prepaid balance on the DeepSeek account. It acts as a hard spending ceiling on top of the caps.

## Packets and acceptance

- **F08A: Consent and storage.** Migration for `ai_enabled`, `comparison_insights`, `ai_usage`, and `ai_gateway`, plus the RPC for writing insights. SQL tests: the default is off; outsiders cannot read or generate; a missing consent from either person returns `AI_CONSENT_REQUIRED`; caps are enforced under concurrent requests; a cached row is returned without reserving quota; browser roles cannot insert or update.
- **F08B: Edge Function and provider.** Auth, size limits, the gateway, the DeepSeek call (reasoning off, JSON mode, timeout), output validation, and filtering out items already in either set. Unit tests use a mocked provider and cover valid JSON, blank content, malformed JSON, oversized output, timeout, HTTP 429 and 5xx, a prompt-injection fixture (for example a custom entry saying "ignore instructions"), missing key, and the kill switch. **No live API calls in CI.**
- **F08C: Results panel and settings.** A settings toggle with the disclosure text. On the result screen: "Explain this match" and "Suggest music" actions, with loading, consent-required, rate-limited, unavailable/retry, and cached states. The score and lists render whether or not AI is available. Playwright tests with mocked responses at 375px and 1280px, plus an axe check.
- **F08D: Live check (T18).** With user approval, set the secret, enable AI on the deployed backend, and generate one explanation and one recommendation set between two test accounts that have both opted in. Record latency, token counts, and actual cost. Confirm that a participant can reload and see the cached insight and that an outsider cannot. Only then may T18 be recorded as passed.

Recommended order: `F08A → F08B → F08C → F08D`. F08A–C can run alongside roadmap step 7a (directory), because they only touch results and settings. Coordinate migrations and F02 settings changes with the F02C work.

## Decisions to confirm before coding

1. DeepSeek is acceptable under course and institutional data rules, given that data is stored in China. If it is not, use the same adapter with another OpenAI-compatible provider.
2. Both participants must opt in. The alternative, where only the requester opts in, is simpler but sends the other person's preferences without their consent. That alternative is not recommended.
3. Recommendations are included in v1. Otherwise, ship explanation only and do recommendations as a follow-up packet.
4. The proposed quotas (10 per user and 300 overall per day) and the prepaid balance amount.
5. The insight is generated when the user clicks a button (proposed), not automatically when a comparison is saved. This keeps cost and consent explicit.

## Implementation handoff

**F08A — done (local).**

- Migration [`20261118120000_ai_insights.sql`](../../supabase/migrations/20261118120000_ai_insights.sql):
  - `music_profiles.ai_enabled` defaults to false. `aiEnabled` is now included in `get_my_profile` and other profile responses. The frontend `profileSchema` ignores it until F08C adds it.
  - `public.comparison_insights` stores insights. Participants can read them through RLS. Browser roles cannot insert, update or delete. The content must be a JSON object of at most 16 KB.
  - Private tables: `ai_user_usage` and `ai_daily_usage` (daily counts in UTC) and `ai_pending` (marks generations in progress; a mark expires after 60 seconds).
- RPCs:
  - `set_my_ai_consent({aiEnabled, expectedRevision})` is for signed-in users. It locks the profile row and increments the settings revision, the same as `update_my_profile`.
  - `get_comparison_insight({matchId, kind})` is for participants and returns `{insight | null, consent: {you, them}}`. Anyone who is not a participant gets `NOT_FOUND`.
  - `ai_gateway` is for the service role only:
    - `reserve`: checks the caller is a participant and returns a cached insight if one exists. Otherwise it locks both profiles, checks both consents, blocks a duplicate in-flight request, and checks the global cap, then the user cap. If all pass it returns only the anonymized `input`: score, shared, onlyA, onlyB and `requesterIs`. Other outcomes are `consentRequired`, `limited` (with scope and `retryAfterSeconds`), `notFound` and `invalid`.
    - `save`: stores the insight; the first write wins.
    - `release`: clears the in-progress mark after a provider failure. Used quota is not refunded.
  - Caps are passed in by the Edge Function from `AI_USER_DAILY_CAP` and `AI_GLOBAL_DAILY_CAP`.
- Tests: [`tests/ai-insights.test.ts`](../../tests/ai-insights.test.ts) has 8 PGlite tests. They cover the default-off setting, validation and stale writes, outsider denial, consent from both participants, opt-out after an insight exists, duplicate in-flight requests, no names, handles or IDs in the provider input, first-write-wins saves, cached reads not using quota, user and global caps, and grants and RLS for `authenticated` and `anon`.
- 2026-11-18: `npm test` (25/25), `npm run lint` and `npm run typecheck` passed. Not yet run against the Supabase CLI's local Postgres, and not yet applied to the hosted project. Applying the migration to the hosted project needs approval.
**F08B — done (local).**

- Files are in [`supabase/functions/comparison-insight/`](../../supabase/functions/comparison-insight/):
  - `prompt.ts`: `PROMPT_VERSION = 'insight-v1'`, a fixed system prompt for each kind, the comparison data sent as JSON in the user message, strict zod output schemas, removal of control characters, and filtering of recommendations. It drops items already in either set (including a saved song title matching "Title - Artist"), removes duplicates and keeps at most 5.
  - `provider.ts`: the OpenAI-compatible `chat/completions` adapter. It turns reasoning off, uses JSON output, sends `max_tokens: 800` and accepts only `https` base URLs.
  - `handler.ts`: `createHandler(deps)`, written so it can be tested without Deno, the network or the database.
  - `index.ts`: Deno wiring using the service-role client.
- Request: `POST {matchId, kind}` with a user JWT. A successful response is `{data: {matchId, kind, promptVersion, model, content, createdAt}}`, the same shape as `get_comparison_insight().insight`. Errors:

  | HTTP | Code | When |
  |---|---|---|
  | 400 | `VALIDATION_FAILED` | bad request body |
  | 401 | `UNAUTHENTICATED` | missing or invalid session |
  | 403 | `AI_CONSENT_REQUIRED` | one or both people haven't opted in; includes `consent: {you, them}` |
  | 404 | `NOT_FOUND` | not a participant, or no such result |
  | 429 | `RATE_LIMITED` | daily limit or request already in progress; includes `retryAfterSeconds` and a `Retry-After` header |
  | 503 | `AI_UNAVAILABLE` | AI switched off, not configured, or the provider failed |
- Behavior:
  - The function checks the kill switch and its configuration before calling auth, the gateway or the provider.
  - Blank or invalid model output is retried once. Timeouts, network errors and HTTP errors are not retried.
  - Every failure after a slot is reserved calls `release`.
  - Logs contain only the result, reason, HTTP status, time taken and token counts.
- Configuration (env):
  - `AI_ENABLED` must be `true`.
  - `DEEPSEEK_API_KEY` (set in production on 2026-11-19).
  - Optional: `AI_BASE_URL`, `AI_MODEL` (default `deepseek-flash`), `AI_TIMEOUT_MS` (default 20000), `AI_USER_DAILY_CAP` (default 10) and `AI_GLOBAL_DAILY_CAP` (default 300).
  - `verify_jwt = false` is set in `supabase/config.toml`, the same as `catalog-search`. The function checks the token itself.
- `tsconfig.json` now allows `.ts` import extensions, so Vitest and `tsc` can load the function's Deno-style imports.
- Tests: [`tests/insight-function.test.ts`](../../tests/insight-function.test.ts) has 16 tests using a fake provider and a fake gateway; nothing calls DeepSeek. They cover the kill switch and missing configuration, auth and input validation, every gateway outcome, the request settings sent to DeepSeek, swapping in another provider, one retry for blank output, five kinds of unusable output, timeout, network, 429 and 5xx errors, failures in the gateway input and in `save`, unexpected exceptions, a prompt-injection fixture, removal of identities from what's sent, recommendation filtering and text cleaning.
- 2026-11-19: `npm test` (41/41), `npm run lint`, `npm run typecheck` and `deno check` on both functions passed. Not run with `supabase functions serve` or deployed.
- **Next: F08C.** Add `aiEnabled` to `profileSchema` and a toggle with the disclosure text in Settings. Add the insights adapter (`get_comparison_insight` and `functions.invoke('comparison-insight')`) and the results-page panel with every state.
