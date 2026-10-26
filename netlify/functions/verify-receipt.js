// netlify/functions/verify-receipt.js
//
// Vérification PUBLIQUE d'un reçu de scolarité (appelée quand quelqu'un
// scanne le QR code imprimé sur le reçu). Aucune connexion requise.
// Sécurité : on ne retrouve un reçu qu'avec l'identifiant de l'école ET son
// code de vérification aléatoire (12 caractères, impossible à deviner).
// Seules les informations utiles à la vérification sont renvoyées.

const { createClient } = require('@supabase/supabase-js');

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ found: false }) };
  }
  try {
    const schoolId = (event.queryStringParameters?.s || '').trim();
    const code = (event.queryStringParameters?.c || '').trim().toUpperCase();
    const uuidOk = /^[0-9a-f-]{36}$/i.test(schoolId);
    if (!uuidOk || !/^[A-Z0-9]{8,20}$/.test(code)) {
      return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
    }

    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const [{ data: school }, { data: row }] = await Promise.all([
      supabaseAdmin.from('schools').select('name').eq('id', schoolId).maybeSingle(),
      supabaseAdmin.from('school_data').select('data').eq('school_id', schoolId).maybeSingle(),
    ]);
    const data = row?.data || {};
    const payments = data.finance?.paiementsScolarite || [];
    const p = payments.find((x) => x.verifCode === code);
    if (!school || !p) {
      return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
    }
    const stu = (data.students || []).find((s) => s.id === p.studentId);
    const cls = stu ? (data.classes || []).find((c) => c.id === stu.classId) : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: true,
        annule: !!p.annule,
        annuleLe: p.annuleLe || null,
        schoolName: school.name || data.school?.name || 'Établissement',
        numero: p.numero,
        studentName: stu ? stu.name : '—',
        className: cls ? cls.name : null,
        montant: p.montant,
        date: p.date,
        mode: p.mode || null,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ found: false, error: 'Erreur serveur' }) };
  }
};
