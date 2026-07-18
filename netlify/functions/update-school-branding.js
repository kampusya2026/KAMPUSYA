// netlify/functions/update-school-branding.js
//
// Permet à l'admin d'une école (ou au Super Admin) de mettre à jour le logo
// et le cachet/signature de SA PROPRE école. La table "schools" ne donne
// normalement que la lecture à un admin d'école (RLS) — cette fonction
// utilise la clé service_role pour effectuer la mise à jour, après avoir
// vérifié que la personne a bien le droit de le faire.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const { schoolId, logo, signature, requesterToken } = JSON.parse(event.body || '{}');
    if (!schoolId || !requesterToken) {
      return { statusCode: 400, body: 'Champs manquants' };
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: requesterData, error: authError } = await supabaseAdmin.auth.getUser(requesterToken);
    if (authError || !requesterData?.user) {
      return { statusCode: 401, body: 'Non authentifié — détail : ' + (authError ? authError.message : 'aucun utilisateur trouvé pour ce jeton') };
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles').select('role, school_id').eq('id', requesterData.user.id).single();

    const isSuperAdmin = requesterProfile?.role === 'super_admin';
    const isSchoolAdmin = requesterProfile?.role === 'admin' && requesterProfile.school_id === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
      return { statusCode: 403, body: 'Action interdite pour ce compte' };
    }

    const updates = {};
    if (logo !== undefined) updates.logo = logo;
    if (signature !== undefined) updates.signature = signature;

    const { error } = await supabaseAdmin.from('schools').update(updates).eq('id', schoolId);
    if (error) {
      return { statusCode: 400, body: error.message };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
