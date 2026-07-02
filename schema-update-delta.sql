-- ============================================================
-- KAMPUSYA — Mise à jour incrémentale (à exécuter une seule fois)
-- Ajoute uniquement ce qui manque, sans toucher au reste.
-- ============================================================

-- Colonne e-mail sur les profils (pour l'édition du contact admin)
alter table profiles add column if not exists email text default '';

-- Règle de sécurité : le Super Admin peut modifier les profils
drop policy if exists "super_admin_updates_profiles" on profiles;
create policy "super_admin_updates_profiles" on profiles
  for update using (my_role() = 'super_admin');
