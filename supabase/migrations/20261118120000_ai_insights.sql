-- F08A: AI insight consent, storage, and quota gate.
-- AI is opt-in per profile (default off). Insights are generated only by the
-- comparison-insight Edge Function (service role) and are readable by participants.

alter table public.music_profiles
  add column ai_enabled boolean not null default false;

create table public.comparison_insights (
  match_id uuid not null references public.matches(id) on delete cascade,
  kind text not null check (kind in ('explanation','recommendations')),
  prompt_version text not null check (prompt_version ~ '^[a-z0-9.-]{1,40}$'),
  model text not null check (char_length(model) between 1 and 100),
  content jsonb not null check (jsonb_typeof(content)='object' and octet_length(content::text)<=16384),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (match_id, kind, prompt_version)
);
-- Per-user and global daily generation counters (UTC days).
create table private.ai_user_usage (
  day date not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  requests integer not null default 0,
  primary key (day, owner_id)
);
create table private.ai_daily_usage (
  day date primary key,
  requests integer not null default 0
);
-- In-flight generations, so concurrent clicks do not pay for the same insight twice.
create table private.ai_pending (
  match_id uuid not null references public.matches(id) on delete cascade,
  kind text not null,
  prompt_version text not null,
  reserved_at timestamptz not null,
  primary key (match_id, kind, prompt_version)
);

alter table public.comparison_insights enable row level security;
create policy participant_insights on public.comparison_insights for select to authenticated
  using (exists(select 1 from public.matches m join public.music_profiles p on p.id in (m.profile_a_id,m.profile_b_id)
    where m.id=match_id and p.owner_id=auth.uid()));
revoke all on public.comparison_insights from anon, authenticated;
grant select on public.comparison_insights to authenticated;

create or replace function private.profile_json(p public.music_profiles) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'displayName',p.display_name,'handle',p.handle,
    'comparisonEnabled',p.comparison_enabled,'aiEnabled',p.ai_enabled,'revision',p.revision)
$$;
create function private.insight_json(i public.comparison_insights) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('matchId',i.match_id,'kind',i.kind,'promptVersion',i.prompt_version,
    'model',i.model,'content',i.content,'createdAt',i.created_at)
$$;

