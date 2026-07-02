-- ============================================================
-- KAMPUSYA — Schéma Supabase (V1, architecture "school_data" JSON)
-- À coller dans Supabase → SQL Editor → Run
-- ============================================================
-- Choix d'architecture pour ce V1 :
-- Les données pédagogiques d'une école (classes, élèves, notes, appel,
-- cahier de texte, etc.) sont stockées en un seul bloc JSON par école
-- (table school_data). C'est la façon la plus rapide de brancher le
-- prototype existant sur une vraie base de données partagée.
-- Limite connue : moins de contrôle fin par rôle qu'un schéma
-- entièrement relationnel (voir le guide de déploiement pour la
-- structure cible en tables séparées, à prévoir une fois la
-- plateforme validée avec les premières écoles).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- ÉCOLES ----------
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year text default '',
  contact text default '',
  plan text default 'Essentiel',
  status text not null default 'essai' check (status in ('actif','essai','suspendu')),
  next_due date,
  created_at timestamptz default now()
);

-- ---------- PAIEMENTS ----------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  amount numeric not null,
  pay_date date not null,
  note text default '',
  created_at timestamptz default now()
);

-- ---------- COMPTES (relie auth.users à une école + un rôle) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade, -- null pour super_admin
  role text not null check (role in ('super_admin','admin','prof','eleve','parent')),
  full_name text default '',
  email text default '',
  created_at timestamptz default now()
);
-- Si la table existait déjà avant cette mise à jour :
alter table profiles add column if not exists email text default '';

-- ---------- DONNÉES PÉDAGOGIQUES (un bloc JSON par école) ----------
create table if not exists school_data (
  school_id uuid primary key references schools(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- ============================================================
-- FONCTIONS D'AIDE (SECURITY DEFINER pour éviter la récursion RLS)
-- ============================================================
create or replace function my_role() returns text
language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function my_school_id() returns uuid
language sql security definer stable as $$
  select school_id from profiles where id = auth.uid();
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table schools enable row level security;
alter table payments enable row level security;
alter table profiles enable row level security;
alter table school_data enable row level security;

-- schools : le Super Admin gère tout ; chaque école ne voit que sa propre ligne
-- (utile pour vérifier le statut d'abonnement à la connexion)
create policy "super_admin_full_access_schools" on schools
  for all using (my_role() = 'super_admin');
create policy "members_view_own_school" on schools
  for select using (id = my_school_id());

-- payments : réservé au Super Admin
create policy "super_admin_manages_payments" on payments
  for all using (my_role() = 'super_admin');

-- profiles : chacun voit son propre profil ; l'admin voit les profils de son école ;
-- le Super Admin voit tout
create policy "view_own_profile" on profiles
  for select using (id = auth.uid());
create policy "admin_views_school_profiles" on profiles
  for select using (my_role() = 'admin' and school_id = my_school_id());
create policy "super_admin_views_all_profiles" on profiles
  for select using (my_role() = 'super_admin');
create policy "super_admin_updates_profiles" on profiles
  for update using (my_role() = 'super_admin');

-- school_data : lecture pour tout membre authentifié de l'école ;
-- écriture pour tout membre authentifié de l'école (nécessaire car les élèves
-- envoient des justificatifs et les parents visent le comportement — un schéma
-- relationnel permettrait une restriction plus fine par type d'action)
create policy "members_read_school_data" on school_data
  for select using (school_id = my_school_id() or my_role() = 'super_admin');
create policy "members_write_school_data" on school_data
  for insert with check (school_id = my_school_id());
create policy "members_update_school_data" on school_data
  for update using (school_id = my_school_id())
  with check (school_id = my_school_id());

-- ============================================================
-- ÉCOLE DE DÉMARRAGE (à adapter ou supprimer)
-- ============================================================
insert into schools (name, year, contact, plan, status, next_due)
values ('Mon École', '2025–2026', 'contact@monecole.ci', 'Essentiel', 'essai', current_date + interval '30 days')
on conflict do nothing;

-- Après avoir créé ce script, récupérez l'id de l'école créée :
-- select id from schools where name = 'Mon École';
-- Puis créez le premier compte administrateur avec la fonction Netlify
-- create-account (voir README) en utilisant cet id comme school_id
-- et le rôle 'admin'. Pour créer le compte Super Admin (vous, AN Technology
-- Group), utilisez le rôle 'super_admin' et school_id = null.
