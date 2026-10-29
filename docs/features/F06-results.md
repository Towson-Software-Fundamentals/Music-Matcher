# F06: Saved results, history, and dashboard

Status: implemented with SQL and mocked-browser verification. Dependencies: F05. Read: shared contract, F05's `ComparisonSnapshot`, and F02/F03 read API signatures only.

## Ownership

Own participant-authorized result/history reads, result presentation, and dashboard composition. Do not recalculate scores or query the other participant's current preferences.

Planned files: `src/features/results/`, result-read migration/RPCs, and database/component tests.

## Public API

```ts
type HistoryCursor = { createdAt: ISODateTime; id: UUID };
type ComparisonSummary = {
  id: UUID;
  createdAt: ISODateTime;
  score: number;
  algorithmVersion: "jaccard-text-v1";
  otherParticipant: { displayName: string; handle: string };
};

getComparison(id: UUID): Promise<ApiResult<ComparisonSnapshot>>;
listMyComparisons(before?: HistoryCursor): Promise<ApiResult<{
  items: ComparisonSummary[];
  nextCursor: HistoryCursor | null;
}>>;
```

RPCs: `get_comparison` and `list_my_comparisons`. Results use the shared envelope. No owner/requester parameter is accepted.

The frontend history adapter requests ten rows per page. The RPC independently accepts a validated `limit` from 1 to 20.

## Exchange and presentation

- Only participants can retrieve a result or see it in history. Missing and unauthorized IDs both return `NOT_FOUND`.
- History uses descending timestamp/UUID keyset pagination. Return the last emitted row as cursor only when another page exists; use limit+1 internally.
- Successful empty history is `{ items: [], nextCursor: null }`. Database/network failure is not empty history.
- Determine "you/them" from the current user's own profile ID and the immutable participant IDs, not participant order or mutable handles.
- Render `score * 100` to one decimal place and show shared/unique lists from snapshots. No new normalization or catalog lookup is required.
- Display creation time and historical-data wording; edits, renamed profiles, catalog downtime, and consent opt-out do not rewrite stored results.
- Dashboard composes own profile, own preference counts, and recent history through their public adapters. If history fails, show a history error without turning successful profile/count reads into failures.
- Load full preference data only on screens that need it; the small MVP may derive dashboard counts from F03's read API without adding another endpoint.
- Errors/loading/empty results get distinct UI states. Inaccessible result IDs display a generic unavailable screen.

RLS and RPC checks must agree on participant access; direct update/delete and fabricated insert are forbidden to browser roles. Account deletion/retention is outside the initial UI scope; do not add an untested cascade that silently changes snapshot privacy.

## Packets and acceptance

- **A:** Participant-only detail/history, cursor ordering and tie handling, invalid cursor limits, empty list, no snapshot mutation, and both participant perspectives.
- **B:** Rainbow-accent score ring, labeled shared/unique sections, timestamp, history links, dashboard composition, reload stability, mobile layout, and accessible text equivalents.

Fixtures should include 0%, 33.3%, 100%, changed profile labels, and at least two history pages. F05 owns expected score values; results tests check rendering rather than duplicating the algorithm.

## Implementation handoff

- [Public API](../../src/features/results/public.ts), [adapter](../../src/features/results/api.ts), and [screens](../../src/features/results/screens.tsx) are implemented.
- SQL tests verify participant access, outsider denial, saved snapshots, and two history pages. Results use participant IDs and stored labels, not live target preferences.
- Browser tests verify detail navigation, percentage/overlap, deep-link reload, horizontal layout at 375px/1280px, and axe checks with mocked APIs.
- Dashboard count/history failures remain distinct from successful empty states, with retry controls.
- Next: verify dashboard/history/detail in real authenticated accounts. No public profile discovery or account-deletion interface is claimed.
