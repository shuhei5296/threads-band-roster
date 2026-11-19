create table if not exists public.bot_registration_candidates(
  id uuid primary key default gen_random_uuid(),
  source_reply_id text not null unique,
  source_post_id text not null,
  threads_username text not null,
  threads_user_id text,
  source_permalink text,
  posted_at timestamptz,
  raw_text text not null,
  parsed_primary text,
  parsed_sub text[] not null default '{}',
  parsed_experienced text[] not null default '{}',
  parsed_preferences text[] not null default '{}',
  parse_status text not null default 'ambiguous' check(parse_status in('parsed','ambiguous','not_applicable')),
  classification text not null check(classification in('new_candidate','already_registered','change_candidate','duplicate','identity_wait','instrument_wait','excluded')),
  existing_member_id uuid references public.members(id),
  identity_status text not null default 'unverified' check(identity_status in('unverified','numeric_verified','admin_verified')),
  registration_status text not null default 'pending' check(registration_status in('pending','held','approved','completed','rejected','not_required')),
  welcome_status text not null default 'not_ready' check(welcome_status in('not_ready','waiting_approval','approved','processing','sent','failed','unknown','excluded')),
  welcome_reply_id text,
  welcome_body text,
  attempts integer not null default 0 check(attempts>=0),
  hold_reason text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  registered_member_id uuid references public.members(id),
  last_processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bot_registration_candidates_status_idx on public.bot_registration_candidates(registration_status,created_at);
create index if not exists bot_registration_candidates_username_idx on public.bot_registration_candidates(lower(threads_username));
alter table public.bot_registration_candidates enable row level security;
revoke all on public.bot_registration_candidates from public,anon,authenticated;
grant all on public.bot_registration_candidates to service_role;

create or replace function public.approve_bot_registration_candidate(p_candidate_id uuid,p_admin_user_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.bot_registration_candidates; member_id uuid; instrument_id uuid; instrument_name text;
begin
  if not exists(select 1 from public.app_admins where user_id=p_admin_user_id) then raise exception 'admin permission required'; end if;
  select * into c from public.bot_registration_candidates where id=p_candidate_id for update;
  if c.id is null then raise exception 'candidate not found'; end if;
  if c.registration_status<>'pending' or c.classification<>'new_candidate' or c.identity_status='unverified' or c.parse_status<>'parsed' or c.parsed_primary is null then raise exception 'candidate is not eligible'; end if;
  if exists(select 1 from public.members where lower(trim(leading '@' from threads_id))=lower(trim(leading '@' from c.threads_username)) or (c.threads_user_id is not null and threads_user_id=c.threads_user_id)) then raise exception 'member already exists'; end if;
  select id into instrument_id from public.instruments where name=c.parsed_primary and is_active=true;
  if instrument_id is null then raise exception 'primary instrument is not in master'; end if;
  insert into public.members(threads_id,display_name,threads_user_id,membership_status,participation_status,comment_original,instrument_confirmation_status,welcome_status,bot_verified_at,bot_verified_reply_id)
  values(lower(trim(leading '@' from c.threads_username)),c.threads_username,c.threads_user_id,'active','confirmed',c.raw_text,'confirmed','confirmed',now(),c.source_reply_id) returning id into member_id;
  insert into public.member_instruments(member_id,instrument_id,relationship,confirmed) values(member_id,instrument_id,'primary',true) on conflict do nothing;
  foreach instrument_name in array c.parsed_sub loop select id into instrument_id from public.instruments where name=instrument_name and is_active=true; if instrument_id is not null then insert into public.member_instruments(member_id,instrument_id,relationship,confirmed) values(member_id,instrument_id,'can_double',true) on conflict do nothing; end if; end loop;
  foreach instrument_name in array c.parsed_experienced loop select id into instrument_id from public.instruments where name=instrument_name and is_active=true; if instrument_id is not null then insert into public.member_instruments(member_id,instrument_id,relationship,confirmed) values(member_id,instrument_id,'experienced',true) on conflict do nothing; end if; end loop;
  update public.bot_registration_candidates set registration_status='completed',welcome_status='waiting_approval',approved_by=p_admin_user_id,approved_at=now(),registered_member_id=member_id,last_processed_at=now(),updated_at=now() where id=c.id;
  insert into public.bot_audit_logs(event_type,actor_user_id,member_id,details) values('registration_candidate_approved',p_admin_user_id,member_id,jsonb_build_object('candidate_id',c.id,'source_reply_id',c.source_reply_id));
  return member_id;
end$$;
revoke all on function public.approve_bot_registration_candidate(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_bot_registration_candidate(uuid,uuid) to service_role;

