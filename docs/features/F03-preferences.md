# F03: Preference editing and atomic persistence

Status: implemented and SQL/UI tested. Dependencies: F02. Read: shared contract and F02's `OwnProfile` shape. F04 is not required for custom-entry editing.

## Ownership

Own `music_preferences`, normalization, draft state, save/cancel, and preference revision. F04 owns catalog metadata; F05 owns scoring. Do not put either in the editor.

Planned files: `src/features/preferences/`, normalization fixtures, preference migration, and unit/database/UI tests.

## DTOs and API

```ts
type PreferenceInput =
  | { type: PreferenceType; source: "custom"; displayValue: string }
  | { type: PreferenceType; source: "catalog"; catalogItemId: UUID };
type SavedPreference = PreferenceValue & {
  id: UUID;
  catalogItem: CatalogItem | null;
};
type PreferenceSet = {
  revision: number; // separate from settings revision, initially 0
  items: SavedPreference[];
};

getMyPreferences(): Promise<ApiResult<PreferenceSet>>;
saveMyPreferences(input: {
  expectedRevision: number;
  items: PreferenceInput[];
}): Promise<ApiResult<PreferenceSet>>;
```

RPCs: `get_my_preferences` with no input, and `save_my_preferences` with the above JSON request. Missing own profile returns `PROFILE_NOT_READY`.

The catalog variant takes only ID/type; the server loads its label and metadata and checks the category. Clients cannot relabel a catalog entry. To edit its text, explicitly convert it to custom.

## Transaction and exchange rules

1. Authenticate and lock the owned profile row.
2. Check preference revision, payload limits, types, nonblank custom values, and catalog references.
3. Resolve catalog entries, normalize values server-side, and reject normalized duplicates with indexed `issues`.
4. Replace the stored set and increment preference revision in one transaction; return a sorted complete `PreferenceSet`.
5. Any validation/write failure leaves the entire previous set and revision unchanged.

The initial migration creates the catalog table and FK alongside preferences, so catalog references are constrained from the outset. Catalog inputs require an existing trusted item. Provider requests still belong exclusively to F04.

UI owns two separate values: last loaded `PreferenceSet` and editable draft plus its base revision. Save success replaces both; cancel restores the saved set. Saving `[]` is valid. Replacement may assign new row IDs, so the editor uses local draft IDs rather than relying on persisted row IDs for matching.

`STALE_WRITE` preserves the draft and asks the user to reload/review; never automatically merge. After an ambiguous network error, offer reload before re-save. Clear drafts on session loss.

Client normalization is only immediate feedback. Server normalization is authoritative, with Unicode/whitespace parity fixtures. Input shape never includes `normalizedValue`.

## Packets and acceptance

- **A:** Migration and revision storage, normalization, RPC validation, full rollback under injected failure, unauthorized/direct-write rejection, concurrent saves, duplicate and limit tests.
- **B:** Three-category editor, custom add/edit/remove, empty save, labeled fields, keyboard chips, unsaved-navigation warning, cancel, reload persistence, and visible failures.

The public editor later accepts `CatalogItem` selections from F04 and converts them to catalog inputs. No provider requests occur in this module.

## Implementation handoff

- [Public API](../../src/features/preferences/public.ts), [adapter](../../src/features/preferences/api.ts), and [editor](../../src/features/preferences/screen.tsx) are implemented.
- Tests cover replace/empty save, blanks/types/duplicates, stale revision, post-delete rollback injection, unauthorized writes, catalog type validation, and SQL/JS Unicode whitespace fixtures.
- Browser tests cover add/save/reload/cancel, navigation warning, custom entry during provider failure, and sign-out draft removal at both widths. These use mocked APIs; SQL tests separately prove persistence.
- Field-specific duplicate paths are returned by SQL; the UI currently shows the operation message, not inline mapping for each draft row.
- Reload explicitly discards a draft with confirmation. Save is blocked after stale/ambiguous failure until reload. Next: real signed-in browser save/reload verification; simultaneous multi-connection race testing remains outstanding.
