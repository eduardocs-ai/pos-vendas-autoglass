create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('agent','leader','coordinator','admin')),
  password_label text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  display_name text not null,
  team_id uuid references public.teams(id) on delete set null,
  is_metric_agent boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leader_assignments (
  id uuid primary key default gen_random_uuid(),
  coordinator_user_id uuid references public.app_users(id) on delete cascade,
  leader_user_id uuid references public.app_users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coordinator_user_id, leader_user_id, team_id)
);

create table if not exists public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  unique (year, month)
);

create table if not exists public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.reporting_periods(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  source_type text not null check (source_type in ('asc','avaya','cliente','fornecimento','unknown')),
  file_name text not null,
  imported_by text,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.asc_agent_metrics (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.reporting_periods(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  attendance_count int not null default 0,
  avg_tma_seconds numeric not null default 0,
  avg_tmpa_seconds numeric not null default 0,
  rating_bad int not null default 0,
  rating_regular int not null default 0,
  rating_good int not null default 0,
  rating_great int not null default 0,
  engagement_percent numeric not null default 0,
  logged_seconds numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_id, team_id, agent_id)
);

create table if not exists public.avaya_agent_metrics (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.reporting_periods(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  call_count int not null default 0,
  pause_count int not null default 0,
  pause_types jsonb not null default '{}'::jsonb,
  avg_pause_seconds numeric not null default 0,
  avg_logged_seconds numeric not null default 0,
  missed_calls int not null default 0,
  abandoned_calls int not null default 0,
  transferred_calls int not null default 0,
  daily jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_id, team_id, agent_id)
);

create table if not exists public.rating_protocols (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.reporting_periods(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  protocol text not null,
  rating text not null,
  created_at timestamptz not null default now(),
  unique (period_id, team_id, agent_id, protocol)
);

create index if not exists idx_agents_user_id on public.agents(user_id);
create index if not exists idx_agents_team_id on public.agents(team_id);
create index if not exists idx_leader_assignments_coordinator_user_id on public.leader_assignments(coordinator_user_id);
create index if not exists idx_leader_assignments_leader_user_id on public.leader_assignments(leader_user_id);
create index if not exists idx_leader_assignments_team_id on public.leader_assignments(team_id);
create index if not exists idx_upload_batches_period_id on public.upload_batches(period_id);
create index if not exists idx_upload_batches_team_id on public.upload_batches(team_id);
create index if not exists idx_asc_agent_metrics_period_id on public.asc_agent_metrics(period_id);
create index if not exists idx_asc_agent_metrics_team_id on public.asc_agent_metrics(team_id);
create index if not exists idx_asc_agent_metrics_agent_id on public.asc_agent_metrics(agent_id);
create index if not exists idx_avaya_agent_metrics_period_id on public.avaya_agent_metrics(period_id);
create index if not exists idx_avaya_agent_metrics_team_id on public.avaya_agent_metrics(team_id);
create index if not exists idx_avaya_agent_metrics_agent_id on public.avaya_agent_metrics(agent_id);
create index if not exists idx_rating_protocols_period_id on public.rating_protocols(period_id);
create index if not exists idx_rating_protocols_team_id on public.rating_protocols(team_id);
create index if not exists idx_rating_protocols_agent_id on public.rating_protocols(agent_id);

insert into public.teams (key, name) values
  ('fornecimento', 'Time Fornecimento'),
  ('cliente', 'Time Cliente')
on conflict (key) do update set name = excluded.name;

insert into public.app_users (username, display_name, role) values
  ('luciano.padilla', 'Luciano Padilha', 'agent'),
  ('livia.neves', 'Lívia Neves', 'agent'),
  ('eduardo.calegari', 'Eduardo Calegari', 'agent'),
  ('amanda.piaz', 'Amanda Piaz', 'agent'),
  ('elizandra.viana', 'Elizandra Viana', 'leader'),
  ('rhanaiza.kinack', 'Rhanaiza Kinack', 'leader'),
  ('milena.vassoler', 'Milena Vassoler', 'coordinator')
on conflict (username) do update set display_name = excluded.display_name, role = excluded.role;

insert into public.agents (user_id, display_name, team_id, is_metric_agent)
select u.id, u.display_name, t.id, true
from public.app_users u cross join public.teams t
where u.username in ('luciano.padilla','livia.neves','eduardo.calegari','amanda.piaz') and t.key = 'fornecimento'
on conflict do nothing;

insert into public.reporting_periods (year, month, label, starts_on, ends_on)
values (2026, 7, 'Julho de 2026', '2026-07-01', '2026-07-31')
on conflict (year, month) do update set label = excluded.label, starts_on = excluded.starts_on, ends_on = excluded.ends_on;

insert into public.leader_assignments (coordinator_user_id, leader_user_id, team_id)
select c.id, l.id, t.id
from public.app_users c
join public.app_users l on l.username = 'elizandra.viana'
join public.teams t on t.key in ('cliente','fornecimento')
where c.username = 'milena.vassoler'
on conflict do nothing;

alter table public.teams enable row level security;
alter table public.app_users enable row level security;
alter table public.agents enable row level security;
alter table public.leader_assignments enable row level security;
alter table public.reporting_periods enable row level security;
alter table public.upload_batches enable row level security;
alter table public.asc_agent_metrics enable row level security;
alter table public.avaya_agent_metrics enable row level security;
alter table public.rating_protocols enable row level security;
