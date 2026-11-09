update public.music_profiles
set comparison_enabled = true, revision = revision + 1
where comparison_enabled = false;
