// netlify/functions/paydunya-ipn.js
//
// Reçoit la notification instantanée de paiement (IPN) envoyée par PayDunya
// dès qu'un paiement est complété, vérifie son authenticité (hash SHA-512
// de la clé maître), puis met à jour Supabase automatiquement :
// enregistre le paiement et réactive l'accès de l'école.
//
// PayDunya envoie cette requête en application/x-www-form-urlencoded,
// avec des clés imbriquées du type data[status], data[hash],
// data[custom_data][school_id], etc.

const crypto = require('crypto');
const qs = require('qs');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const parsed = qs.parse(event.body || '');
    const data = parsed.data;
    if (!data || !data.hash) {
      return { statusCode: 400, body: 'Requête invalide' };
    }

    // 1. Vérifier l'authenticité : le hash doit être le SHA-512 de la clé maître
    const expectedHash = crypto
      .createHash('sha512')
      .update(process.env.PAYDUNYA_MASTER_KEY)
      .digest('hex');
    if (data.hash !== expectedHash) {
      return { statusCode: 401, body: 'Signature invalide' };
    }

    const status = data.status || (data.invoice && data.invoice.status);
    const customData = data.custom_data || {};
    const schoolId = customData.school_id;
    const duration = customData.duration;
    const amount = data.invoice ? Number(data.invoice.total_amount) : null;

    if (!schoolId) {
      return { statusCode: 400, body: 'school_id manquant dans custom_data' };
    }

    // On accuse toujours réception (200) pour éviter que PayDunya ne re-tente
    // indéfiniment, même si le paiement n'est pas "completed" (pending/cancelled...).
    if (status !== 'completed') {
      return { statusCode: 200, body: 'OK — statut non finalisé : ' + status };
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 2. Enregistrer le paiement
    await supabaseAdmin.from('payments').insert({
      school_id: schoolId,
      amount: amount || 0,
      pay_date: new Date().toISOString().slice(0, 10),
      note: 'PayDunya — ' + (duration === 'annuel' ? 'abonnement annuel' : 'abonnement mensuel'),
    });

    // 3. Réactiver l'école et repousser l'échéance
    const nextDue = new Date();
    if (duration === 'annuel') nextDue.setFullYear(nextDue.getFullYear() + 1);
    else nextDue.setMonth(nextDue.getMonth() + 1);

    await supabaseAdmin.from('schools').update({
      status: 'actif',
      next_due: nextDue.toISOString().slice(0, 10),
    }).eq('id', schoolId);

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
