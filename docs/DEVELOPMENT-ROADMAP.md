# Prioritized development roadmap

Status: code implemented through P1, with local automated checks and deployed backend smoke checks. Release gates remain incomplete; see progress below.

Scope update: the all-user directory and click-through comparison are now required for the initial launch and remain unimplemented. Earlier implementation progress does not cover this addition.

Default-on comparison sharing is implemented for new profiles, with signup disclosure and an onboarding opt-out. A one-time migration enables existing profiles, including those previously disabled; later opt-outs remain respected. Signed-in users see a dashboard notice when sharing is enabled.

## Implementation progress

- Foundation, identity UI/adapter, profiles, preferences, comparison, results/history, and catalog code are present.
- Free Supabase project `cilswqtuswmuktzhifsn` created with user approval; migrations and authenticated catalog function deployed.
- Typecheck, lint, unit/database tests, and desktop/mobile browser tests pass. Browser tests mock service responses and do not prove hosted email authentication.
- Live hosted SQL smoke passed; anonymous access was rejected; catalog CORS preflight passed.
- Supabase Auth URLs and Resend SMTP are configured; the sending domain is verified and a real recovery email was delivered. A local recovery-callback fix passes focused browser tests and the user completed a local password reset. The fix is not deployed, so production recovery remains unverified. The public site responds over HTTPS; deep-link reloads, signed-in MusicBrainz search, and the live two-account journey remain open.
- **Checkpoint D is blocked, not complete.** Checkpoints A/B have SQL and mocked-browser evidence, not a fully authenticated live two-account demonstration. Checkpoint C still needs that live integration evidence.

See [setup and verification](../README.md) and [F07 release handoff](./features/F07-release.md) for the next actions.

## 1. Delivery strategy

Build the smallest trustworthy end-to-end comparison first, then complete the requested music-catalog experience and release readiness. Keep the dark/rainbow theme in the foundation rather than postponing all styling.

Priority meanings:

- **P0 - Core proof:** required to demonstrate secure preference editing and deterministic two-person comparison.
- **P1 - Initial MVP completion:** required for the requested initial release, but not for proving the core workflow.
- **P2 - Follow-up:** optional after the MVP acceptance gate; not hidden requirements for release.

P1 does not mean optional. A custom-entry-only demo is a core proof, not the finished requested MVP.

Use the [feature index](./features/README.md) for packet reading scopes and the [shared API contract](./API-CONTRACT.md) for data exchange. API and transaction tests ship with their feature; testing is not deferred to the final milestone.

## 2. Ordered roadmap

| Order | Priority | Milestone / packets | Depends on | Completion gate |
| --- | --- | --- | --- | --- |
| 0 | P0 | Confirm scope and unblock tooling | None | Confirm v1 scoring, consent/retention, input limits, repository access, local Supabase prerequisites, and free-tier deployment approach. Record any undecided behavior before coding its feature. |
| 1 | P0 | Foundation: F00A, F00B | 0 | React/TypeScript builds; targeted test/lint/typecheck commands work; shared result/error types exist; dark/rainbow shell works at mobile and desktop widths. |
| 2 | P0 | Identity: F01A, F01B | 1 | Signup/login/logout, protected routes, and local recovery tests work; session loss clears protected data. Hosted email readiness is tracked separately. |
| 3 | P0 | Profiles and consent: F02A, F02B | 2 | Idempotent onboarding, unique handle, default-on comparison sharing with signup disclosure and onboarding opt-out, exact-handle lookup, settings revisions, and ownership tests pass. |
| 4 | P0 | Preference vertical slice: F03A, F03B | 3 | Add/edit/remove custom artists, genres, and songs; save/reload/cancel work; duplicates and stale saves fail clearly; rollback and cross-owner tests pass. |
| 5 | P0 | Comparison creation: F05A, F05B | 4 | Distinct consenting nonempty profiles compare; scores/snapshots persist atomically; unsafe inputs are rejected; retry IDs prevent duplicate attempts. |
| 6 | P0 | Results and history: F06A, F06B | 5 | Both participants can reopen the same saved result; outsiders cannot; overlap/differences render correctly; later edits do not change history. |
| 7 | P1 | Catalog completion: F04A, F04B | 4; normally scheduled after 6 | MusicBrainz artists/songs and imported genres are selectable; custom entry remains usable; shared rate limit, cache, source labels, and provider-failure handling are verified. |
| 7a | P1 | All-user discovery: F02C, F05C | 3, 6 | Authenticated users can browse every completed profile across pages and select an eligible user for saved comparison; minimal identity exposure, consent rechecks, unavailable states, and matching data points are tested. |
| 8 | P1 | Cross-feature acceptance: F07A | 2-7, 7a | Complete browser journeys including directory-to-comparison, API authorization checks, responsive/accessibility checks, and documented 100-preference timing target pass, with recorded evidence. |
| 9 | P1 | Reproducible release: F07B | 8 | Clean setup/build works; approved hosted deployment passes smoke tests; deep links, SMTP/recovery, redirect configuration, safe secrets, and setup instructions are verified. |

### Critical path

```text
Scope -> Foundation -> Identity -> Profiles -> Preferences
                                              |
                         +--------------------+-------------------+
                         |                                        |
                    Comparison                                Catalog
                         |                                        |
                    Results/history                               |
                         +--------------------+-------------------+
                                              |
                                      Acceptance -> Release
```

