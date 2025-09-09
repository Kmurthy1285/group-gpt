-- Enable UUID ext
create extension if not exists "uuid-ossp";

-- User profiles table
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rooms table with chat names
create table if not exists public.rooms (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Untitled Chat',
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigserial primary key,
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  user_name text not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Room participants table for tracking who's in each room
create table if not exists public.room_participants (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(room_id, user_id)
);

-- Enable RLS on all tables
alter table public.user_profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.messages enable row level security;
alter table public.room_participants enable row level security;

-- User profiles policies
create policy "Users can view all profiles" on public.user_profiles for select using (true);
create policy "Users can insert their own profile" on public.user_profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.user_profiles for update using (auth.uid() = id);

-- Rooms policies
create policy "Users can view all rooms" on public.rooms for select using (true);
create policy "Authenticated users can create rooms" on public.rooms for insert with check (auth.uid() is not null);
create policy "Room creators can update their rooms" on public.rooms for update using (auth.uid() = created_by);

-- Messages policies
create policy "Users can view all messages" on public.messages for select using (true);
create policy "Authenticated users can insert messages" on public.messages for insert with check (auth.uid() is not null);

-- Room participants policies
create policy "Users can view room participants" on public.room_participants for select using (true);
create policy "Users can join rooms" on public.room_participants for insert with check (auth.uid() = user_id);
create policy "Users can leave rooms" on public.room_participants for delete using (auth.uid() = user_id);

-- Function to automatically create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile on user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

