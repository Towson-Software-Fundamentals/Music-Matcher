create schema if not exists private;
revoke all on schema private from public;

create table public.music_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  comparison_enabled boolean not null default false,
  revision integer not null default 1,
  preference_revision integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('artist','genre','song')),
  external_id uuid not null,
  display_value text not null check (char_length(display_value) between 1 and 200),
  subtitle text,
  source_url text not null,
  attribution text not null default 'MusicBrainz',
  unique(type, external_id)
);
create table public.music_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.music_profiles(id) on delete cascade,
  type text not null check (type in ('artist','genre','song')),
  display_value text not null,
  normalized_value text not null,
  catalog_item_id uuid references public.catalog_items(id),
  unique(profile_id, type, normalized_value)
);
create table public.matches (
  id uuid primary key,
  profile_a_id uuid not null references public.music_profiles(id),
  profile_b_id uuid not null references public.music_profiles(id),
  request_id uuid not null,
  snapshot jsonb not null,
  score numeric not null check (score between 0 and 1),
  created_at timestamptz not null default clock_timestamp(),
  check (profile_a_id <> profile_b_id),
  unique(profile_a_id, request_id)
);
create table private.catalog_cache (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);
create table private.provider_gate (
  id integer primary key check (id=1),
  next_at timestamptz not null default '-infinity'
);
insert into private.provider_gate(id) values(1);
create table private.search_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  count integer not null
);

alter table public.music_profiles enable row level security;
alter table public.music_preferences enable row level security;
alter table public.catalog_items enable row level security;
alter table public.matches enable row level security;
create policy own_profile on public.music_profiles for select to authenticated using (owner_id=auth.uid());
create policy own_preferences on public.music_preferences for select to authenticated
  using (profile_id in (select id from public.music_profiles where owner_id=auth.uid()));
create policy participant_results on public.matches for select to authenticated
  using (exists(select 1 from public.music_profiles p where p.owner_id=auth.uid() and p.id in (profile_a_id,profile_b_id)));
create policy catalog_read on public.catalog_items for select to authenticated using (true);
revoke all on public.music_profiles, public.music_preferences, public.matches, public.catalog_items from anon, authenticated;
grant select on public.music_profiles, public.music_preferences, public.matches, public.catalog_items to authenticated;
grant all on public.catalog_items to service_role;

create function private.ok(value jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('data',value,'error',null)
$$;
create function private.fail(code text, message text) returns jsonb language sql immutable as $$
  select jsonb_build_object('data',null,'error',jsonb_build_object('code',code,'message',message))
$$;
create function private.valid_keys(value jsonb, allowed text[]) returns boolean language sql immutable as $$
  select jsonb_typeof(value)='object' and not exists(
    select 1 from jsonb_object_keys(case when jsonb_typeof(value)='object' then value else '{}' end) k
    where not k=any(allowed))
$$;
create function private.is_uuid(value text) returns boolean language sql immutable as $$
  select coalesce(value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$$;
create function private.normalize(value text) returns text language sql immutable as $$
  select lower(btrim(regexp_replace(translate(value,
    chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279),
    repeat(' ',19)), '[[:space:]]+', ' ', 'g')))
$$;
create function private.profile_json(p public.music_profiles) returns jsonb language sql stable as $$
  select jsonb_build_object('id',p.id,'displayName',p.display_name,'handle',p.handle,
    'comparisonEnabled',p.comparison_enabled,'revision',p.revision)
$$;
create function private.catalog_json(c public.catalog_items) returns jsonb language sql stable as $$
  select jsonb_build_object('id',c.id,'type',c.type,'displayValue',c.display_value,'subtitle',c.subtitle,
    'provider','musicbrainz','externalId',c.external_id,'sourceUrl',c.source_url,'attribution',c.attribution)
$$;
create function private.preference_values(profile uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('type',p.type,'displayValue',p.display_value,
    'normalizedValue',p.normalized_value) order by p.type collate "C",p.normalized_value collate "C"),'[]')
  from public.music_preferences p where p.profile_id=profile
$$;
create function private.preference_set(profile uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('revision',m.preference_revision,'items',coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'type',p.type,'displayValue',p.display_value,
      'normalizedValue',p.normalized_value,'catalogItem',case when c.id is null then null
        else private.catalog_json(c)||jsonb_build_object('displayValue',p.display_value) end)
      order by p.type collate "C",p.normalized_value collate "C")
    from public.music_preferences p left join public.catalog_items c on c.id=p.catalog_item_id
    where p.profile_id=m.id),'[]')) from public.music_profiles m where m.id=profile
