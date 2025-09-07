-- Enable UUID ext
create extension if not exists "uuid-ossp";

create table if not exists public.rooms (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigserial primary key,
  room_id uuid references public.rooms(id) on delete cascade,
  user_name text not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

-- RLS: open read, insert limited to a room (public demo settings)
alter table public.rooms enable row level security;
alter table public.messages enable row level security;

create policy "read rooms" on public.rooms for select using (true);
create policy "insert rooms" on public.rooms for insert with check (true);

create policy "read messages" on public.messages for select using (true);
create policy "insert messages" on public.messages for insert with check (true);

