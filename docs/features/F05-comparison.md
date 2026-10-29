# F05: Deterministic comparison creation

Status: implemented with SQL and mocked-browser verification. Dependencies: F03. Read: shared contract, F02 lookup/consent contract, and F03 normalization/storage contract. Catalog internals are irrelevant.

## Ownership

Own matching function, comparison transaction, immutable snapshot storage, idempotency, and compare screen. F06 owns saved-result reading/presentation.

Planned files: `src/features/comparison/`, matches/scoring migration, database tests, and compare-screen tests.

## Public creation API

```ts
createComparison(input: {
  targetProfileId: UUID;
  requestId: UUID;
}): Promise<ApiResult<{
  id: UUID;
  createdAt: ISODateTime;
}>>;
```

RPC: `create_comparison`. Client never submits requester, score, normalized preferences, or a result body.

The compare screen consumes F02's exact-handle lookup, shows the selected target, then calls this API. A new deliberate comparison creates a new request ID; a retry of the same attempt reuses it. Clear stale selections if the handle changes. On success, the app navigates to `/comparisons/:id`.

## Stored result contract for F06

```ts
type ParticipantSnapshot = {
  profileId: UUID;
  displayName: string;
  handle: string;
  preferenceRevision: number;
  preferences: PreferenceValue[];
};
type SharedPreference = {
  type: PreferenceType;
  normalizedValue: string;
  displayValueA: string;
  displayValueB: string;
};
type ComparisonSnapshot = {
  id: UUID;
  createdAt: ISODateTime;
  algorithmVersion: "jaccard-text-v1";
  participantA: ParticipantSnapshot; // requester at creation
  participantB: ParticipantSnapshot; // selected target at creation
  score: number;
  intersectionCount: number;
  unionCount: number;
  shared: SharedPreference[];
  onlyA: PreferenceValue[];
  onlyB: PreferenceValue[];
};
```

Snapshots contain labels/normalized values, not mutable preference row IDs. Both shared labels are retained if case differs. Participant order is stable, independent of which participant later opens the result.

## Transaction invariants

- Authenticate, derive requester profile, and validate target UUID. Missing own profile is `PROFILE_NOT_READY`.
- Check existing requester/requestId first; return the original result for the same target, even if current consent/preferences subsequently changed. It is access to an existing authorized snapshot, not a new comparison.
- Reject reused request ID with another target as `VALIDATION_FAILED`.
- Reject same profile as `SAME_PROFILE`; missing/disabled target as `PROFILE_UNAVAILABLE`.
- Lock both profile rows in sorted UUID order. Preference saves and consent updates must use those same row locks.
- After locks are held, check both consent flags and load both complete preference sets in one consistent query snapshot. If requester's sharing is disabled, return `FORBIDDEN` with an enable-sharing message.
- Either empty set yields `INSUFFICIENT_PREFERENCES`; no result is written.
- Use `(type, normalizedValue)` set keys and calculate shared/union counts and score in SQL. One-third is stored at suitable precision, not rounded to 33.3%.
- Insert complete immutable snapshots and idempotency key in the same transaction. Enforce distinct participants, score bounds, and unique requester/requestId.
- Concurrent duplicate requests resolve to the same result; storage failure leaves no partial result.

Helper contract for database-local tests: `calculate_overlap(A: PreferenceValue[], B: PreferenceValue[])` returns score/counts/shared/onlyA/onlyB with the same deterministic ordering. It is not a public unauthenticated RPC and must not become a second matching implementation.

## Packets and acceptance

- **A:** Schema, eligibility, pure SQL scoring cases, atomic snapshot persistence, idempotency races, opt-out concurrency, immutable historical data, unauthorized/direct-insert rejection, and the 100-item timing test.
- **B:** Exact-handle flow, selected-target confirmation, loading/disabled actions, visible eligibility/persistence errors, safe retry ID handling, and successful navigation.

Do not implement AI, history queries, or duplicate client-side authoritative scoring. Test shape and scoring using the same saved result contract consumed by F06.

## Implementation handoff

- [Public API](../../src/features/comparison/public.ts), [adapter](../../src/features/comparison/api.ts), and [screen](../../src/features/comparison/screen.tsx) are implemented.
- Initial migration implements `private.calculate_overlap` and transactional `create_comparison`, with sorted profile locks and requester/request ID uniqueness.
- Tests cover 0/1/one-third scores, self/missing/empty/nonconsenting targets, repeat request IDs, snapshots, and persistence. Hosted rolled-back SQL smoke independently verified one-third and snapshot immutability.
- Local 100-preference-per-profile comparison plus persistence measured **2.4 ms** in PGlite on Node 24.18.0; this is not hosted network latency.
- Live Auth two-user browser flow, simultaneous multi-connection idempotency/opt-out races, and hosted timing remain unrun. No AI or alternate matching rule was added.
