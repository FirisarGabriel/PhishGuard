create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = timezone('utc', now());
	return new;
end;
$$;

create table if not exists public.profiles (
	id uuid primary key references auth.users(id) on delete cascade,
	email text,
	full_name text,
	platform_role text not null default 'USER' check (platform_role in ('USER', 'ADMIN')),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organizations (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	slug text not null unique,
	created_by uuid not null references public.profiles(id),
	archived_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_members (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid not null references public.organizations(id) on delete cascade,
	user_id uuid not null references public.profiles(id) on delete cascade,
	role text not null check (role in ('org_owner', 'org_manager', 'employee')),
	status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
	joined_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (organization_id, user_id)
);

create table if not exists public.teams (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid not null references public.organizations(id) on delete cascade,
	name text not null,
	description text,
	created_by uuid not null references public.profiles(id),
	archived_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (organization_id, name)
);

create table if not exists public.team_members (
	id uuid primary key default gen_random_uuid(),
	team_id uuid not null references public.teams(id) on delete cascade,
	organization_id uuid not null references public.organizations(id) on delete cascade,
	user_id uuid not null references public.profiles(id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now()),
	unique (team_id, user_id)
);

create table if not exists public.organization_invites (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid not null references public.organizations(id) on delete cascade,
	email text not null,
	role text not null check (role in ('org_owner', 'org_manager', 'employee')),
	invited_by uuid not null references public.profiles(id),
	token text not null unique,
	status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
	expires_at timestamptz,
	accepted_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.training_assignments (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid not null references public.organizations(id) on delete cascade,
	lesson_id text not null,
	title text,
	note text,
	target_type text not null check (target_type in ('user', 'team')),
	target_id uuid not null,
	assigned_by uuid not null references public.profiles(id),
	due_at timestamptz,
	status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assignment_recipients (
	id uuid primary key default gen_random_uuid(),
	assignment_id uuid not null references public.training_assignments(id) on delete cascade,
	organization_id uuid not null references public.organizations(id) on delete cascade,
	lesson_id text not null,
	user_id uuid not null references public.profiles(id) on delete cascade,
	status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'overdue', 'cancelled')),
	assigned_at timestamptz not null default timezone('utc', now()),
	due_at timestamptz,
	started_at timestamptz,
	completed_at timestamptz,
	last_progress_at timestamptz,
	unique (assignment_id, user_id)
);

create table if not exists public.user_lesson_progress (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles(id) on delete cascade,
	lesson_id text not null,
	completion integer not null default 0 check (completion >= 0 and completion <= 100),
	last_viewed_at timestamptz,
	completed_at timestamptz,
	source text not null default 'b2c' check (source in ('b2c', 'assignment')),
	assignment_recipient_id uuid references public.assignment_recipients(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (user_id, lesson_id, source, assignment_recipient_id)
);

create table if not exists public.user_block_progress (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles(id) on delete cascade,
	lesson_id text not null,
	block_id text not null,
	status text not null default 'not_started' check (status in ('not_started', 'completed')),
	selected_option_id text,
	is_correct boolean,
	completed_at timestamptz,
	source text not null default 'b2c' check (source in ('b2c', 'assignment')),
	assignment_recipient_id uuid references public.assignment_recipients(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (user_id, block_id, source, assignment_recipient_id)
);

create table if not exists public.user_quiz_attempts (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles(id) on delete cascade,
	quiz_id text not null,
	score integer not null default 0,
	variant text,
	started_at timestamptz not null,
	finished_at timestamptz,
	source text not null default 'b2c' check (source in ('b2c', 'assignment')),
	assignment_recipient_id uuid references public.assignment_recipients(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_achievement_unlocks (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles(id) on delete cascade,
	achievement_id text not null,
	unlocked_at timestamptz not null default timezone('utc', now()),
	created_at timestamptz not null default timezone('utc', now()),
	unique (user_id, achievement_id)
);

create table if not exists public.audit_log (
	id uuid primary key default gen_random_uuid(),
	actor_user_id uuid references public.profiles(id) on delete set null default auth.uid(),
	organization_id uuid references public.organizations(id) on delete set null,
	category text not null check (category in ('audit', 'sync', 'auth', 'error')),
	action text not null,
	target_type text,
	target_id text,
	status text not null check (status in ('success', 'error', 'info')),
	source text not null default 'mobile',
	duration_ms integer,
	error_message text,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_inbox_notifications (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles(id) on delete cascade,
	organization_id uuid references public.organizations(id) on delete cascade,
	kind text not null check (kind in ('assignment_completed')),
	title text not null,
	body text,
	reference_type text,
	reference_id text,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	unique (user_id, kind, reference_id)
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.profiles p
		where p.id = auth.uid()
			and p.platform_role = 'ADMIN'
	);
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.organization_members om
		where om.organization_id = target_organization_id
			and om.user_id = auth.uid()
			and om.status = 'active'
			and om.role = any(allowed_roles)
	);
$$;

drop function if exists public.list_my_organization_invites();
create or replace function public.list_my_organization_invites()
returns table (
	id uuid,
	organization_id uuid,
	organization_name text,
	email text,
	role text,
	invited_by uuid,
	token text,
	status text,
	expires_at timestamptz,
	accepted_at timestamptz,
	created_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
	select
		oi.id,
		oi.organization_id,
		o.name as organization_name,
		oi.email,
		oi.role,
		oi.invited_by,
		oi.token,
		oi.status,
		oi.expires_at,
		oi.accepted_at,
		oi.created_at,
		oi.updated_at
	from public.organization_invites oi
	join public.organizations o on o.id = oi.organization_id
	where lower(oi.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
		and oi.status = 'pending'
		and (oi.expires_at is null or oi.expires_at > timezone('utc', now()))
	order by oi.created_at desc;
$$;

drop function if exists public.accept_organization_invite(text);
create or replace function public.accept_organization_invite(invite_token text)
returns table (
	result_organization_id uuid,
	result_organization_name text,
	result_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
	invite_row public.organization_invites%rowtype;
	current_user_id uuid := auth.uid();
	current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
	accepted_at_ts timestamptz := timezone('utc', now());
begin
	if current_user_id is null then
		raise exception 'You must be signed in to accept an invite.';
	end if;

	select *
	into invite_row
	from public.organization_invites
	where token = invite_token
		and status = 'pending'
		and (expires_at is null or expires_at > accepted_at_ts)
	limit 1;

	if not found then
		raise exception 'Invite is no longer available.';
	end if;

	if current_email = '' or lower(invite_row.email) <> current_email then
		raise exception 'Signed in email does not match this invite.';
	end if;

	insert into public.organization_members (
		id,
		organization_id,
		user_id,
		role,
		status,
		joined_at
	)
	values (
		gen_random_uuid(),
		invite_row.organization_id,
		current_user_id,
		invite_row.role,
		'active',
		accepted_at_ts
	)
	on conflict (organization_id, user_id)
	do update set
		role = excluded.role,
		status = 'active',
		joined_at = coalesce(public.organization_members.joined_at, excluded.joined_at),
		updated_at = accepted_at_ts;

	update public.organization_invites
	set
		status = 'accepted',
		accepted_at = accepted_at_ts,
		updated_at = accepted_at_ts
	where id = invite_row.id;

	return query
	select o.id, o.name, invite_row.role
	from public.organizations o
	where o.id = invite_row.organization_id;
end;
$$;

create or replace function public.handle_assignment_recipient_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	assignment_row public.training_assignments%rowtype;
	recipient_total integer := 0;
	completed_total integer := 0;
	assignment_title text;
begin
	if new.status <> 'completed' or old.status = 'completed' then
		return new;
	end if;

	select *
	into assignment_row
	from public.training_assignments
	where id = new.assignment_id
	limit 1;

	if not found then
		return new;
	end if;

	select
		count(*),
		count(*) filter (where status = 'completed')
	into recipient_total, completed_total
	from public.assignment_recipients
	where assignment_id = new.assignment_id;

	if recipient_total = 0 or completed_total <> recipient_total then
		return new;
	end if;

	assignment_title := coalesce(nullif(assignment_row.title, ''), assignment_row.lesson_id, 'training assignment');

	insert into public.user_inbox_notifications (
		user_id,
		organization_id,
		kind,
		title,
		body,
		reference_type,
		reference_id,
		metadata
	)
	values (
		assignment_row.assigned_by,
		assignment_row.organization_id,
		'assignment_completed',
		'Assignment completed by all recipients',
		format('"%s" was completed by all assigned recipients and has been archived.', assignment_title),
		'training_assignment',
		assignment_row.id::text,
		jsonb_build_object(
			'assignmentId', assignment_row.id,
			'lessonId', assignment_row.lesson_id,
			'recipientCount', recipient_total,
			'title', assignment_row.title,
			'targetType', assignment_row.target_type
		)
	)
	on conflict (user_id, kind, reference_id) do nothing;

	insert into public.audit_log (
		actor_user_id,
		organization_id,
		category,
		action,
		target_type,
		target_id,
		status,
		source,
		metadata
	)
	values (
		assignment_row.assigned_by,
		assignment_row.organization_id,
		'audit',
		'assignment_auto_completed',
		'training_assignment',
		assignment_row.id::text,
		'success',
		'database_trigger',
		jsonb_build_object(
			'recipientCount', recipient_total,
			'lessonId', assignment_row.lesson_id
		)
	);

	delete from public.training_assignments
	where id = assignment_row.id;

	return new;
end;
$$;

create or replace function public.prune_audit_log_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	delete from public.audit_log
	where created_at < timezone('utc', now()) - interval '7 days';

	return new;
end;
$$;

grant execute on function public.list_my_organization_invites() to authenticated;
grant execute on function public.accept_organization_invite(text) to authenticated;

create index if not exists idx_organization_members_user on public.organization_members(user_id);
create index if not exists idx_organization_members_org on public.organization_members(organization_id);
create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_training_assignments_org on public.training_assignments(organization_id);
create index if not exists idx_assignment_recipients_user on public.assignment_recipients(user_id);
create index if not exists idx_assignment_recipients_assignment on public.assignment_recipients(assignment_id);
create index if not exists idx_user_lesson_progress_user on public.user_lesson_progress(user_id);
create index if not exists idx_user_block_progress_user on public.user_block_progress(user_id);
create index if not exists idx_user_quiz_attempts_user on public.user_quiz_attempts(user_id);
create index if not exists idx_audit_log_actor on public.audit_log(actor_user_id);
create index if not exists idx_audit_log_org on public.audit_log(organization_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_user_inbox_notifications_user_created_at on public.user_inbox_notifications(user_id, created_at desc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists set_organization_members_updated_at on public.organization_members;
create trigger set_organization_members_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

drop trigger if exists set_organization_invites_updated_at on public.organization_invites;
create trigger set_organization_invites_updated_at
before update on public.organization_invites
for each row execute function public.set_updated_at();

drop trigger if exists set_training_assignments_updated_at on public.training_assignments;
create trigger set_training_assignments_updated_at
before update on public.training_assignments
for each row execute function public.set_updated_at();

drop trigger if exists set_user_lesson_progress_updated_at on public.user_lesson_progress;
create trigger set_user_lesson_progress_updated_at
before update on public.user_lesson_progress
for each row execute function public.set_updated_at();

drop trigger if exists set_user_block_progress_updated_at on public.user_block_progress;
create trigger set_user_block_progress_updated_at
before update on public.user_block_progress
for each row execute function public.set_updated_at();

drop trigger if exists set_user_quiz_attempts_updated_at on public.user_quiz_attempts;
create trigger set_user_quiz_attempts_updated_at
before update on public.user_quiz_attempts
for each row execute function public.set_updated_at();

drop trigger if exists assignment_recipients_complete_assignment on public.assignment_recipients;
create trigger assignment_recipients_complete_assignment
after update of status on public.assignment_recipients
for each row execute function public.handle_assignment_recipient_completion();

drop trigger if exists audit_log_retention on public.audit_log;
create trigger audit_log_retention
before insert on public.audit_log
for each row execute function public.prune_audit_log_retention();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.training_assignments enable row level security;
alter table public.assignment_recipients enable row level security;
alter table public.user_lesson_progress enable row level security;
alter table public.user_block_progress enable row level security;
alter table public.user_quiz_attempts enable row level security;
alter table public.user_achievement_unlocks enable row level security;
alter table public.audit_log enable row level security;
alter table public.user_inbox_notifications enable row level security;

drop policy if exists "profiles select own or admin" on public.profiles;
drop policy if exists "profiles select own admin or org managers" on public.profiles;
create policy "profiles select own admin or org managers"
on public.profiles
for select
using (
	id = auth.uid()
	or public.is_platform_admin()
	or exists (
		select 1
		from public.organization_members viewer
		join public.organization_members target
			on target.organization_id = viewer.organization_id
		where viewer.user_id = auth.uid()
			and viewer.status = 'active'
			and viewer.role in ('org_owner', 'org_manager')
			and target.user_id = profiles.id
			and target.status = 'active'
	)
);

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin"
on public.profiles
for update
using (id = auth.uid() or public.is_platform_admin())
with check (id = auth.uid() or public.is_platform_admin());

drop policy if exists "profiles insert self or admin" on public.profiles;
create policy "profiles insert self or admin"
on public.profiles
for insert
with check (id = auth.uid() or public.is_platform_admin());

drop policy if exists "organizations visible to members" on public.organizations;
create policy "organizations visible to members"
on public.organizations
for select
using (
	public.has_org_role(id, array['org_owner', 'org_manager', 'employee'])
	or public.is_platform_admin()
);

drop policy if exists "organizations managed by owners" on public.organizations;
drop policy if exists "organizations bootstrap and manage" on public.organizations;
create policy "organizations bootstrap and manage"
on public.organizations
for all
using (
	public.has_org_role(id, array['org_owner'])
	or created_by = auth.uid()
	or public.is_platform_admin()
)
with check (
	public.has_org_role(id, array['org_owner'])
	or created_by = auth.uid()
	or public.is_platform_admin()
);

drop policy if exists "organization members visible to org" on public.organization_members;
create policy "organization members visible to org"
on public.organization_members
for select
using (
	user_id = auth.uid()
	or public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "organization members managed by org owners" on public.organization_members;
create policy "organization members managed by org owners"
on public.organization_members
for all
using (
	public.has_org_role(organization_id, array['org_owner'])
	or public.is_platform_admin()
)
with check (
	public.has_org_role(organization_id, array['org_owner'])
	or (
		user_id = auth.uid()
		and role = 'org_owner'
		and status = 'active'
		and exists (
			select 1
			from public.organizations o
			where o.id = organization_members.organization_id
				and o.created_by = auth.uid()
		)
	)
	or public.is_platform_admin()
);

drop policy if exists "teams visible to organization" on public.teams;
create policy "teams visible to organization"
on public.teams
for select
using (
	public.has_org_role(organization_id, array['org_owner', 'org_manager', 'employee'])
	or public.is_platform_admin()
);

drop policy if exists "teams managed by managers" on public.teams;
create policy "teams managed by managers"
on public.teams
for all
using (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
)
with check (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "team members visible to organization" on public.team_members;
create policy "team members visible to organization"
on public.team_members
for select
using (
	user_id = auth.uid()
	or public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "team members managed by managers" on public.team_members;
create policy "team members managed by managers"
on public.team_members
for all
using (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
)
with check (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "invites visible to organization managers" on public.organization_invites;
create policy "invites visible to organization managers"
on public.organization_invites
for select
using (
	lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
	or public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "invites managed by organization managers" on public.organization_invites;
create policy "invites managed by organization managers"
on public.organization_invites
for all
using (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
)
with check (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "assignments visible to organization" on public.training_assignments;
create policy "assignments visible to organization"
on public.training_assignments
for select
using (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or exists (
		select 1
		from public.assignment_recipients ar
		where ar.assignment_id = training_assignments.id
			and ar.user_id = auth.uid()
	)
	or public.is_platform_admin()
);

drop policy if exists "assignments managed by organization managers" on public.training_assignments;
create policy "assignments managed by organization managers"
on public.training_assignments
for all
using (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
)
with check (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "assignment recipients visible to owner or user" on public.assignment_recipients;
create policy "assignment recipients visible to owner or user"
on public.assignment_recipients
for select
using (
	user_id = auth.uid()
	or public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "assignment recipients managed by managers" on public.assignment_recipients;
create policy "assignment recipients managed by managers"
on public.assignment_recipients
for all
using (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
)
with check (
	public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	or public.is_platform_admin()
);

drop policy if exists "lesson progress visible to owner or user" on public.user_lesson_progress;
create policy "lesson progress visible to owner or user"
on public.user_lesson_progress
for select
using (
	user_id = auth.uid()
	or (
		assignment_recipient_id is not null
		and exists (
			select 1
			from public.assignment_recipients ar
			where ar.id = user_lesson_progress.assignment_recipient_id
				and public.has_org_role(ar.organization_id, array['org_owner', 'org_manager'])
		)
	)
	or public.is_platform_admin()
);

drop policy if exists "lesson progress writable by owner" on public.user_lesson_progress;
create policy "lesson progress writable by owner"
on public.user_lesson_progress
for all
using (user_id = auth.uid() or public.is_platform_admin())
with check (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "block progress visible to owner or user" on public.user_block_progress;
create policy "block progress visible to owner or user"
on public.user_block_progress
for select
using (
	user_id = auth.uid()
	or (
		assignment_recipient_id is not null
		and exists (
			select 1
			from public.assignment_recipients ar
			where ar.id = user_block_progress.assignment_recipient_id
				and public.has_org_role(ar.organization_id, array['org_owner', 'org_manager'])
		)
	)
	or public.is_platform_admin()
);

drop policy if exists "block progress writable by owner" on public.user_block_progress;
create policy "block progress writable by owner"
on public.user_block_progress
for all
using (user_id = auth.uid() or public.is_platform_admin())
with check (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "quiz attempts visible to owner or user" on public.user_quiz_attempts;
create policy "quiz attempts visible to owner or user"
on public.user_quiz_attempts
for select
using (
	user_id = auth.uid()
	or (
		assignment_recipient_id is not null
		and exists (
			select 1
			from public.assignment_recipients ar
			where ar.id = user_quiz_attempts.assignment_recipient_id
				and public.has_org_role(ar.organization_id, array['org_owner', 'org_manager'])
		)
	)
	or public.is_platform_admin()
);

drop policy if exists "quiz attempts writable by owner" on public.user_quiz_attempts;
create policy "quiz attempts writable by owner"
on public.user_quiz_attempts
for all
using (user_id = auth.uid() or public.is_platform_admin())
with check (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "achievement unlocks visible to owner" on public.user_achievement_unlocks;
create policy "achievement unlocks visible to owner"
on public.user_achievement_unlocks
for select
using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "achievement unlocks writable by owner" on public.user_achievement_unlocks;
create policy "achievement unlocks writable by owner"
on public.user_achievement_unlocks
for all
using (user_id = auth.uid() or public.is_platform_admin())
with check (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "audit log readable by actor or org managers" on public.audit_log;
create policy "audit log readable by actor or org managers"
on public.audit_log
for select
using (
	actor_user_id = auth.uid()
	or public.is_platform_admin()
	or (
		organization_id is not null
		and public.has_org_role(organization_id, array['org_owner', 'org_manager'])
	)
);

drop policy if exists "audit log insert by authenticated actor" on public.audit_log;
create policy "audit log insert by authenticated actor"
on public.audit_log
for insert
with check (
	auth.uid() is not null
	and (
		actor_user_id is null
		or actor_user_id = auth.uid()
	)
);

drop policy if exists "audit log deleted by platform admins" on public.audit_log;
create policy "audit log deleted by platform admins"
on public.audit_log
for delete
using (public.is_platform_admin());

drop policy if exists "inbox notifications visible to owner" on public.user_inbox_notifications;
create policy "inbox notifications visible to owner"
on public.user_inbox_notifications
for select
using (
	user_id = auth.uid()
	or public.is_platform_admin()
);
