# Demo listener personas

Twelve fictional profiles for demos and testing. Anyone signed in can compare against one by entering its handle, for example `demo_afrobeats`. The data is in [`supabase/seed.sql`](../supabase/seed.sql) and tested by [`tests/demo-personas.test.ts`](../tests/demo-personas.test.ts).

Each persona has 8 artists, 3–6 genres and 5 songs, which is about the size of a typical real profile. The personas are mostly distinct: every pair scores under 10% overlap. Each one also shares 1–3 "bridge" items with related tastes, so comparisons show something in common instead of a flat 0%.

## Who they're for

The audience is developers, a teacher from India, college students in the Northeast, and African and Indian students. Each group gets at least one persona close to their own taste and some that are far from it.

| Handle | Persona | Main audience | Bridges to |
| --- | --- | --- | --- |
| `demo_rock` | Rock Rotation: classic and modern rock | Students, developers | Campus Indie, Classical & Retro India (The Beatles) |
| `demo_pop` | Pop Charts | Northeast students | EDM, Country (Taylor Swift), Bollywood (Ed Sheeran), Campus Indie |
| `demo_edm` | EDM & Festival | Students | Pop (Dua Lipa, synth-pop), Afrobeats (amapiano), Lo-fi (Daft Punk) |
| `demo_bollywood` | Bollywood & Punjabi | Indian students | Classical & Retro India (A.R. Rahman, filmi, "Jai Ho"), Pop (Ed Sheeran) |
| `demo_funk_soul` | Funk & Soul | Developers, teacher | Hip-Hop & R&B (neo soul), Lo-fi (Khruangbin) |
| `demo_hiphop_rnb` | Hip-Hop & R&B | Students | Afrobeats ("One Dance"), Latin (trap), Country (Post Malone), Funk & Soul |
| `demo_afrobeats` | Afrobeats & Amapiano | African students | Hip-Hop & R&B, Latin (dancehall), EDM (amapiano) |
| `demo_country` | Country Roads | Students | Pop (Taylor Swift), Hip-Hop & R&B (Post Malone), Campus Indie (folk) |
| `demo_latin` | Latin Hits | Students | Hip-Hop & R&B (trap), Afrobeats (dancehall) |
| `demo_lofi_dev` | Lo-fi Focus: music for coding | Developers | EDM (Daft Punk), Funk & Soul (Khruangbin) |
| `demo_india_classic` | Classical & Retro India: Hindustani, Carnatic, old filmi songs | Teacher from India | Bollywood, Rock (The Beatles) |
| `demo_campus_indie` | Campus Indie, including Noah Kahan from Vermont | Northeast students | Rock, Pop, Country |

The highest-overlap pairs are Bollywood and Classical & Retro India (9.7%) and Campus Indie and Rock (9.4%). The scores move if the persona lists change; the test only requires every pair to stay under 20% and each persona to share something with at least two others.

## Why these genres

The mix follows Luminate's 2025 US year-end figures for on-demand audio streams:
- R&B/hip-hop was the largest genre (349.9B streams).
- Rock was second (260.5B) and gained the most market share.
- Pop (167.2B), country (122.5B) and Latin (120.9B) came next.
- Bad Bunny's *Debí Tirar Más Fotos* drew about 3B US streams.

The other personas cover the target audience rather than the US totals: Afrobeats and amapiano for African students, Bollywood/Punjabi and classical/retro Indian music for Indian students and the teacher, lo-fi and game soundtracks for developers, and Northeast campus indie. Surveys of Gen Z listening say most young listeners don't stick to one genre, which is why every persona has bridges.

Sources: [Luminate 2025 Year-End Music Report](https://luminatedata.com/reports/yearend-music-industry-report-2025), [AP: Christian, rock and Latin lead US growth](https://wtop.com/national/2026/01/music-streams-hit-5-trillion-in-2025-christian-rock-and-latin-lead-growth-in-the-us/), [Music Business Worldwide summary](https://www.musicbusinessworldwide.com/half-of-all-paid-music-streams-globally-derive-from-just-4-countries-and-other-highlights-from-luminates-latest-report), [YPulse 2025 Music Report](https://www.ypulse.com/report/2025/06/25/music-report-6/). No US Afrobeats figure was found, so that persona is based on the audience, not stream counts.

## How the accounts work

- Each persona has an auth user with a fixed ID (`d0000000-0000-4000-8000-0000000000NN`).
- Its email is `<handle>@example.com`, which can't receive mail. It has no password and is banned until 2999, so nobody can sign in as a persona.
- Sharing is on, so anyone can find a persona by its exact handle.
- Every preference is a custom entry, normalized the same way `save_my_preferences` normalizes them.
- AI insights consent is on where the F08A migration is applied. The personas are fictional, so comparing against one can show F08 insights once AI is enabled.
- The seed can be re-run safely. It updates the profiles in place and replaces their preferences.

## Running it

**Locally:** `supabase db reset` runs `supabase/seed.sql` automatically after the migrations.

**Production:** this doesn't happen automatically, and it creates 12 accounts and public profiles on the live project, so only do it on purpose. Run the contents of `supabase/seed.sql` in the Supabase dashboard SQL editor for project `cilswqtuswmuktzhifsn`. The seed fails if a real user already has one of the `demo_*` handles.

**Removing them:** delete the persona users. Their profiles and preferences are deleted with them. Saved comparisons that include a persona block the delete, because `matches` doesn't cascade, so delete those comparisons first.

```sql
delete from public.matches where profile_a_id in (select id from public.music_profiles where owner_id::text like 'd0000000-0000-4000-8000-%')
  or profile_b_id in (select id from public.music_profiles where owner_id::text like 'd0000000-0000-4000-8000-%');
delete from auth.users where id::text like 'd0000000-0000-4000-8000-%';
```