Default to serial work in the table's order. If separate contributors are available, catalog and comparison may proceed independently after the preference contract is stable. Coordinate shared contract edits and migration numbering; do not assume parallel work reduces integration effort.

## 3. Demonstrable checkpoints

### Checkpoint A: Owned preferences

After milestone 4, a signed-in user can create a profile and persist custom preferences. Demonstrate success, validation failure, cancellation, reload, and database rollback evidence.

This proves UC-05, not comparison or catalog completion.

### Checkpoint B: Core comparison proof

After milestone 6, two comparison-enabled accounts can compare preferences and reopen saved results. Demonstrate 0%, 33.3%, and 100% fixtures, blocked invalid comparisons, participant-only result access, and unchanged snapshots after edits.

This is the first useful end-to-end demo and proves UC-05/UC-06/UC-07. It is not yet the complete requested MVP.

### Checkpoint C: Feature-complete local MVP

After milestone 8, external artist/song search, genre selection, custom entries, all-user browsing, click-through comparison with shared data points, and all core flows pass the acceptance suite. No catalog mock may be substituted for an actual verified provider integration when claiming completion.

### Checkpoint D: Released MVP

After milestone 9, a new evaluator can follow documented setup or use the deployed application. Public signup and recovery are tested with the real configured email-delivery path. Do not equate a successful production build with a working deployment.

## 4. Early risk work

Address these alongside the ordered roadmap without broadening the current packet:

| Risk | Investigate by | Required evidence / fallback |
| --- | --- | --- |
| Supabase local tooling or remote access unavailable | Milestone 0 | Confirm authorized development path. Report the blocker; do not silently replace persistence with local storage. |
| Free email delivery and sender verification | Milestone 2 | Select a viable SMTP route and test local recovery first. Hosted release remains blocked until real delivery is verified. Do not purchase a domain/service without approval. |
| MusicBrainz genre endpoint/license suitability | Before F04A | Verify supported import path and field licenses. Document the source; do not introduce an unreviewed alternate provider or scrape as a fallback. |
| Global MusicBrainz rate limit | F04A | Concurrent-client test shows the shared gate controls outbound calls; debounce alone is insufficient. |
| Normalization disagreement | F03A | SQL/client fixtures agree on whitespace and case behavior, including representative Unicode input. |
| Consent and history privacy | F02A/F05A | Disclose directory visibility and default-on comparison sharing at signup and show enabled sharing on the dashboard; verify opt-out blocks new comparisons while existing snapshots retain participant-only access. The one-time existing-profile update increments affected settings revisions and preserves later opt-outs. |

## 5. Rules for each model work session

1. Select the next dependency-ready packet, not an entire milestone containing several packets.
2. Read its feature document, shared contract, direct dependency interfaces, and relevant implementation/tests only.
3. Target 8,000-16,000 input tokens, leaving room for implementation and verification. Split early if the packet exceeds the index's context budget.
4. Implement its public API and behavior together; keep the API docs and fixtures synchronized.
5. Run the smallest relevant tests plus typecheck/build when appropriate. Do not count unrun checks as passed.
6. Update the existing feature document with status, exact files/migrations, test outcomes, blockers, and the next step.
7. Start the next packet using that handoff, not a reconstruction of the entire chat.

Maintain one active packet by default. A packet with failing authorization, rollback, or persistence checks is not complete even if its UI looks finished.

## 6. Scope protection and deferral

Never cut ownership checks, transactional saves, consent, deterministic scoring, visible errors, or saved-result integrity to meet a date.

If time is constrained:

1. Deliver Checkpoint B as an explicitly labeled core demonstration.
2. Keep catalog integration and release gates listed as incomplete.
3. Prefer simpler lists, local state, and restrained styling over additional frameworks or animations.
4. Do not claim the requested initial MVP is finished until Checkpoint D, or explicitly agree on a local-only deliverable instead.

### P2 backlog

Ranked follow-up work, subject to team confirmation:

1. Optional AI explanations and recommendations, with separate consent, provider-failure handling, and documented API; AI never changes the deterministic score.
2. Matching improvements such as aliases or catalog-ID identity, with a new algorithm version and migration/compatibility decisions.
3. Profile discovery or invitations, only after defining privacy and abuse controls.
4. Group/party matching, playlist exports, streaming imports, and DJ tooling as separately scoped releases.

Do not implement these during P0/P1 merely because a model can generate them quickly.

## 7. Effort and scheduling

The original **28-45 engineering-hour** range remains a rough baseline, excluding optional AI. The conversational **15-25 hands-on hours with AI** was an optimistic estimate, not a verified delivery schedule. Neither estimate guarantees completion of these refined contracts, integration work, or external account setup.

Re-estimate after Checkpoint A using actual packet duration and blockers. Assign calendar dates and owners only once contributor availability is known. Prioritize completed, tested vertical slices over a large amount of generated but unverified code.

## Next action

Verify that the approved push to `main` completes the Cloudflare Worker deployment, then retest password reset there using the same browser profile that requested the link. Continue **F07A** with signed-in catalog search and a live two-account comparison/history journey; complete deep-link and clean-setup checks before claiming release readiness. Do not provision remote resources or alter production schemas merely because they appear on this roadmap.
