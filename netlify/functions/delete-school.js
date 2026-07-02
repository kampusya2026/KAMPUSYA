// netlify/functions/delete-school.js
//
// Supprime une école : supprime d'abord tous les comptes de connexion
// (admin, profs, élèves, parents) liés à cette école, puis l'école
// elle-même (ce qui supprime en cascade payments et school_data).
// Réservé au Super Admin. Utilise la clé service_role côté serveur uniquement.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const { schoolId, requesterToken } = JSON.parse(event.body || '{}');
    if (!schoolId || !requesterToken) {
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
      .select('role')
      .eq('id', requesterData.user.id)
      .single();

    if (requesterProfile?.role !== 'super_admin') {
      return { statusCode: 403, body: 'Action réservée au Super Admin' };
    }

    const { data: members } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('school_id', schoolId);

    for (const m of (members || [])) {
      await supabaseAdmin.auth.admin.deleteUser(m.id);
    }

    const { error: delErr } = await supabaseAdmin.from('schools').delete().eq('id', schoolId);
    if (delErr) return { statusCode: 400, body: delErr.message };

    return { statusCode: 200, body: JSON.stringify({ ok: true, deletedAccounts: (members || []).length }) };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
