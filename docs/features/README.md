# Context-bounded feature implementation

## Purpose

Implement one work packet at a time without loading the entire repository or conversation. Preserve a simple modular monolith: one React app, one Supabase project, and the catalog Edge Function. Context boundaries are development boundaries, not reasons to add microservices.

The application and backend are now implemented; see each feature's implementation handoff and the [run instructions](../../README.md). Contracts below retain design context. Hosted Auth/SMTP, real signed-in catalog verification, and frontend deployment remain release blockers explicitly deferred by the user.

Use the [prioritized development roadmap](../DEVELOPMENT-ROADMAP.md) for delivery order, P0/P1/P2 priorities, release gates, and early risks.

## Reading and context budget

For each packet, load:

1. This index, then the [shared API contract](../API-CONTRACT.md).
2. The current feature document and only the API sections of its direct dependencies.
3. The feature's public types, implementation being changed, and targeted tests.
4. Generated database types only around the relevant objects; never paste the whole generated file.

Target **8,000-16,000 input tokens** per work packet, with a working ceiling of **20,000**. Reserve at least half the model's available window for tool output, implementation, tests, and iteration. For smaller windows, split sooner. These are planning budgets, not measured token counts or guarantees of single-turn completion.

Split a packet when it needs unrelated feature internals, more than about 8 implementation/test files, or more than 20,000 input tokens. Prefer a server-contract packet followed by its UI consumer. Never split the transaction or weaken authorization merely to fit a window.

Tests, clear interfaces, and persistent documentation carry context between sessions; chat memory is not a dependency.

## Feature map

| ID | Feature and owned boundary | Depends on | Work packets, each independently reviewed/tested |
| --- | --- | --- | --- |
| F00 | [Foundation and shared contracts](./F00-foundation.md) | None | A: scaffold/tooling/transport types; B: theme, primitives, shell |
| F01 | [Identity and recovery](./F01-identity.md) | F00 | A: Auth adapter/session state; B: forms, guards, recovery |
| F02 | [Profile and comparison consent](./F02-profiles.md) | F01 | A: schema/RPC/access tests; B: settings and onboarding |
| F03 | [Preference editing](./F03-preferences.md) | F02 | A: normalization/transaction/access tests; B: custom-entry editor |
| F04 | [Music catalog](./F04-catalog.md) | F03 | A: catalog/cache/gate/provider API; B: search and picker integration |
| F05 | [Comparison creation](./F05-comparison.md) | F03 | A: eligibility/scoring/snapshot transaction; B: compare screen |
| F06 | [Results and history](./F06-results.md) | F05 | A: authorized read APIs; B: results/history/dashboard |
| F07 | [Release integration](./F07-release.md) | F04, F06, F01 | A: full-flow/accessibility acceptance; B: reproducible setup/deployment |

F04 and F05 can proceed independently after F03, but do not modify shared contracts or migrations concurrently without coordinating ownership. Default to serial execution; this plan does not require multiple agents.

Optional AI is not part of these packets. Before implementing it, add its own consent, provider, failure, and data contracts rather than importing provider logic into comparison scoring.

## Module layout and import rules

```text
src/
  app/                         composition, routes, session wiring
  shared/                      transport, common contract types, UI, theme
  features/
    identity/                  public.ts, api.ts, UI, tests
    profiles/                  public.ts, api.ts, UI, tests
    preferences/               public.ts, api.ts, UI, tests
    catalog/                   public.ts, api.ts, UI, tests
    comparison/                public.ts, api.ts, UI, tests
    results/                   public.ts, api.ts, UI, tests
supabase/
  migrations/                  append-only feature-owned migrations
  functions/catalog-search/
  tests/                       tests grouped by feature
tests/e2e/
```

- Each feature exposes only its documented values/types through `public.ts`. Consumers do not import another feature's hooks, internal state, or SQL implementation.
- Shared types are small DTOs, not an export of every database table.
- Only feature adapters use the shared Supabase client. Components call feature APIs, not table queries.
- Catalog does not import the editor. It returns catalog DTOs; preferences consumes them.
- Results never loads current preferences to reconstruct a saved comparison.
- Route composition belongs to the app shell; features export screens and navigation IDs, not private cross-feature imports.
- Keep state local. Share only session state; refresh related screens after successful writes rather than adding an event bus.
- Do not impose arbitrary file sizes. Split by responsibility when a file makes the packet too broad.

## Contract and handoff discipline

Before implementation, turn each documented DTO into TypeScript types and boundary validators. Treat documentation, code, migration, and contract tests as one change.

For a contract change, identify callers from this index, update their types/fixtures/tests together, and keep it in a dedicated packet if the consumer set is large. Do not silently rename fields or change errors. Algorithm versions and API versions are separate.

At packet completion, record in the feature document:

- Status and exact implementation/test paths.
- Public API changes, migration identifiers, and relevant configuration names.
- Commands actually run and outcomes; distinguish unrun tests and blockers.
- The next packet's prerequisites and remaining decisions.

Keep the handoff under approximately 400 words; do not copy logs or source files into it. Update existing feature documentation rather than creating another planning file per session.

## Recommended execution order

`F00A -> F00B -> F01A -> F01B -> F02A -> F02B -> F03A -> F03B`

Then `F05A -> F05B -> F06A -> F06B`, followed by `F04A -> F04B`, then `F07A -> F07B`. Catalog can be brought earlier after F03 if desired.

Each packet is intended to fit one focused model working context, not necessarily one prompt or an equal number of hours. The existing overall effort estimate remains a rough planning estimate; this decomposition does not make it more certain.
