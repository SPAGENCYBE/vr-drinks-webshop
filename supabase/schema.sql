-- VR Drinks webshop: klantaccounts, bestellingen en instellingen.
-- Idempotent: kan bij elke uitrol opnieuw uitgevoerd worden.

-- ---------- Klantprofielen ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  first_name text,
  last_name text,
  company text,
  vat text,
  phone text,
  street text,
  zip text,
  city text,
  country text not null default 'BE',
  age_confirmed boolean not null default false,
  invoice_allowed boolean not null default false,      -- door VR Drinks goedgekeurd voor betalen op factuur
  onlinefact_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "eigen profiel lezen" on public.profiles;
create policy "eigen profiel lezen" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "eigen profiel aanpassen" on public.profiles;
create policy "eigen profiel aanpassen" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Klanten mogen alleen hun eigen gegevens aanpassen, niet de goedkeuring voor factuur of de Onlinefact-koppeling.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, company, vat, phone, street, zip, city, country, age_confirmed, updated_at) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone, company, vat, age_confirmed)
  values (
    new.id, new.email,
    new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'phone', nullif(new.raw_user_meta_data->>'company', ''),
    nullif(new.raw_user_meta_data->>'vat', ''),
    coalesce((new.raw_user_meta_data->>'age_confirmed')::boolean, false)
  ) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Bestellingen ----------
create sequence if not exists public.order_seq;
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null default ('W' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_seq')::text, 5, '0')),
  user_id uuid not null references auth.users on delete restrict,
  status text not null default 'nieuw'
    check (status in ('nieuw', 'wacht_op_betaling', 'betaald', 'op_factuur', 'mislukt', 'geannuleerd', 'verlopen')),
  payment_method text not null check (payment_method in ('mollie', 'factuur')),
  fulfilment text not null check (fulfilment in ('afhalen', 'leveren')),
  store text,
  delivery jsonb,
  wanted_date date,
  note text,
  lines jsonb not null,
  subtotal integer not null,         -- eurocent, incl. btw
  deposit integer not null default 0,
  delivery_fee integer not null default 0,
  total integer not null,
  mollie_payment_id text,
  onlinefact_document_id text,
  onlinefact_number text,
  onlinefact_error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.orders add column if not exists age_confirmed_for integer;  -- 16 of 18: klant bevestigde die leeftijd bij deze bestelling
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
alter table public.orders enable row level security;
drop policy if exists "eigen bestellingen lezen" on public.orders;
create policy "eigen bestellingen lezen" on public.orders for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

-- ---------- Instellingen (één rij) ----------
create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  delivery_fee integer not null default 750,          -- eurocent
  free_delivery_from integer not null default 15000,
  min_order integer not null default 3000,
  delivery_zips text[] not null default array['9200','9220','9240','9255','9280','9290'],
  delivery_vat numeric not null default 21,
  lead_days integer not null default 1,                -- vroegste levering/afhaling: vandaag + x dagen
  pickup_stores jsonb not null default '[
    {"id":"baasrode","name":"Baasrode","address":"Theodoor Vermijlenstraat 20 A/B, 9200 Baasrode"},
    {"id":"overmere","name":"Overmere","address":"Heikantstraat 39, 9290 Overmere"}
  ]'::jsonb,
  example_values boolean not null default true,        -- true = voorbeeldwaarden, nog te bevestigen door VR Drinks
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;
alter table public.settings enable row level security;
drop policy if exists "instellingen publiek lezen" on public.settings;
create policy "instellingen publiek lezen" on public.settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.settings from anon, authenticated;
grant select on public.settings to anon, authenticated;
