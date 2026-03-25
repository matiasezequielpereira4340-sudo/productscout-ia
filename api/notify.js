// ProductScout IA - Notify API (Resend emails)
// POST /api/notify - envia emails de bienvenida y vencimiento
// GET  /api/notify/cron - cron job diario para vencimientos

const RESEND_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'ProductScout IA <noreply@productscout-ia.com>';
const APP_URL = process.env.APP_URL || 'https://productscout-ia.vercel.app';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function sbFetch(path, method = 'GET', body = null) {
    const opts = {
          method,
          headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': 'Bearer ' + SUPABASE_KEY,
                  'Content-Type': 'application/json'
          }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
    return res.json();
}

async function sendEmail(to, subject, html) {
    if (!RESEND_KEY) return { error: 'RESEND_API_KEY no configurada' };
    const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
                  'Authorization': 'Bearer ' + RESEND_KEY,
                  'Content-Type': 'application/json'
          },
          body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
    });
    return res.json();
}

function welcomeHtml(username, plan, expiresAt) {
    const expDate = new Date(expiresAt).toLocaleDateString('es-AR');
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050a0f;color:#e0f0ff;padding:32px;border-radius:12px">
          <h1 style="color:#00e5ff">🛰️ Bienvenido a ProductScout IA</h1>
              <p>Hola <strong>${username}</strong>, tu cuenta fue activada correctamente.</p>
                  <div style="background:#0a1520;border:1px solid #00e5ff44;border-radius:8px;padding:16px;margin:20px 0">
                        <p style="margin:0"><strong>Plan:</strong> ${plan}</p>
                              <p style="margin:8px 0 0"><strong>Acceso hasta:</strong> ${expDate}</p>
                                  </div>
                                      <a href="${APP_URL}" style="display:inline-block;background:#00e5ff;color:#050a0f;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
                                            Ingresar a la plataforma
                                                </a>
                                                    <p style="color:#666;font-size:12px;margin-top:24px">ProductScout IA - Innovasmart</p>
                                                      </div>`;
}

function expiryHtml(username, daysLeft, plan) {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050a0f;color:#e0f0ff;padding:32px;border-radius:12px">
          <h1 style="color:#ffaa00">⚠️ Tu acceso vence en ${daysLeft} dias</h1>
              <p>Hola <strong>${username}</strong>, tu plan <strong>${plan}</strong> esta por vencer.</p>
                  <p>Renova ahora para seguir explorando mercados internacionales sin interrupciones.</p>
                      <a href="${APP_URL}?action=renew" style="display:inline-block;background:#00e5ff;color:#050a0f;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
                            Renovar mi plan
                                </a>
                                    <p style="color:#666;font-size:12px;margin-top:24px">ProductScout IA - Innovasmart</p>
                                      </div>`;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

  const url = (req.url || '').split('?')[0];

  // SEND WELCOME EMAIL after registration
  if (req.method === 'POST') {
        const { type, email, username, plan, expires_at } = req.body || {};
        if (!email || !username) return res.status(400).json({ error: 'Faltan datos' });

      let result;
        if (type === 'welcome') {
                result = await sendEmail(
                          email,
                          'Bienvenido a ProductScout IA - Tu cuenta esta lista',
                          welcomeHtml(username, plan, expires_at)
                        );
        } else if (type === 'expiry') {
                const daysLeft = req.body.days_left || 3;
                result = await sendEmail(
                          email,
                          'Tu acceso a ProductScout IA vence en ' + daysLeft + ' dias',
                          expiryHtml(username, daysLeft, plan)
                        );
        } else {
                return res.status(400).json({ error: 'Tipo de email invalido' });
        }

      return res.status(200).json({ sent: true, result });
  }

  // CRON - check expiring accounts (call daily via Vercel cron)
  if (req.method === 'GET' && url.endsWith('/cron')) {
        const cronKey = req.headers['x-cron-key'];
        if (cronKey !== process.env.CRON_SECRET) {
                return res.status(401).json({ error: 'No autorizado' });
        }

      const now = new Date();
        const in3days = new Date(now.getTime() + 3 * 86400000).toISOString();
        const in1day  = new Date(now.getTime() + 1 * 86400000).toISOString();

      // Find users expiring in ~3 days (between 2.5 and 3.5 days from now)
      const users = await sbFetch(
              'users?active=eq.true&payment_status=eq.paid' +
              '&expires_at=lt.' + in3days +
              '&expires_at=gt.' + now.toISOString() +
              '&select=username,email,plan,expires_at'
            );

      const results = [];
        if (Array.isArray(users)) {
                for (const u of users) {
                          if (!u.email) continue;
                          const expiresAt = new Date(u.expires_at);
                          const daysLeft = Math.ceil((expiresAt - now) / 86400000);
                          if (daysLeft <= 3 && daysLeft >= 1) {
                                      const r = await sendEmail(
                                                    u.email,
                                                    'Tu acceso a ProductScout IA vence en ' + daysLeft + ' dias',
                                                    expiryHtml(u.username, daysLeft, u.plan)
                                                  );
                                      results.push({ username: u.username, days_left: daysLeft, sent: !r.error });
                          }
                }
        }

      return res.status(200).json({ checked: results.length, notifications: results });
  }

  return res.status(405).json({ error: 'Metodo no permitido' });
}
