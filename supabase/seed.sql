-- Demo listener personas (see docs/DEMO-PERSONAS.md).
--
-- Twelve fictional profiles that anyone can compare against by handle (for example @demo_rock).
-- Each persona is mostly distinct, with a few deliberate "bridge" items shared with neighbouring tastes.
--
-- Safe to re-run: profiles are upserted and their preferences replaced. Runs automatically on
-- `supabase db reset` locally. In production it must be run deliberately (see the doc).
--
-- The backing auth users cannot sign in: they have no password, an unroutable example.com email,
-- and are banned until 2999.
do $$
declare
  persona record;
  v_profile uuid;
  v_ids uuid[] := '{}';
begin
  for persona in select * from (values
    ('d0000000-0000-4000-8000-000000000001'::uuid, 'demo_rock', 'Demo: Rock Rotation', $j${
      "artist": ["Foo Fighters", "Arctic Monkeys", "Red Hot Chili Peppers", "Queen", "Nirvana", "Linkin Park", "Fleetwood Mac", "The Beatles"],
      "genre": ["rock", "alternative rock", "classic rock", "grunge"],
      "song": ["Everlong", "Do I Wanna Know?", "Bohemian Rhapsody", "Dreams", "Mr. Brightside"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000002'::uuid, 'demo_pop', 'Demo: Pop Charts', $j${
      "artist": ["Taylor Swift", "Sabrina Carpenter", "Chappell Roan", "Olivia Rodrigo", "Billie Eilish", "Dua Lipa", "Ariana Grande", "Ed Sheeran"],
      "genre": ["pop", "dance pop", "synth-pop"],
      "song": ["Espresso", "Good Luck, Babe!", "Cruel Summer", "Birds of a Feather", "APT."]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000003'::uuid, 'demo_edm', 'Demo: EDM & Festival', $j${
      "artist": ["Fred again..", "Calvin Harris", "Skrillex", "Martin Garrix", "Swedish House Mafia", "Daft Punk", "Disclosure", "Dua Lipa"],
      "genre": ["edm", "house", "techno", "drum and bass", "synth-pop", "amapiano"],
      "song": ["One More Time", "Don't You Worry Child", "Levitating", "Summer", "Latch"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000004'::uuid, 'demo_bollywood', 'Demo: Bollywood & Punjabi', $j${
      "artist": ["Arijit Singh", "Shreya Ghoshal", "Pritam", "A.R. Rahman", "Diljit Dosanjh", "AP Dhillon", "Karan Aujla", "Ed Sheeran"],
      "genre": ["bollywood", "filmi", "punjabi pop", "bhangra"],
      "song": ["Tum Hi Ho", "Kesariya", "Brown Munde", "Jai Ho", "Softly"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000005'::uuid, 'demo_funk_soul', 'Demo: Funk & Soul', $j${
      "artist": ["Stevie Wonder", "Aretha Franklin", "Marvin Gaye", "Earth, Wind & Fire", "Parliament", "Prince", "Anderson .Paak", "Khruangbin"],
      "genre": ["funk", "soul", "motown", "neo soul"],
      "song": ["Superstition", "September", "What's Going On", "Respect", "Leave the Door Open"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000006'::uuid, 'demo_hiphop_rnb', 'Demo: Hip-Hop & R&B', $j${
      "artist": ["Kendrick Lamar", "SZA", "Drake", "Travis Scott", "Tyler, The Creator", "Doechii", "Frank Ocean", "Post Malone"],
      "genre": ["hip hop", "r&b", "rap", "trap", "neo soul"],
      "song": ["Not Like Us", "Luther", "Saturn", "One Dance", "Pink + White"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000007'::uuid, 'demo_afrobeats', 'Demo: Afrobeats & Amapiano', $j${
      "artist": ["Burna Boy", "Wizkid", "Tems", "Rema", "Davido", "Ayra Starr", "Tyla", "Asake"],
      "genre": ["afrobeats", "amapiano", "afropop", "highlife", "dancehall"],
      "song": ["Calm Down", "Essence", "Water", "Last Last", "One Dance"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000008'::uuid, 'demo_country', 'Demo: Country Roads', $j${
      "artist": ["Morgan Wallen", "Zach Bryan", "Chris Stapleton", "Luke Combs", "Shaboozey", "Lainey Wilson", "Taylor Swift", "Post Malone"],
      "genre": ["country", "americana", "country pop", "folk"],
      "song": ["A Bar Song (Tipsy)", "Tennessee Whiskey", "Last Night", "Fast Car", "I Had Some Help"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000009'::uuid, 'demo_latin', 'Demo: Latin Hits', $j${
      "artist": ["Bad Bunny", "Karol G", "Peso Pluma", "Feid", "Shakira", "Rauw Alejandro", "Grupo Frontera", "J Balvin"],
      "genre": ["reggaeton", "latin pop", "regional mexican", "trap", "dancehall"],
      "song": ["DtMF", "Tití Me Preguntó", "Ella Baila Sola", "Hips Don't Lie", "Provenza"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000010'::uuid, 'demo_lofi_dev', 'Demo: Lo-fi Focus (developer)', $j${
      "artist": ["Tycho", "Bonobo", "Nujabes", "Boards of Canada", "C418", "Hans Zimmer", "Daft Punk", "Khruangbin"],
      "genre": ["lo-fi hip hop", "ambient", "downtempo", "video game music", "synthwave"],
      "song": ["Awake", "Kerala", "Feather", "Sweden", "Time"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000011'::uuid, 'demo_india_classic', 'Demo: Classical & Retro India (teacher)', $j${
      "artist": ["Lata Mangeshkar", "Kishore Kumar", "Mohammed Rafi", "Ravi Shankar", "Zakir Hussain", "M.S. Subbulakshmi", "A.R. Rahman", "The Beatles"],
      "genre": ["hindustani classical", "carnatic", "ghazal", "filmi"],
      "song": ["Lag Jaa Gale", "Pal Pal Dil Ke Paas", "Chura Liya Hai Tumne", "Jai Ho", "Here Comes the Sun"]}$j$::jsonb),

    ('d0000000-0000-4000-8000-000000000012'::uuid, 'demo_campus_indie', 'Demo: Campus Indie', $j${
      "artist": ["Phoebe Bridgers", "boygenius", "Mitski", "Clairo", "Vampire Weekend", "The 1975", "Noah Kahan", "Arctic Monkeys"],
      "genre": ["indie rock", "indie pop", "bedroom pop", "folk", "alternative rock"],
      "song": ["Motion Sickness", "My Love Mine All Mine", "Stick Season", "Mr. Brightside", "Birds of a Feather"]}$j$::jsonb)
  ) as t(owner_id, handle, display_name, prefs)
  loop
    insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', persona.owner_id, 'authenticated', 'authenticated',
      persona.handle || '@example.com', null, now(),
      '{"provider":"email","providers":["email"],"demo":true}', '{"demo":true}', now(), now(), '2999-01-01',
      '', '', '', '')
    on conflict (id) do nothing;

    insert into public.music_profiles(owner_id, display_name, handle, comparison_enabled)
    values (persona.owner_id, persona.display_name, persona.handle, true)
    on conflict (owner_id) do update
      set display_name = excluded.display_name, handle = excluded.handle, comparison_enabled = true
    returning id into v_profile;

    delete from public.music_preferences where profile_id = v_profile;
    insert into public.music_preferences(profile_id, type, display_value, normalized_value)
    select v_profile, e.kind, v.value, private.normalize(v.value)
    from jsonb_each(persona.prefs) e(kind, list), jsonb_array_elements_text(e.list) v(value);
    update public.music_profiles set preference_revision = preference_revision + 1 where id = v_profile;

    v_ids := v_ids || persona.owner_id;
  end loop;

  -- F08 AI consent: the personas are fictional, so they opt in. Skipped where F08A isn't applied yet.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'music_profiles' and column_name = 'ai_enabled') then
    execute 'update public.music_profiles set ai_enabled = true where owner_id = any($1)' using v_ids;
  end if;
end $$;
