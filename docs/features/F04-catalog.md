# F04: MusicBrainz catalog and selection

Status: implemented and deployed; signed-in live search unverified. Dependencies: F03. Read: shared `CatalogItem`, F03 input/output shapes, and the original plan's MusicBrainz requirements only.

## Ownership

Own `catalog_items`, private cache/gate state, genre import, provider mapping, search adapter, and reusable picker. Do not modify scoring or make custom entries global.

Planned files: `src/features/catalog/`, `supabase/functions/catalog-search/`, catalog migration/import tooling, and provider/gate/picker tests.

## Public API

```ts
searchCatalog(input: {
  type: "artist" | "song"; query: string;
}, signal?: AbortSignal): Promise<ApiResult<{
  items: CatalogItem[];
  cache: "hit" | "miss";
}>>;
getGenres(): Promise<ApiResult<{ items: CatalogItem[] }>>;
```

`searchCatalog`: Edge Function `catalog-search`, body `{ "type": "artist", "query": "Adele" }`. `getGenres`: no-input RPC `list_genres`; the small imported genre list is filtered client-side. Both require authentication.

The picker accepts a category and `onSelect(item: CatalogItem)`. An explicit custom action calls `onCustom(value: string)`; the preferences module creates the custom input. Cancellation uses `AbortSignal` and is a control-flow event, not an empty successful result. UI ignores stale request completions.

Example success:

```json
{
  "data": {
    "items": [{
      "id": "00000000-0000-4000-8000-000000000001",
      "type": "artist",
      "displayValue": "Adele",
      "subtitle": "British singer-songwriter",
      "provider": "musicbrainz",
      "externalId": "<provider-artist-id>",
      "sourceUrl": "https://musicbrainz.org/artist/<provider-artist-id>",
      "attribution": "MusicBrainz"
    }],
    "cache": "hit"
  },
  "error": null
}
```

IDs above are illustrative, not valid seed/provider data.

## Provider and persistence exchange

1. Authenticate user; validate category/query and per-user abuse limits.
2. Check shared cache by normalized query/category. A successful empty result is cacheable; a provider failure is not an empty result.
3. Reserve the shared upstream gate atomically before an uncached request. At most one outbound request per second across Edge instances. Busy gate returns HTTP 429 `RATE_LIMITED` with retry timing.
4. Issue allowlisted MusicBrainz artist/recording search, bounded timeout, meaningful User-Agent, escaped query syntax, JSON format, at most 10 results.
5. Validate/map provider data, upsert items by provider/entity/external ID, then cache the DTO result for 24 hours.
6. On provider timeout/unavailability, return `CATALOG_UNAVAILABLE`, not fabricated entries. Keep explicit custom entry available.

Server-only helper contract, callable only by the service role:

- `catalog_gateway({action:"read", key, userId}) -> {cached: CatalogItem[]} | {limited:true, retryAfterSeconds:number} | {reserved:true}`, using database time and an atomic gate update plus per-user request quota.
- `catalog_gateway({action:"cache", key, value: CatalogItem[]}) -> {saved:true}`.
- Cache key `(type, normalizedQuery)`, value `{items, expiresAt}`; cache entries and gate state are never browser-readable/writable.

Do not delete selected catalog items on cache expiry. Keep their IDs stable; preference matching uses persisted display text, not live metadata. In a saved preference response, the catalog item's `displayValue` must reflect the persisted preference label even if other metadata is refreshed.

The catalog migration adds F03's FK and resolves catalog selections server-side. Re-run the F03 save-contract suite. Genre import is an explicit trusted command using a verified provider endpoint, reviewed license, and attribution, not an arbitrary scrape or runtime write from the browser.

## Packets and acceptance

- **A:** Schema, genre fixture/import path, mapping, cache, shared gate, Edge auth, timeout/429 tests, persistent catalog IDs, and F03 catalog-resolution tests.
- **B:** Debounced picker, category tabs, disambiguation, attribution, source/custom badges, loading/empty/error/retry states, stale-response handling, and keyboard selection.

Stop and split A if provider handling and gate tests exceed the packet budget; complete their helper contract before the picker. Verify actual concurrent outbound timing rather than inferring compliance from a single-client test.

## Implementation handoff

- [Picker](../../src/features/catalog/public.tsx), [adapter](../../src/features/catalog/api.ts), [Edge Function](../../supabase/functions/catalog-search/index.ts), [provider mapper](../../supabase/functions/catalog-search/provider.ts), and [full genre import](../../scripts/import-genres.mjs) are implemented.
- Hosted catalog function v2 validates access tokens itself (`verify_jwt=false` at the gateway). Verified anonymous rejection and origin preflight for port 5180.
- Seven real provider genres were seeded; full import was not run. Provider mapping, query escaping, database gate/cache, and custom/catalog persistence are tested. Actual provider 503s were observed and not treated as empty successes.
- Defaults: CORS origin `http://127.0.0.1:5180`; User-Agent identifies the course GitHub repository. Optional `APP_ORIGIN`/`MUSICBRAINZ_USER_AGENT` overrides are documented in the README.
- Still unverified: signed-in deployed search, actual multi-instance outbound timing, provider cache round trip, and full import. Auth setup was deferred by the user; do not mark the catalog release gate passed.
