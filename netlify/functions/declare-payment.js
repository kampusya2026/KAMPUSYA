// netlify/functions/declare-payment.js
//
// Permet à l'admin d'une école de déclarer qu'il vient d'effectuer un
// paiement (via le lien Djamo). Le paiement est enregistré avec le statut
// "en_attente" — il n'active rien tout seul. Le Super Admin devra vérifier
// que l'argent est bien arrivé, puis confirmer manuellement.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const { schoolId, amount, requesterToken } = JSON.parse(event.body || '{}');
    if (!schoolId || !amount || !requesterToken) {
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
      .from('profiles').select('role, school_id').eq('id', requesterData.user.id).single();

    const isSchoolAdmin = requesterProfile?.role === 'admin' && requesterProfile.school_id === schoolId;
    if (!isSchoolAdmin) {
      return { statusCode: 403, body: 'Action réservée à l\'administration de cette école' };
    }

    const { error } = await supabaseAdmin.from('payments').insert({
      school_id: schoolId,
      amount,
      pay_date: new Date().toISOString().slice(0, 10),
      note: 'Déclaré par l\'établissement via Djamo — en attente de vérification',
      status: 'en_attente',
    });
    if (error) {
      return { statusCode: 400, body: error.message };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
