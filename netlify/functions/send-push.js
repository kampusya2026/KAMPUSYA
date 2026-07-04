// netlify/functions/send-push.js
//
// Envoie une notification push (écran verrouillé) aux utilisateurs indiqués.
// Utilise la clé VAPID privée, jamais exposée au navigateur.
//
// Variables d'environnement à définir dans Netlify :
//   VAPID_PUBLIC_KEY  = (voir README)
//   VAPID_PRIVATE_KEY = (voir README, secrète)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (déjà en place)

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const { targetIds, title, body } = JSON.parse(event.body || '{}');
    if (!Array.isArray(targetIds) || !targetIds.length || !title) {
      return { statusCode: 400, body: 'Champs manquants' };
    }

    webpush.setVapidDetails(
      'mailto:info@kampusya.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, push_subscription')
      .in('id', targetIds);

    let sent = 0, failed = 0;
    for (const p of (profiles || [])) {
      if (!p.push_subscription) continue;
      try {
        await webpush.sendNotification(
          p.push_subscription,
          JSON.stringify({ title, body: body || '' })
        );
        sent++;
      } catch (e) {
        failed++;
        // Abonnement expiré ou invalide : on le retire silencieusement
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabaseAdmin.from('profiles').update({ push_subscription: null }).eq('id', p.id);
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
  } catch (e) {
    return { statusCode: 500, body: 'Erreur serveur : ' + e.message };
  }
};
