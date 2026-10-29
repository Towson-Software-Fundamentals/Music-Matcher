# F01: Identity and password recovery

Status: implemented; hosted signup/recovery verification blocked on deferred configuration. Dependencies: F00. Read: shared contract and F00's public transport/route types.

## Ownership

Own Supabase Auth adapter, session provider, signup/login/logout/recovery screens, and route guards. Do not create application profiles here; F02 owns idempotent profile onboarding.

Planned files: `src/features/identity/{public,api,session}.ts`, screens, and colocated tests.

## Public API

```ts
type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; identity: SessionIdentity };

authenticate(mode: "login" | "signup", email: string, password: string):
  Promise<ApiResult<{ confirmEmail: boolean }>>;
signOut(): Promise<ApiResult<null>>;
requestRecovery(email: string): Promise<ApiResult<null>>;
completeRecovery(newPassword: string): Promise<ApiResult<null>>;
```

Session state and methods are exported through `public.ts`. Never export passwords or access/refresh tokens to feature props. SDK session storage/refresh stays encapsulated.

## Wire behavior and failures

| Application method | Supabase SDK operation |
| --- | --- |
| `authenticate("signup", ...)` | `auth.signUp` with configured confirmation redirect |
| `authenticate("login", ...)` | `auth.signInWithPassword` |
| `signOut` | `auth.signOut` |
| `requestRecovery` | `auth.resetPasswordForEmail` with allowlisted recovery redirect |
| `completeRecovery` | Validate recovery flow, then `auth.updateUser` |

Use the SDK-supported callback exchange appropriate to the configured flow; validate this against current documentation during implementation. Do not accept a URL flag alone as proof of recovery. Expired or consumed recovery links fail explicitly; an ordinary login session must not unlock this recovery-only screen.

Translate invalid credentials/recovery into safe `VALIDATION_FAILED` messages, auth throttling into `RATE_LIMITED`, and known transport failures into the shared errors. Recovery returns a neutral accepted message when Supabase accepts the request, avoiding account enumeration; delivery/configuration failures must not be reported as sent successfully.

Client email validation is basic format validation; the provider owns identity verification and password policy. Align UI password hints with the configured provider policy. No custom password/token tables.

On logout or session loss, clear feature caches/drafts and hide prior protected data. Session initialization stays loading until resolved so protected screens do not flash.

## Packets and acceptance

- **A:** Adapter, session initialization/listener cleanup, failure mapping, and tests for signed-out/loading/signed-in transitions.
- **B:** Forms, guards, callback/recovery route, redirect setup, tests for invalid credentials and expired/reused recovery, and a valid recovery flow using captured local email.

Public email delivery requires verified SMTP and redirect configuration. Record hosted recovery as blocked until actually tested. Neither F02 nor preference code belongs in this packet.

## Implementation handoff

- [Identity API](../../src/features/identity/api.ts), [session provider](../../src/features/identity/public.tsx), and [screens](../../src/features/identity/screens.tsx) are implemented. The provider exposes `{user, loading, recovery, error, finishRecovery}` rather than a separate `SessionState` union.
- Recovery UI requires the SDK's `PASSWORD_RECOVERY` event; a normal session or route flag cannot enable submission. Uses PKCE and SDK callback/session handling.
- Browser tests verify ordinary-session recovery is disabled, protected-route redirect, and sign-out clearing protected drafts. Actual email confirmation, successful/expired/reused recovery links, and SMTP delivery remain unrun, not passed.
- User deferred hosted Auth URL configuration and email setup. Next: configure the URLs/SMTP per the README, then execute real two-account and recovery tests. No confirmation policy was weakened.
