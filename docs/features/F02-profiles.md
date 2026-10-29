# F02: Profile identity and comparison consent

Status: implemented; SQL and mocked-browser verification available. Dependencies: F01. Read: shared contract and F01's session contract.

## Ownership

Own `music_profiles`, identity/settings RPCs, onboarding, exact-handle lookup, and comparison consent. No preference editing or scoring.

Planned files: `src/features/profiles/`, profile migration, profile database/API tests.

## Public DTO and API

```ts
type OwnProfile = {
  id: UUID;
  displayName: string;
  handle: string;
  comparisonEnabled: boolean;
  revision: number; // settings revision only
};
type ComparisonProfile = {
  id: UUID;
  displayName: string;
  handle: string;
};

getMyProfile(): Promise<ApiResult<OwnProfile | null>>;
ensureMyProfile(input: {
  displayName: string; handle: string;
}): Promise<ApiResult<OwnProfile>>;
updateMyProfile(input: {
  displayName: string; handle: string;
  comparisonEnabled: boolean; expectedRevision: number;
}): Promise<ApiResult<OwnProfile>>;
lookupComparisonProfile(handle: string): Promise<ApiResult<ComparisonProfile>>;
```

| Adapter method | RPC name |
| --- | --- |
| `getMyProfile` | `get_my_profile` (no input) |
| `ensureMyProfile` | `ensure_my_profile` |
| `updateMyProfile` | `update_my_profile` |
| `lookupComparisonProfile` | `lookup_comparison_profile` |

Wire requests/results follow the shared envelope. `getMyProfile` returns successful `null` only for an authenticated account that has not completed onboarding; an unauthorized request is an error.

## Behavior and access

- Derive owner from `auth.uid()`. Unique owner constraint enforces one profile per account.
- Creation is opt-in onboarding after signup/login, not metadata supplied by another user. It defaults sharing to false and revision to 1.
- `ensureMyProfile` is idempotent: if an owned profile already exists, return it without applying input as an update. A conflicting new handle returns `HANDLE_TAKEN`.
- Updating locks the row, checks settings revision, validates fields, increments revision, and returns persisted values. Stale input returns `STALE_WRITE`.
- Exact-handle lookup normalizes the handle; return only sharing-enabled minimal identity, not email or raw preferences. Missing/disabled returns `PROFILE_UNAVAILABLE`.
- Lookup is not a guarantee of later eligibility; F05 checks consent again inside its transaction.
- Owner settings reads are restricted by RLS. Mutations use these RPCs, with direct writes revoked to preserve revision/validation rules.
- Preference transactions and settings updates coordinate using the same profile row lock. F05 locks participating profile rows in stable ID order before checking sharing; this makes opt-out and comparison creation have a defined transaction order.
- Sharing disclosure must explain that shared and unique preferences become part of results visible to both participants, and opt-out does not erase existing snapshots.

## Packets and acceptance

- **A:** Schema, RPC grants/RLS, unique-handle race, idempotent creation, cross-owner access, exact lookup, revision conflicts, consent tests.
- **B:** Onboarding/settings, field errors, explicit consent copy/toggle, missing-profile routing, and stale-settings feedback.

No directory browsing or public profile URL is introduced. If discovery changes later, give it a separate privacy contract.

## Implementation handoff

- [Public entrypoint/provider](../../src/features/profiles/public.tsx), [API](../../src/features/profiles/api.ts), and [settings](../../src/features/profiles/screen.tsx) are implemented.
- Schema/RPCs are in the initial MVP migration. One shared migration establishes related tables/FKs at once rather than deploying incomplete per-feature schemas.
- PGlite tests verify idempotence, handle conflicts, stale revision, consent and API grants. Hosted rolled-back SQL smoke verifies profile creation and opt-in.
- No real Auth accounts were left in the hosted database. Browser behavior is tested with mock identity responses; next verification is onboarding and opt-in through real authenticated sessions after F01 setup.
