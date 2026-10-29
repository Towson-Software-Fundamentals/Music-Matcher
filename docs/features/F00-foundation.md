# F00: Foundation and shared contracts

Status: implemented and locally verified. Dependencies: none. Read: this document, the feature index, and the shared API contract.

## Ownership and scope

Own build/test configuration, the shared Supabase transport, common DTOs, theme tokens, basic accessible UI primitives, and route composition. Do not implement account forms or feature business rules here.

Planned files: `src/shared/api/`, `src/shared/ui/`, `src/shared/styles/`, `src/app/`, package scripts, example environment configuration. Other features own their adapters.

## Public API and data exchange

```ts
type SessionIdentity = { userId: UUID };
type RouteId =
  | "welcome" | "login" | "signup" | "recover" | "reset-password"
  | "dashboard" | "settings" | "preferences" | "compare" | "result";

type FeedbackProps = { message: string; kind: "success" | "error" | "info" };
type FieldProps = {
  id: string;
  label: string;
  error?: string;
};
```

Feature adapters consume one configured Supabase client. Do not build a generic repository framework or expose it through UI components. Shared transport provides narrow known-error mapping to `ApiError`; feature adapters handle their domain codes.

UI primitives take controlled values, callbacks, labels, and disabled/loading states. They do not read session state, query tables, or own preference data. Compose accessible standard button/input elements rather than inventing a broad design-system abstraction.

App route mapping:

| Path | Consumer |
| --- | --- |
| `/`, `/login`, `/signup`, `/recover`, `/reset-password` | Identity screens |
| `/dashboard` | Results dashboard |
| `/settings` | Profile settings/onboarding |
| `/preferences` | Preference editor |
| `/compare` | Comparison screen |
| `/comparisons/:id` | Saved result |

All but identity routes require a session. Authenticated users without a profile go to settings/onboarding. Recovery route requires a validated recovery flow, not an ordinary authenticated session.

## Packets and verification

**A: scaffold and contracts.** Establish TypeScript, Vite, router, Supabase SDK client, contract types, environment validation, lint/typecheck/unit/build scripts. Missing required configuration displays a setup error, not a mock backend.

**B: shell and UI.** Implement the original plan's dark/rainbow tokens, labeled fields, buttons, chips, feedback, responsive layout, and keyboard focus. Screens may be placeholders until feature wiring, but must be clearly nonfunctional.

Done when scripts execute, common DTOs compile, missing configuration is explicit, and the shell works at 375px/1280px with usable contrast and keyboard navigation. Capture the exact commands/outcomes in this document after implementation.

## Context boundary

No downstream feature internals are needed. Read public screen exports when integrating routes, not their data access code. If all route integrations cannot fit one packet, wire each route in its owning feature's UI packet.

## Implementation handoff

- Implemented in [app composition](../../src/app/App.tsx), [shared contracts](../../src/shared/contracts.ts), [Supabase transport](../../src/shared/client.ts), [UI primitives](../../src/shared/ui.tsx), and [theme](../../src/shared/styles.css).
- `Feedback` uses children rather than the originally proposed `message` prop. Routing uses explicit paths rather than a separate `RouteId` enum.
- Shared response decoding is runtime-validated with Zod; invalid server data is an explicit error. Configuration failure displays Setup.
- Verified `npm run typecheck`, `npm run lint`, `npm run build`, and automated desktop/mobile browser checks. The production build has a non-fatal bundle-size warning.
- App runs on port 5180 because an unrelated server already occupied 5173. Do not stop that other process.
