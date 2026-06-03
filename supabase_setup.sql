-- =====================================================================
--  Brief to Brand — Configuration de la base de données Supabase
--  À coller dans : Supabase → SQL Editor → New query → Run
--  (Vous pouvez tout coller d'un coup et cliquer sur "Run".)
-- =====================================================================

-- ---------- TABLE : profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  prenom      text,
  email       text,
  plan        text not null default 'solo',
  created_at  timestamptz not null default now()
);

-- ---------- TABLE : brands ----------
create table if not exists public.brands (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  nom            text not null,
  secteur        text,
  site_web       text,
  couleur        text,
  contenu_source text,
  brand_memory   jsonb,
  created_at     timestamptz not null default now()
);

-- ---------- TABLE : generated_contents ----------
create table if not exists public.generated_contents (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  sujet       text,
  format      text,
  contenu     text,
  created_at  timestamptz not null default now()
);

-- ---------- TABLE : leads ----------
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  email           text,
  prenom          text,
  plan_interesse  text,
  source          text,
  created_at      timestamptz not null default now()
);

-- =====================================================================
--  SÉCURITÉ (Row Level Security)
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.brands             enable row level security;
alter table public.generated_contents enable row level security;
alter table public.leads              enable row level security;

-- profiles : chacun ne voit / modifie que son propre profil
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- brands : chacun gère uniquement ses marques
drop policy if exists "brands_all_own" on public.brands;
create policy "brands_all_own" on public.brands for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generated_contents : chacun gère uniquement ses contenus
drop policy if exists "contents_all_own" on public.generated_contents;
create policy "contents_all_own" on public.generated_contents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- leads : insertion publique (capture depuis la landing), pas de lecture publique
drop policy if exists "leads_insert_public" on public.leads;
create policy "leads_insert_public" on public.leads for insert
  to anon, authenticated with check (true);

-- =====================================================================
--  Création automatique du profil à l'inscription
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, prenom, email, plan)
  values (new.id, new.raw_user_meta_data->>'prenom', new.email, 'solo')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
--  STOCKAGE DES DOCUMENTS (Supabase Storage)
--  Bucket privé "brand-documents" + accès limité à ses propres dossiers.
--  (Optionnel en mode démo : l'analyse fonctionne même sans ça ; mais
--   nécessaire pour réellement stocker les fichiers uploadés.)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('brand-documents', 'brand-documents', false)
on conflict (id) do nothing;

-- Chaque utilisateur n'accède qu'au dossier portant son propre id.
drop policy if exists "brand_docs_insert" on storage.objects;
create policy "brand_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_docs_select" on storage.objects;
create policy "brand_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'brand-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_docs_delete" on storage.objects;
create policy "brand_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
--  ESPACE ADMIN : autoriser un compte à lire prospects + inscrits
-- =====================================================================
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Fonction SECURITY DEFINER (évite la récursion RLS sur profiles)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Les admins peuvent lire tous les leads et tous les profils
drop policy if exists "leads_select_admin" on public.leads;
create policy "leads_select_admin" on public.leads for select
  to authenticated using (public.is_admin());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles for select
  to authenticated using (public.is_admin());

-- Les admins peuvent voir ET supprimer toutes les marques (tous les comptes)
drop policy if exists "brands_select_admin" on public.brands;
create policy "brands_select_admin" on public.brands for select
  to authenticated using (public.is_admin());

drop policy if exists "brands_delete_admin" on public.brands;
create policy "brands_delete_admin" on public.brands for delete
  to authenticated using (public.is_admin());

-- 👉 REMPLACEZ l'email ci-dessous par celui avec lequel VOUS vous êtes inscrite,
--    puis exécutez. (Le compte doit déjà exister : inscrivez-vous d'abord dans l'app.)
update public.profiles set is_admin = true where email = 'VOTRE_EMAIL_ICI';

-- =====================================================================
--  RÉGLAGE GLOBAL : l'admin active/désactive la suppression de marque
-- =====================================================================
create table if not exists public.app_settings (
  id int primary key default 1,
  allow_brand_delete boolean not null default true,
  constraint app_settings_single_row check (id = 1)
);
insert into public.app_settings (id, allow_brand_delete)
  values (1, true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Tout le monde (connecté) peut LIRE le réglage
drop policy if exists "settings_select_all" on public.app_settings;
create policy "settings_select_all" on public.app_settings for select
  to authenticated using (true);

-- Seul l'admin peut MODIFIER le réglage
drop policy if exists "settings_update_admin" on public.app_settings;
create policy "settings_update_admin" on public.app_settings for update
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
--  RAPPELS DE PUBLICATION (fonctionnalité "Me rappeler" du calendrier)
-- =====================================================================
create table if not exists public.publication_reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  brand_id     uuid references public.brands(id) on delete cascade,
  sujet        text,
  reseau       text,
  rappel_date  date,
  rappel_heure time,
  contenu      text,
  statut       text default 'planifie',
  created_at   timestamptz default now()
);

alter table public.publication_reminders enable row level security;

-- Chaque utilisateur ne gère que ses propres rappels
drop policy if exists "reminders_all_own" on public.publication_reminders;
create policy "reminders_all_own" on public.publication_reminders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
--  Terminé. Vous devriez voir "Success. No rows returned".
-- =====================================================================
