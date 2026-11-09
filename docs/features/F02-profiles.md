# F02: Profile identity and comparison consent

Status: profile creation/settings and default-on sharing update implemented; SQL and mocked-browser verification available. All-user directory addition remains planned. Dependencies: F01. Read: shared contract and F01's session contract.

## Ownership

Own `music_profiles`, identity/settings RPCs, onboarding, directory discovery, exact-handle lookup, and comparison consent. No preference editing or scoring.

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
- Creation is onboarding after signup/login, not metadata supplied by another user. New profiles default comparison sharing to true and revision to 1; onboarding can explicitly set sharing false. Disclose at signup that the display name and handle are visible to signed-in users and comparisons default on. Users can opt out before saving the profile or later in settings.
- `ensureMyProfile` is idempotent: if an owned profile already exists, return it without applying input as an update. A conflicting new handle returns `HANDLE_TAKEN`.
- Updating locks the row, checks settings revision, validates fields, increments revision, and returns persisted values. Stale input returns `STALE_WRITE`.
- Exact-handle lookup normalizes the handle; return only sharing-enabled minimal identity, not email or raw preferences. Missing/disabled returns `PROFILE_UNAVAILABLE`.
- Lookup is not a guarantee of later eligibility; F05 checks consent again inside its transaction.
- Owner settings reads are restricted by RLS. Mutations use these RPCs, with direct writes revoked to preserve revision/validation rules.
- Preference transactions and settings updates coordinate using the same profile row lock. F05 locks participating profile rows in stable ID order before checking sharing; this makes opt-out and comparison creation have a defined transaction order.
- Sharing disclosure at signup and profile creation must explain that comparison results reveal shared and unique preferences to both participants. Opting out blocks new comparisons but does not erase existing snapshots or hide directory identity.

## Packets and acceptance

- **A:** Schema, RPC grants/RLS, unique-handle race, idempotent creation, cross-owner access, exact lookup, revision conflicts, consent tests.
- **B:** Onboarding/settings, field errors, explicit consent copy/toggle, missing-profile routing, and stale-settings feedback.

### C: Initial-launch directory addition (planned, not implemented)

- Add `listPlatformProfiles` backed by an authenticated `list_platform_profiles` RPC. Define its DTO, bounded page size, stable ordering/cursor, and errors in the shared API contract before coding.
- Return only profile ID, display name, handle, and comparison availability. Include all completed profiles, even if sharing is disabled; never expose email, Auth records, or raw preferences.
- Make all entries reachable across pages, including tied display names, without duplicates in an unchanged dataset. Require onboarding before entering the directory.
- Directory identity visibility is separate from comparison consent. Disclose visibility during onboarding/settings; opt-out blocks new comparisons, not identity discovery or access to authorized historical snapshots.
- Preserve owner-only raw table access; expose directory fields through the narrowly scoped RPC, not broader table grants.
- Test anonymous rejection, minimal response fields, full paginated coverage, sharing-disabled identity visibility, and availability changes. F05 owns the browsing UI and rechecks eligibility during comparison creation.
- Update the database default to true for new profiles. A one-time migration enables all existing profiles, including previously disabled ones, and increments the settings revision only for changed rows; later opt-outs remain effective. `ensure_my_profile` accepts optional `comparisonEnabled` (defaults true); validate its type and allow onboarding opt-out.

## Implementation handoff

- [Public entrypoint/provider](../../src/features/profiles/public.tsx), [API](../../src/features/profiles/api.ts), and [settings](../../src/features/profiles/screen.tsx) are implemented.
- Schema/RPCs are in the initial MVP migration; follow-up migrations implement the new-profile default, optional onboarding opt-out, and one-time existing-profile update.
- PGlite tests verify idempotence, handle conflicts, stale revision, default-on profile creation, the existing-profile update, opt-out, consent and API grants. Hosted rolled-back SQL smoke verifies profile creation.
- Signup disclosure, the checked-by-default onboarding control, and dashboard sharing notice are implemented. Verify the disclosed onboarding/opt-out flow through real authenticated sessions before release.
