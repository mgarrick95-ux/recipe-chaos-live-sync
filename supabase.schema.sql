
-- RecipeChaos / FrostPantry shared schema
create table if not exists pantry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty numeric not null default 0,
  unit text default null,
  updated_at timestamptz not null default now()
);

create table if not exists freezer (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty numeric not null default 0,
  unit text default null,
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  name text not null,
  qty numeric not null,
  unit text default null,
  date date not null,
  recipe text default '(unassigned)',
  location text check (location in ('Pantry','Freezer')) not null,
  status text default 'upcoming',
  updated_at timestamptz not null default now()
);

alter table pantry enable row level security;
alter table freezer enable row level security;
alter table reservations enable row level security;

-- demo policies, safe enough for your own project; can be tightened later
do $$ begin
  create policy "public read pantry" on pantry for select using (true);
  create policy "public write pantry" on pantry for insert with check (true);
  create policy "public update pantry" on pantry for update using (true);
  create policy "public delete pantry" on pantry for delete using (true);
exception when others then null; end $$;

do $$ begin
  create policy "public read freezer" on freezer for select using (true);
  create policy "public write freezer" on freezer for insert with check (true);
  create policy "public update freezer" on freezer for update using (true);
  create policy "public delete freezer" on freezer for delete using (true);
exception when others then null; end $$;

do $$ begin
  create policy "public read reservations" on reservations for select using (true);
  create policy "public write reservations" on reservations for insert with check (true);
  create policy "public update reservations" on reservations for update using (true);
  create policy "public delete reservations" on reservations for delete using (true);
exception when others then null; end $$;