$$;

create function public.get_my_profile() returns jsonb language sql security definer set search_path='' as $$
  select case when auth.uid() is null then private.fail('UNAUTHENTICATED','Please sign in.')
    else private.ok((select private.profile_json(p) from public.music_profiles p where owner_id=auth.uid())) end
$$;
create function public.ensure_my_profile(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.music_profiles; name text; handle text;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  select * into p from public.music_profiles where owner_id=auth.uid();
  if found then return private.ok(private.profile_json(p)); end if;
  name:=btrim(p_request->>'displayName'); handle:=lower(btrim(p_request->>'handle'));
  if not private.valid_keys(p_request,array['displayName','handle']) or
    jsonb_typeof(p_request->'displayName') is distinct from 'string' or
    jsonb_typeof(p_request->'handle') is distinct from 'string' or
    char_length(name) not between 1 and 80 or handle !~ '^[a-z0-9_]{3,30}$' then
    return private.fail('VALIDATION_FAILED','Use a display name (1–80 characters) and handle (3–30 letters, digits or underscores).');
  end if;
  begin
    insert into public.music_profiles(owner_id,display_name,handle) values(auth.uid(),name,handle) returning * into p;
  exception when unique_violation then
    select * into p from public.music_profiles where owner_id=auth.uid();
    if not found then return private.fail('HANDLE_TAKEN','That handle is already in use.'); end if;
  end;
  return private.ok(private.profile_json(p));
end $$;
create function public.update_my_profile(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.music_profiles; name text; v_handle text;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  select * into p from public.music_profiles where owner_id=auth.uid() for update;
  if not found then return private.fail('PROFILE_NOT_READY','Create your profile first.'); end if;
  if not private.valid_keys(p_request,array['displayName','handle','comparisonEnabled','expectedRevision'])
    or jsonb_typeof(p_request->'displayName') is distinct from 'string'
    or jsonb_typeof(p_request->'handle') is distinct from 'string'
    or jsonb_typeof(p_request->'comparisonEnabled') is distinct from 'boolean'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'number'
    or (p_request->>'expectedRevision') !~ '^[0-9]{1,9}$' then
    return private.fail('VALIDATION_FAILED','Invalid profile settings.');
  end if;
  if (p_request->>'expectedRevision')::int<>p.revision then return private.fail('STALE_WRITE','Settings changed. Reload before saving.'); end if;
  name:=btrim(p_request->>'displayName'); v_handle:=lower(btrim(p_request->>'handle'));
  if char_length(name) not between 1 and 80 or v_handle !~ '^[a-z0-9_]{3,30}$' then
    return private.fail('VALIDATION_FAILED','Check your display name and handle.');
  end if;
  begin
    update public.music_profiles set display_name=name,handle=v_handle,
      comparison_enabled=(p_request->>'comparisonEnabled')::boolean,revision=revision+1 where id=p.id returning * into p;
  exception when unique_violation then return private.fail('HANDLE_TAKEN','That handle is already in use.');
  end;
  return private.ok(private.profile_json(p));
end $$;
create function public.lookup_comparison_profile(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.music_profiles;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  if not private.valid_keys(p_request,array['handle']) or jsonb_typeof(p_request->'handle') is distinct from 'string' then
    return private.fail('VALIDATION_FAILED','Enter an exact handle.');
  end if;
  select * into p from public.music_profiles where handle=lower(btrim(p_request->>'handle')) and comparison_enabled;
  if not found then return private.fail('PROFILE_UNAVAILABLE','No available profile with that handle.'); end if;
  return private.ok(jsonb_build_object('id',p.id,'displayName',p.display_name,'handle',p.handle));
end $$;
create function public.get_my_preferences() returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  select id into profile from public.music_profiles where owner_id=auth.uid();
  if not found then return private.fail('PROFILE_NOT_READY','Create your profile first.'); end if;
  return private.ok(private.preference_set(profile));
end $$;
create function public.save_my_preferences(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.music_profiles; item jsonb; label text; normalized text; category text;
  catalog uuid; keys text[]:='{}'; prepared jsonb:='[]'; index integer:=0;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  select * into p from public.music_profiles where owner_id=auth.uid() for update;
  if not found then return private.fail('PROFILE_NOT_READY','Create your profile first.'); end if;
  if not private.valid_keys(p_request,array['expectedRevision','items'])
    or octet_length(p_request::text)>65536
    or jsonb_typeof(p_request->'items') is distinct from 'array'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'number'
    or (p_request->>'expectedRevision') !~ '^[0-9]{1,9}$' then
    return private.fail('VALIDATION_FAILED','Invalid preference request.');
  end if;
  if jsonb_array_length(p_request->'items')>100 then return private.fail('VALIDATION_FAILED','Choose at most 100 preferences.'); end if;
  if (p_request->>'expectedRevision')::int<>p.preference_revision then return private.fail('STALE_WRITE','Preferences changed. Reload and review your draft.'); end if;
  for item in select value from jsonb_array_elements(p_request->'items') loop
    category:=item->>'type'; catalog:=null;
    if category is null or category not in ('artist','genre','song') then
      return private.fail('VALIDATION_FAILED','Unsupported preference type.');
    end if;
    if item->>'source'='custom' then
      if not private.valid_keys(item,array['type','source','displayValue']) or jsonb_typeof(item->'displayValue') is distinct from 'string' then
        return private.fail('VALIDATION_FAILED','Invalid custom preference.');
      end if;
      label:=btrim(item->>'displayValue');
    elsif item->>'source'='catalog' then
      if not private.valid_keys(item,array['type','source','catalogItemId']) or not private.is_uuid(item->>'catalogItemId') then
        return private.fail('VALIDATION_FAILED','Invalid catalog selection.');
      end if;
      select id,display_value into catalog,label from public.catalog_items where id=(item->>'catalogItemId')::uuid and type=category;
      if not found then return private.fail('VALIDATION_FAILED','Catalog selection is unavailable. Search again or add a custom entry.'); end if;
    else return private.fail('VALIDATION_FAILED','Choose custom or catalog source.');
    end if;
    normalized:=private.normalize(label);
    if normalized='' or char_length(label)>200 then return private.fail('VALIDATION_FAILED','Each preference needs 1–200 characters.'); end if;
    if (category||':'||normalized)=any(keys) then
      return jsonb_build_object('data',null,'error',jsonb_build_object('code','VALIDATION_FAILED',
        'message','Duplicate preferences are not allowed.','issues',jsonb_build_array(
          jsonb_build_object('path','items.'||index||'.displayValue','code','duplicate','message','Remove this duplicate.'))));
    end if;
    keys:=array_append(keys,category||':'||normalized);
    prepared:=prepared||jsonb_build_array(jsonb_build_object('type',category,'label',label,'normalized',normalized,'catalog',catalog));
    index:=index+1;
  end loop;
  delete from public.music_preferences where profile_id=p.id;
  insert into public.music_preferences(profile_id,type,display_value,normalized_value,catalog_item_id)
    select p.id,x->>'type',x->>'label',x->>'normalized',(x->>'catalog')::uuid from jsonb_array_elements(prepared) x;
  update public.music_profiles set preference_revision=preference_revision+1 where id=p.id;
  return private.ok(private.preference_set(p.id));
end $$;

create function private.calculate_overlap(a jsonb,b jsonb) returns jsonb language sql immutable as $$
  with aa as (select value v from jsonb_array_elements(a)),
  bb as (select value v from jsonb_array_elements(b)),
  shared as (select aa.v av,bb.v bv from aa join bb on
    aa.v->>'type'=bb.v->>'type' and aa.v->>'normalizedValue'=bb.v->>'normalizedValue'),
  counts as (select (select count(*) from shared) i,jsonb_array_length(a)+jsonb_array_length(b)-(select count(*) from shared) u)
  select jsonb_build_object('score',case when u=0 then 0 else i::numeric/u end,'intersectionCount',i,'unionCount',u,
    'shared',coalesce((select jsonb_agg(jsonb_build_object('type',av->>'type','normalizedValue',av->>'normalizedValue',
      'displayValueA',av->>'displayValue','displayValueB',bv->>'displayValue')
      order by av->>'type' collate "C",av->>'normalizedValue' collate "C") from shared),'[]'),
    'onlyA',coalesce((select jsonb_agg(v order by v->>'type' collate "C",v->>'normalizedValue' collate "C") from aa
      where not exists(select 1 from shared where av=aa.v)),'[]'),
    'onlyB',coalesce((select jsonb_agg(v order by v->>'type' collate "C",v->>'normalizedValue' collate "C") from bb
      where not exists(select 1 from shared where bv=bb.v)),'[]')) from counts
$$;
create function public.create_comparison(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.music_profiles; b public.music_profiles; old public.matches; target uuid; request uuid;
  av jsonb; bv jsonb; result jsonb; match_id uuid:=gen_random_uuid(); moment timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  if not private.valid_keys(p_request,array['targetProfileId','requestId']) or
    not private.is_uuid(p_request->>'targetProfileId') or not private.is_uuid(p_request->>'requestId') then
    return private.fail('VALIDATION_FAILED','Invalid comparison request.');
  end if;
  target:=(p_request->>'targetProfileId')::uuid; request:=(p_request->>'requestId')::uuid;
  select * into a from public.music_profiles where owner_id=auth.uid();
  if not found then return private.fail('PROFILE_NOT_READY','Create your profile first.'); end if;
  perform 1 from public.music_profiles where id in (a.id,target) order by id for update;
  select * into old from public.matches where profile_a_id=a.id and request_id=request;
  if found then
    if old.profile_b_id<>target then return private.fail('VALIDATION_FAILED','Request ID belongs to another target.'); end if;
    return private.ok(jsonb_build_object('id',old.id,'createdAt',old.created_at));
  end if;
  if a.id=target then return private.fail('SAME_PROFILE','Choose someone other than yourself.'); end if;
  select * into a from public.music_profiles where id=a.id;
  select * into b from public.music_profiles where id=target and comparison_enabled;
  if not found then return private.fail('PROFILE_UNAVAILABLE','That profile is unavailable for comparison.'); end if;
  if not a.comparison_enabled then return private.fail('FORBIDDEN','Enable comparison sharing in Settings first.'); end if;
  select private.preference_values(a.id),private.preference_values(b.id) into av,bv;
  if jsonb_array_length(av)=0 or jsonb_array_length(bv)=0 then
    return private.fail('INSUFFICIENT_PREFERENCES','Both profiles need at least one preference.');
  end if;
  result:=private.calculate_overlap(av,bv)||jsonb_build_object('id',match_id,'createdAt',moment,'algorithmVersion','jaccard-text-v1',
    'participantA',jsonb_build_object('profileId',a.id,'displayName',a.display_name,'handle',a.handle,
      'preferenceRevision',a.preference_revision,'preferences',av),
    'participantB',jsonb_build_object('profileId',b.id,'displayName',b.display_name,'handle',b.handle,
      'preferenceRevision',b.preference_revision,'preferences',bv));
  insert into public.matches(id,profile_a_id,profile_b_id,request_id,snapshot,score,created_at)
    values(match_id,a.id,b.id,request,result,(result->>'score')::numeric,moment);
  return private.ok(jsonb_build_object('id',match_id,'createdAt',moment));
end $$;
create function public.get_comparison(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  if not private.valid_keys(p_request,array['id']) or not private.is_uuid(p_request->>'id') then return private.fail('VALIDATION_FAILED','Invalid result ID.'); end if;
  select m.snapshot into result from public.matches m join public.music_profiles p on p.owner_id=auth.uid()
    where m.id=(p_request->>'id')::uuid and p.id in (m.profile_a_id,m.profile_b_id);
  if not found then return private.fail('NOT_FOUND','This result is unavailable.'); end if;
  return private.ok(result);
end $$;
create function public.list_my_comparisons(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid; size integer:=10; records jsonb; cursor jsonb:=null; before_time timestamptz; before_id uuid;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  if not private.valid_keys(p_request,array['limit','before']) then return private.fail('VALIDATION_FAILED','Invalid history request.'); end if;
  if p_request ? 'limit' then
    if jsonb_typeof(p_request->'limit') is distinct from 'number' or (p_request->>'limit') !~ '^[0-9]{1,2}$' then return private.fail('VALIDATION_FAILED','Invalid page size.'); end if;
    size:=(p_request->>'limit')::int;
  end if;
  if size not between 1 and 20 then return private.fail('VALIDATION_FAILED','Page size must be 1–20.'); end if;
  if p_request ? 'before' then
    if not private.valid_keys(p_request->'before',array['createdAt','id']) or not private.is_uuid(p_request->'before'->>'id') then return private.fail('VALIDATION_FAILED','Invalid history cursor.'); end if;
    begin
      before_time:=(p_request->'before'->>'createdAt')::timestamptz;
      before_id:=(p_request->'before'->>'id')::uuid;
      if before_time is null or not isfinite(before_time) then return private.fail('VALIDATION_FAILED','Invalid cursor time.'); end if;
    exception when invalid_datetime_format or datetime_field_overflow then return private.fail('VALIDATION_FAILED','Invalid cursor time.');
    end;
  end if;
  select id into profile from public.music_profiles where owner_id=auth.uid();
  if not found then return private.fail('PROFILE_NOT_READY','Create your profile first.'); end if;
  select coalesce(jsonb_agg(x.row order by x.created_at desc,x.id desc),'[]') into records from (
    select m.created_at,m.id,jsonb_build_object('id',m.id,'createdAt',m.created_at,'score',m.score,
      'algorithmVersion','jaccard-text-v1','otherParticipant',
      jsonb_build_object('displayName',m.snapshot->(case when m.profile_a_id=profile then 'participantB' else 'participantA' end)->>'displayName',
        'handle',m.snapshot->(case when m.profile_a_id=profile then 'participantB' else 'participantA' end)->>'handle')) row
    from public.matches m where profile in (m.profile_a_id,m.profile_b_id)
      and (before_time is null or (m.created_at,m.id)<(before_time,before_id))
    order by m.created_at desc,m.id desc limit size+1
  ) x;
  if jsonb_array_length(records)>size then
    cursor:=jsonb_build_object('createdAt',records->(size-1)->>'createdAt','id',records->(size-1)->>'id');
    records:=records-size;
  end if;
  return private.ok(jsonb_build_object('items',records,'nextCursor',cursor));
end $$;
create function public.list_genres() returns jsonb language sql security definer set search_path='' as $$
  select case when auth.uid() is null then private.fail('UNAUTHENTICATED','Please sign in.') else
    private.ok(jsonb_build_object('items',coalesce((select jsonb_agg(private.catalog_json(c) order by display_value collate "C")
      from public.catalog_items c where type='genre'),'[]'))) end
$$;

create function public.catalog_gateway(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached jsonb; next_time timestamptz; moment timestamptz:=clock_timestamp(); usage integer; actor uuid;
begin
  if p_request->>'action'='read' then
    actor:=(p_request->>'userId')::uuid;
    insert into private.search_limits(owner_id,window_start,count) values(actor,moment,1)
      on conflict(owner_id) do update set
        count=case when private.search_limits.window_start<moment-interval '1 minute' then 1 else private.search_limits.count+1 end,
        window_start=case when private.search_limits.window_start<moment-interval '1 minute' then moment else private.search_limits.window_start end
      returning count into usage;
    if usage>30 then return jsonb_build_object('limited',true,'retryAfterSeconds',60); end if;
    select value into cached from private.catalog_cache where key=p_request->>'key' and expires_at>moment;
    if found then return jsonb_build_object('cached',cached); end if;
    select next_at into next_time from private.provider_gate where id=1 for update;
    if next_time>clock_timestamp() then return jsonb_build_object('limited',true,'retryAfterSeconds',1); end if;
    update private.provider_gate set next_at=clock_timestamp()+interval '1 second' where id=1;
    return jsonb_build_object('reserved',true);
  elsif p_request->>'action'='cache' then
    insert into private.catalog_cache(key,value,expires_at) values(p_request->>'key',p_request->'value',moment+interval '24 hours')
      on conflict(key) do update set value=excluded.value,expires_at=excluded.expires_at;
    return '{"saved":true}'::jsonb;
  end if;
  raise exception 'Unsupported catalog action';
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.get_my_profile(),public.ensure_my_profile(jsonb),public.update_my_profile(jsonb),
  public.lookup_comparison_profile(jsonb),public.get_my_preferences(),public.save_my_preferences(jsonb),
  public.create_comparison(jsonb),public.get_comparison(jsonb),public.list_my_comparisons(jsonb),
  public.list_genres(),public.catalog_gateway(jsonb) from public,anon,authenticated;
grant execute on function public.get_my_profile(),public.ensure_my_profile(jsonb),public.update_my_profile(jsonb),
  public.lookup_comparison_profile(jsonb),public.get_my_preferences(),public.save_my_preferences(jsonb),
  public.create_comparison(jsonb),public.get_comparison(jsonb),public.list_my_comparisons(jsonb),
  public.list_genres() to authenticated;
grant execute on function public.catalog_gateway(jsonb) to service_role;
