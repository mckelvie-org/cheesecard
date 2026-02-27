-- ============================================================
-- Cheesecard initial schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- Role enum
create type public.role as enum ('pending', 'member', 'admin');

-- ============================================================
-- profiles
-- Mirrors auth.users; created automatically on first sign-in
-- via the trigger below.
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  role        public.role not null default 'pending',
  created_at  timestamptz not null default now()
);

-- Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- tastings
-- ============================================================
create table public.tastings (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  notes       text,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- cheeses
-- ============================================================
create table public.cheeses (
  id              uuid primary key default gen_random_uuid(),
  tasting_id      uuid not null references public.tastings(id) on delete cascade,
  name            text not null,
  country         text,
  region          text,
  milk_type       text,
  description     text,
  food_pairings   text[] not null default '{}',
  wine_pairings   text[] not null default '{}',
  front_image_url text,
  back_image_url  text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- reviews
-- One per user per cheese. Upsertable.
-- ============================================================
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  cheese_id   uuid not null references public.cheeses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      smallint check (rating >= 1 and rating <= 5),
  is_favorite boolean not null default false,
  body        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cheese_id, user_id)
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reviews_updated_at
  before update on public.reviews
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- comments
-- Threaded discussion. parent_id null = top-level post.
-- ============================================================
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  cheese_id   uuid not null references public.cheeses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  parent_id   uuid references public.comments(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- tasting_photos
-- ============================================================
create table public.tasting_photos (
  id          uuid primary key default gen_random_uuid(),
  tasting_id  uuid not null references public.tastings(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  photo_url   text not null,
  caption     text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('card-images', 'card-images', true),
  ('tasting-photos', 'tasting-photos', true);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.tastings        enable row level security;
alter table public.cheeses         enable row level security;
alter table public.reviews         enable row level security;
alter table public.comments        enable row level security;
alter table public.tasting_photos  enable row level security;

-- Helper: is the current user a member or admin?
create or replace function public.is_member()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('member', 'admin')
  );
$$;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles: users can read all profiles (to show names/avatars)
--           users can only update their own non-role fields
--           admins can update role
create policy "members can read all profiles"
  on public.profiles for select
  using (public.is_member());

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "admins can update any profile"
  on public.profiles for update
  using (public.is_admin());

-- Allow the trigger to insert profiles on sign-up (runs as definer)
create policy "service role can insert profiles"
  on public.profiles for insert
  with check (true);

-- tastings: members can read; admins can insert/update/delete
create policy "members can read tastings"
  on public.tastings for select
  using (public.is_member());

create policy "admins can manage tastings"
  on public.tastings for all
  using (public.is_admin());

-- cheeses: members can read; admins can insert/update/delete
create policy "members can read cheeses"
  on public.cheeses for select
  using (public.is_member());

create policy "admins can manage cheeses"
  on public.cheeses for all
  using (public.is_admin());

-- reviews: members can read all; users can insert/update their own
create policy "members can read all reviews"
  on public.reviews for select
  using (public.is_member());

create policy "members can insert own review"
  on public.reviews for insert
  with check (public.is_member() and auth.uid() = user_id);

create policy "users can update own review"
  on public.reviews for update
  using (auth.uid() = user_id);

-- comments: members can read all; members can insert their own
create policy "members can read all comments"
  on public.comments for select
  using (public.is_member());

create policy "members can insert comments"
  on public.comments for insert
  with check (public.is_member() and auth.uid() = user_id);

create policy "users can update own comments"
  on public.comments for update
  using (auth.uid() = user_id);

-- tasting_photos: members can read all; members can insert their own
create policy "members can read tasting photos"
  on public.tasting_photos for select
  using (public.is_member());

create policy "members can insert tasting photos"
  on public.tasting_photos for insert
  with check (public.is_member() and auth.uid() = user_id);

-- Storage policies
create policy "card images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'card-images');

create policy "members can upload card images"
  on storage.objects for insert
  with check (bucket_id = 'card-images' and public.is_member());

create policy "tasting photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'tasting-photos');

create policy "members can upload tasting photos"
  on storage.objects for insert
  with check (bucket_id = 'tasting-photos' and public.is_member());
