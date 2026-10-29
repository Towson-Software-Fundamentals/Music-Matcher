# Shared API contract v1

Status: implemented for application RPCs/DTOs; live-service verification limits are listed in the [README](../README.md). Feature documents specify operations; this document specifies common exchange rules. All transport examples are application JSON, not direct copies of Supabase SDK response objects.

## 1. Common types

```ts
type UUID = string;       // validate UUID syntax at boundaries
type ISODateTime = string; // UTC ISO-8601 timestamp
type PreferenceType = "artist" | "genre" | "song";

type FieldIssue = {
  path: string; // e.g. "items.2.displayValue"
  code: string;
  message: string;
};

type ApiError = {
  code:
    | "UNAUTHENTICATED" | "FORBIDDEN" | "VALIDATION_FAILED"
    | "PROFILE_NOT_READY" | "PROFILE_UNAVAILABLE" | "HANDLE_TAKEN"
    | "SAME_PROFILE" | "INSUFFICIENT_PREFERENCES"
    | "STALE_WRITE" | "NOT_FOUND"
    | "RATE_LIMITED" | "CATALOG_UNAVAILABLE"
    | "NETWORK_ERROR" | "INTERNAL_ERROR";
  message: string;
  issues?: FieldIssue[];
  retryAfterSeconds?: number;
};

type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

type PreferenceValue = {
  type: PreferenceType;
  displayValue: string;
  normalizedValue: string;
};

type CatalogItem = {
  id: UUID;
  type: PreferenceType;
  displayValue: string; // title/name used for v1 text matching
  subtitle: string | null; // disambiguation/artist credits, not scoring input
  provider: "musicbrainz";
  externalId: string;
  sourceUrl: string;
  attribution: string;
};
```

Client-facing adapters resolve to `ApiResult<T>` for expected operation failures. They must not turn errors into empty lists or fake success. Programming errors are not broadly caught; network errors and known SDK errors are mapped explicitly. UI must render the error branch.

## 2. Transport and authority

- Frontend APIs use camelCase DTOs. SQL functions take a single JSONB parameter named `p_request` with camelCase keys, except no-input functions. Database columns may remain snake_case.
- RPC transport: `POST /rest/v1/rpc/<operation>` with body `{ "p_request": { ... } }`. No-input functions use `{}`.
- Application RPC success and expected domain failures return the `ApiResult` envelope. SQL functions roll back writes before returning a failed operation, using a transactional sub-block if needed. Unexpected database failures propagate as transport failures; adapters map a safe error and do not claim persistence.
- Edge Function transport: `POST /functions/v1/catalog-search`, JSON request directly in the body, `ApiResult` response. Expected errors use HTTP 400/401/403/429/503 as appropriate; success uses 200. Honor `Retry-After` for 429 responses.
- Use the publishable key as the Supabase API key and the signed-in user's access token as bearer authorization. SDK transport owns refresh. Never log access tokens or put a service key in the browser.
- Supabase Auth uses its SDK's native wire format; F01 translates that format to application results rather than creating duplicate Auth endpoints.
- Omitted optional fields are absent; explicitly nullable fields use `null`. Arrays are always arrays, including zero results. Timestamps are server-generated.
- Client supplies no owner ID, score, normalized text, or trusted catalog metadata in mutation inputs.
- Validate runtime input as well as static types. Reject unknown mutation fields, malformed IDs, unsupported types, and excessive payloads before writes.

## 3. Limits, ordering, and versions

Proposed v1 product limits, to confirm before coding:

- Display name: 1-80 trimmed Unicode code points.
- Handle: 3-30 ASCII letters/digits/underscores, stored lowercase; exact case-insensitive lookup.
- Preference display value: 1-200 Unicode code points after trimming.
- Preferences: at most 100 per profile total; save RPC request JSON at most 64 KiB.
- Search: trimmed query 2-100 Unicode code points, 10 results maximum.
- History: page size 1-20, default 10.

These bound input and test scope, not a scaling architecture. Over-limit requests return `VALIDATION_FAILED`; never truncate silently.

Normalize preferences using the draft's trim/collapsed-whitespace/lowercase rule, implemented authoritatively in SQL. Document concrete whitespace/case behavior in fixtures before shipping, including non-ASCII input. Client validation must match fixtures; do not add accent folding, aliases, fuzzy matching, or use catalog IDs as v1 scoring keys.

Preference arrays sort by type then normalized value; use a fixed server ordering rather than browser locale sorting. History sorts by `(createdAt DESC, id DESC)`. Scores are JSON numbers in `[0,1]`, derived from integer intersection/union counts; only the UI rounds percentages.

All planned DTOs are v1. A breaking contract change must update direct consumers and tests together before release; after release use a versioned operation when compatibility is necessary. Scoring version is `jaccard-text-v1`.

## 4. Concurrency and retries

- Read operations are safe to retry. Rate-limited catalog calls require visible bounded retry/backoff; do not retry indefinitely.
- Settings and preference saves use an integer revision. A stale revision returns `STALE_WRITE`, preserving the user's draft and the stored data. Do not automatically overwrite or merge it.
- Comparison creation takes a client-generated `requestId`. Reusing the same requester/requestId and same target returns the original saved result. Reusing it for a different target fails validation. A uniqueness constraint enforces this under concurrency.
- No automatic retry of ordinary writes after an ambiguous network error. Reload the server state before asking the user to retry; comparison creation can safely retry its same request ID.
- Database transactions own consistency; a successful client preview is not proof of persistence.

## 5. Error privacy

Missing and nonconsenting comparison targets both return `PROFILE_UNAVAILABLE`. Missing or unauthorized saved results both return `NOT_FOUND`. Do not leak email, ownership, or raw provider/database details. Log actionable server failures with safe context; never include passwords, tokens, or entire preference payloads unnecessarily.

## 6. Contract-test requirement

Every feature tests valid output shape, nullability, empty results, authorization, malformed input, expected error codes, and persistence/failure behavior for its operations. Compile-time checks are not a substitute for API-level authorization or rollback tests.
