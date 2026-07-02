// netlify/functions/create-account.js
//
// Crée un compte utilisateur (professeur, élève, parent, ou admin) de façon
// sécurisée : la clé "service role" de Supabase (tout-puissante) reste ici,
// côté serveur, et n'est jamais envoyée au navigateur.
//
// Variables d'environnement à définir dans Netlify (Site settings → Environment variables) :
//   SUPABASE_URL              = https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = clé "service_role" (Project Settings → API sur Supabase)

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const { email, password, full_name, role, school_id, requesterToken } = JSON.parse(event.body || '{}');

    if (!email || !password || !role || !requesterToken) {
      return { statusCode: 400, body: 'Champs manquants' };
    }
    if (!['admin', 'prof', 'eleve', 'parent', 'super_admin'].includes(role)) {
      return { statusCode: 400, body: 'Rôle invalide' };
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Vérifier qui fait la demande (le jeton envoyé par le navigateur du demandeur)
    const { data: requesterData, error: authError } = await supabaseAdmin.auth.getUser(requesterToken);
    if (authError || !requesterData?.user) {
      return { statusCode: 401, body: 'Non authentifié' };
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, school_id')
      .eq('id', requesterData.user.id)
      .single();

    const isSuperAdmin = requesterProfile?.role === 'super_admin';
    const isSchoolAdmin = requesterProfile?.role === 'admin' && requesterProfile.school_id === school_id;

    // Seul un Super Admin peut créer un compte "admin" ou un autre "super_admin".
    // Un admin d'école peut créer des comptes prof / élève / parent pour SA propre école.
    const allowed =
      isSuperAdmin ||
      (isSchoolAdmin && ['prof', 'eleve', 'parent'].includes(role));

    if (!allowed) {
      return { statusCode: 403, body: 'Action interdite pour ce compte' };
    }

    // 2. Créer le compte d'authentification
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) {
      return { statusCode: 400, body: createError.message };
    }

    // 3. Créer la fiche profil associée (rôle + école)
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: newUser.user.id,
      school_id: role === 'super_admin' ? null : school_id,
      role,
      full_name: full_name || '',
      email,
    });
    if (profileError) {
      // Nettoyage si la création du profil échoue
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return { statusCode: 400, body: profileError.message };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ id: newUser.user.id, email }),
    };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