-- Owner opt-in/out. Uses the same revision and row lock as other settings writes.
create function public.set_my_ai_consent(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.music_profiles;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  select * into p from public.music_profiles where owner_id=auth.uid() for update;
  if not found then return private.fail('PROFILE_NOT_READY','Create your profile first.'); end if;
  if not private.valid_keys(p_request,array['aiEnabled','expectedRevision'])
    or jsonb_typeof(p_request->'aiEnabled') is distinct from 'boolean'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'number'
    or (p_request->>'expectedRevision') !~ '^[0-9]{1,9}$' then
    return private.fail('VALIDATION_FAILED','Invalid AI setting.');
  end if;
  if (p_request->>'expectedRevision')::int<>p.revision then return private.fail('STALE_WRITE','Settings changed. Reload before saving.'); end if;
  update public.music_profiles set ai_enabled=(p_request->>'aiEnabled')::boolean,revision=revision+1
    where id=p.id returning * into p;
  return private.ok(private.profile_json(p));
end $$;

-- Participant read: the stored insight (newest prompt version) plus both consent flags for UI state.
create function public.get_comparison_insight(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.music_profiles; m public.matches; other boolean; insight public.comparison_insights;
begin
  if auth.uid() is null then return private.fail('UNAUTHENTICATED','Please sign in.'); end if;
  if not private.valid_keys(p_request,array['matchId','kind']) or not private.is_uuid(p_request->>'matchId')
    or p_request->>'kind' is null or p_request->>'kind' not in ('explanation','recommendations') then
    return private.fail('VALIDATION_FAILED','Invalid insight request.');
  end if;
  select * into me from public.music_profiles where owner_id=auth.uid();
  if not found then return private.fail('PROFILE_NOT_READY','Create your profile first.'); end if;
  select * into m from public.matches where id=(p_request->>'matchId')::uuid and me.id in (profile_a_id,profile_b_id);
  if not found then return private.fail('NOT_FOUND','This result is unavailable.'); end if;
  select ai_enabled into other from public.music_profiles
    where id=case when m.profile_a_id=me.id then m.profile_b_id else m.profile_a_id end;
  select * into insight from public.comparison_insights where match_id=m.id and kind=p_request->>'kind'
    order by created_at desc limit 1;
  return private.ok(jsonb_build_object(
    'insight',case when insight.match_id is null then null else private.insight_json(insight) end,
    'consent',jsonb_build_object('you',me.ai_enabled,'them',coalesce(other,false))));
end $$;

-- Service-role gateway for the comparison-insight Edge Function.
--   reserve: authorize caller, return cached insight, or check consent + quotas and reserve a generation slot.
--   save:    persist a validated insight (first write wins) and clear the in-flight marker.
--   release: clear the in-flight marker after a provider failure (quota stays consumed).
create function public.ai_gateway(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; me public.music_profiles; m public.matches; a_ok boolean; b_ok boolean; mine boolean; theirs boolean;
  insight public.comparison_insights; v_kind text; v_version text; user_cap integer; global_cap integer;
  today date:=(clock_timestamp() at time zone 'utc')::date; used integer; pending_at timestamptz;
  moment timestamptz:=clock_timestamp(); retry integer;
begin
  v_kind:=p_request->>'kind'; v_version:=p_request->>'promptVersion';
  if not private.is_uuid(p_request->>'matchId') or v_kind is null or v_kind not in ('explanation','recommendations')
    or v_version is null or v_version !~ '^[a-z0-9.-]{1,40}$' then
    return jsonb_build_object('invalid',true);
  end if;

  if p_request->>'action'='reserve' then
    if not private.valid_keys(p_request,array['action','userId','matchId','kind','promptVersion','userCap','globalCap'])
      or not private.is_uuid(p_request->>'userId')
      or jsonb_typeof(p_request->'userCap') is distinct from 'number' or (p_request->>'userCap') !~ '^[0-9]{1,5}$'
      or jsonb_typeof(p_request->'globalCap') is distinct from 'number' or (p_request->>'globalCap') !~ '^[0-9]{1,6}$' then
      return jsonb_build_object('invalid',true);
    end if;
    actor:=(p_request->>'userId')::uuid; user_cap:=(p_request->>'userCap')::int; global_cap:=(p_request->>'globalCap')::int;
    select * into me from public.music_profiles where owner_id=actor;
    if not found then return jsonb_build_object('notFound',true); end if;
    select * into m from public.matches where id=(p_request->>'matchId')::uuid and me.id in (profile_a_id,profile_b_id);
    if not found then return jsonb_build_object('notFound',true); end if;

    select * into insight from public.comparison_insights where match_id=m.id and kind=v_kind and prompt_version=v_version;
    if found then return jsonb_build_object('cached',private.insight_json(insight)); end if;

    -- Lock both profiles in sorted order (same order as create_comparison) so consent cannot change mid-check.
    perform 1 from public.music_profiles where id in (m.profile_a_id,m.profile_b_id) order by id for update;
    select ai_enabled into a_ok from public.music_profiles where id=m.profile_a_id;
    select ai_enabled into b_ok from public.music_profiles where id=m.profile_b_id;
    mine:=case when m.profile_a_id=me.id then a_ok else b_ok end;
    theirs:=case when m.profile_a_id=me.id then b_ok else a_ok end;
    if not (mine and theirs) then
      return jsonb_build_object('consentRequired',jsonb_build_object('you',mine,'them',theirs));
    end if;

    select reserved_at into pending_at from private.ai_pending
      where match_id=m.id and kind=v_kind and prompt_version=v_version for update;
    if found and pending_at>moment-interval '60 seconds' then
      return jsonb_build_object('limited',true,'retryAfterSeconds',5);
    end if;

    insert into private.ai_daily_usage(day,requests) values(today,0) on conflict(day) do nothing;
    select requests into used from private.ai_daily_usage where day=today for update;
    retry:=greatest(1,ceil(extract(epoch from ((today+1)::timestamp at time zone 'utc')-moment))::int);
    if used>=global_cap then return jsonb_build_object('limited',true,'scope','global','retryAfterSeconds',retry); end if;
    insert into private.ai_user_usage(day,owner_id,requests) values(today,actor,0) on conflict(day,owner_id) do nothing;
    select requests into used from private.ai_user_usage where day=today and owner_id=actor for update;
    if used>=user_cap then return jsonb_build_object('limited',true,'scope','user','retryAfterSeconds',retry); end if;

    update private.ai_daily_usage set requests=requests+1 where day=today;
    update private.ai_user_usage set requests=requests+1 where day=today and owner_id=actor;
    insert into private.ai_pending(match_id,kind,prompt_version,reserved_at) values(m.id,v_kind,v_version,moment)
      on conflict(match_id,kind,prompt_version) do update set reserved_at=excluded.reserved_at;
    -- Only anonymized comparison data leaves the database: no names, handles, or IDs.
    return jsonb_build_object('reserved',true,'input',jsonb_build_object(
      'score',m.score,'shared',m.snapshot->'shared','onlyA',m.snapshot->'onlyA','onlyB',m.snapshot->'onlyB',
      'requesterIs',case when m.profile_a_id=me.id then 'A' else 'B' end));

  elsif p_request->>'action'='save' then
    if not private.valid_keys(p_request,array['action','matchId','kind','promptVersion','model','content','inputTokens','outputTokens'])
      or jsonb_typeof(p_request->'model') is distinct from 'string'
      or jsonb_typeof(p_request->'content') is distinct from 'object'
      or (p_request ? 'inputTokens' and (p_request->>'inputTokens') !~ '^[0-9]{1,9}$')
      or (p_request ? 'outputTokens' and (p_request->>'outputTokens') !~ '^[0-9]{1,9}$') then
      return jsonb_build_object('invalid',true);
    end if;
    insert into public.comparison_insights(match_id,kind,prompt_version,model,content,input_tokens,output_tokens)
      values((p_request->>'matchId')::uuid,v_kind,v_version,p_request->>'model',p_request->'content',
        (p_request->>'inputTokens')::int,(p_request->>'outputTokens')::int)
      on conflict(match_id,kind,prompt_version) do nothing;
    delete from private.ai_pending where match_id=(p_request->>'matchId')::uuid and kind=v_kind and prompt_version=v_version;
    select * into insight from public.comparison_insights
      where match_id=(p_request->>'matchId')::uuid and kind=v_kind and prompt_version=v_version;
    return jsonb_build_object('saved',private.insight_json(insight));

  elsif p_request->>'action'='release' then
    if not private.valid_keys(p_request,array['action','matchId','kind','promptVersion']) then
      return jsonb_build_object('invalid',true);
    end if;
    delete from private.ai_pending where match_id=(p_request->>'matchId')::uuid and kind=v_kind and prompt_version=v_version;
    return jsonb_build_object('released',true);
  end if;
  return jsonb_build_object('invalid',true);
end $$;

revoke all on function private.insight_json(public.comparison_insights) from public,anon,authenticated;
revoke all on function public.set_my_ai_consent(jsonb),public.get_comparison_insight(jsonb),public.ai_gateway(jsonb)
  from public,anon,authenticated;
grant execute on function public.set_my_ai_consent(jsonb),public.get_comparison_insight(jsonb) to authenticated;
grant execute on function public.ai_gateway(jsonb) to service_role;
