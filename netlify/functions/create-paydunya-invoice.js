// netlify/functions/create-paydunya-invoice.js
//
// Crée une facture PayDunya pour l'abonnement d'une école et renvoie l'URL
// de la page de paiement hébergée par PayDunya (Mobile Money, carte, etc.).
// Appelée par l'admin de l'école (paiement de son propre établissement)
// ou par le Super Admin (au nom d'une école).
//
// Variables d'environnement nécessaires (Netlify) :
//   PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN
//   PAYDUNYA_MODE = "test" ou "live"
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (déjà en place)

const { createClient } = require('@supabase/supabase-js');

const PLAN_PRICES = {
  starter:  { mensuel: 75000,  annuel: 750000 },
  standard: { mensuel: 150000, annuel: 1500000 },
  premium:  { mensuel: 300000, annuel: 3000000 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const { schoolId, duration, requesterToken } = JSON.parse(event.body || '{}');
    if (!schoolId || !duration || !requesterToken) {
      return { statusCode: 400, body: 'Champs manquants' };
    }
    if (!['mensuel', 'annuel'].includes(duration)) {
      return { statusCode: 400, body: 'Durée invalide' };
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Vérifier qui fait la demande
    const { data: requesterData, error: authError } = await supabaseAdmin.auth.getUser(requesterToken);
    if (authError || !requesterData?.user) {
      return { statusCode: 401, body: 'Non authentifié' };
    }
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles').select('role, school_id').eq('id', requesterData.user.id).single();

    const isSuperAdmin = requesterProfile?.role === 'super_admin';
    const isSchoolAdmin = requesterProfile?.role === 'admin' && requesterProfile.school_id === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
      return { statusCode: 403, body: 'Action interdite pour ce compte' };
    }

    // 2. Récupérer l'école et sa formule
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('schools').select('id, name, plan, contact').eq('id', schoolId).single();
    if (schoolError || !school) {
      return { statusCode: 404, body: 'École introuvable' };
    }
    const prices = PLAN_PRICES[school.plan];
    if (!prices) {
      return { statusCode: 400, body: 'Cette école est en période d\'essai — choisissez d\'abord une formule payante avant de générer un paiement.' };
    }
    const amount = prices[duration];

    // 3. Créer la facture PayDunya
    const apiBase = process.env.PAYDUNYA_MODE === 'live'
      ? 'https://app.paydunya.com/api/v1'
      : 'https://app.paydunya.com/sandbox-api/v1';
    const siteUrl = process.env.URL || process.env.APP_URL || '';

    const invoiceBody = {
      invoice: {
        total_amount: amount,
        description: 'Abonnement Kampusya — ' + school.name + ' — ' + (duration === 'mensuel' ? '1 mois' : '1 an'),
      },
      store: {
        name: 'Kampusya',
        website_url: siteUrl,
      },
      custom_data: {
        school_id: schoolId,
        duration: duration,
      },
      actions: {
        callback_url: siteUrl + '/.netlify/functions/paydunya-ipn',
        return_url: siteUrl + '/?paiement=succes',
        cancel_url: siteUrl + '/?paiement=annule',
      },
    };

    const pdRes = await fetch(apiBase + '/checkout-invoice/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY,
        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY,
        'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN,
      },
      body: JSON.stringify(invoiceBody),
    });
    const pdData = await pdRes.json();

    if (pdData.response_code !== '00') {
      return { statusCode: 400, body: 'Erreur PayDunya : ' + (pdData.response_text || 'inconnue') };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ url: pdData.response_text, amount, duration }),
    };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
