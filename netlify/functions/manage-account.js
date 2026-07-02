// netlify/functions/manage-account.js
//
// Permet au Super Admin de modifier (nom/e-mail) ou supprimer un compte
// (typiquement le contact administratif d'une école). Utilise la clé
// service_role, jamais exposée au navigateur.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const { action, userId, email, full_name, password, requesterToken } = JSON.parse(event.body || '{}');

    if (!action || !userId || !requesterToken) {
      return { statusCode: 400, body: 'Champs manquants' };
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: requesterData, error: authError } = await supabaseAdmin.auth.getUser(requesterToken);
    if (authError || !requesterData?.user) {
      return { statusCode: 401, body: 'Non authentifié' };
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, school_id')
      .eq('id', requesterData.user.id)
      .single();

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, school_id')
      .eq('id', userId)
      .single();

    const isSuperAdmin = requesterProfile?.role === 'super_admin';
    const isSchoolAdmin = requesterProfile?.role === 'admin'
      && targetProfile
      && targetProfile.school_id === requesterProfile.school_id
      && ['prof', 'eleve', 'parent'].includes(targetProfile.role);

    if (!isSuperAdmin && !isSchoolAdmin) {
      return { statusCode: 403, body: 'Action réservée au Super Admin ou à l\'administration de l\'école concernée' };
    }

    if (action === 'update') {
      const authUpdates = {};
      if (email) authUpdates.email = email;
      if (password) authUpdates.password = password;
      if (Object.keys(authUpdates).length) {
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates);
        if (updErr) return { statusCode: 400, body: updErr.message };
      }
      const profileUpdates = {};
      if (full_name !== undefined) profileUpdates.full_name = full_name;
      if (email) profileUpdates.email = email;
      if (Object.keys(profileUpdates).length) {
        await supabaseAdmin.from('profiles').update(profileUpdates).eq('id', userId);
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'delete') {
      await supabaseAdmin.from('profiles').delete().eq('id', userId);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) return { statusCode: 400, body: delErr.message };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: 'Action inconnue' };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
