alter table public.music_profiles
  alter column comparison_enabled set default true;

create or replace function public.ensure_my_profile(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.music_profiles; name text; handle text; comparison_enabled boolean;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  select * into p from public.music_profiles where owner_id=auth.uid();
  if found then return private.ok(private.profile_json(p)); end if;
  name:=btrim(p_request->>'displayName'); handle:=lower(btrim(p_request->>'handle'));
  if not private.valid_keys(p_request,array['displayName','handle','comparisonEnabled']) or
    jsonb_typeof(p_request->'displayName') is distinct from 'string' or
    jsonb_typeof(p_request->'handle') is distinct from 'string' or
    (p_request ? 'comparisonEnabled' and jsonb_typeof(p_request->'comparisonEnabled') is distinct from 'boolean') or
    char_length(name) not between 1 and 80 or handle !~ '^[a-z0-9_]{3,30}$' then
    return private.fail('VALIDATION_FAILED','Use a display name (1–80 characters) and handle (3–30 letters, digits or underscores).');
  end if;
  comparison_enabled:=coalesce((p_request->>'comparisonEnabled')::boolean,true);
  begin
    insert into public.music_profiles(owner_id,display_name,handle,comparison_enabled)
      values(auth.uid(),name,handle,comparison_enabled) returning * into p;
  exception when unique_violation then
    select * into p from public.music_profiles where owner_id=auth.uid();
    if not found then return private.fail('HANDLE_TAKEN','That handle is already in use.'); end if;
  end;
  return private.ok(private.profile_json(p));
end $$;
