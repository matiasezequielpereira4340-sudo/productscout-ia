// ProductScout IA - Payment API (Mercado Pago)
// POST /api/payment/create  -> crea preferencia de pago MP
// POST /api/payment/webhook -> recibe notificacion MP y activa cuenta

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://productscout-ia.vercel.app';

const PLANS = {
    basico:  { name: 'Plan Basico',  price: 10, searches: 10  },
    pro:     { name: 'Plan Pro',     price: 25, searches: 999 },
    agencia: { name: 'Plan Agencia', price: 60, searches: 999 }
};

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function sbFetch(path, method = 'GET', body = null) {
    const opts = {
          method,
          headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': 'Bearer ' + SUPABASE_KEY,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
          }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
    const data = await res.json();
    return { ok: res.ok, data };
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

  const url = (req.url || '').split('?')[0];

  // CREATE PAYMENT PREFERENCE
  if (url.endsWith('/create') && req.method === 'POST') {
        const { username, plan } = req.body || {};
        if (!username || !plan || !PLANS[plan]) {
                return res.status(400).json({ error: 'Datos invalidos' });
        }

      // Verify user exists
      const userRes = await sbFetch(`users?username=eq.${encodeURIComponent(username)}&select=id,plan`);
        if (!userRes.ok || userRes.data.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
        }

      const planInfo = PLANS[plan];
        const preference = {
                items: [{
                          title: 'ProductScout IA - ' + planInfo.name,
                          quantity: 1,
                          unit_price: planInfo.price,
                          currency_id: 'USD'
                }],
                external_reference: username + '|' + plan,
                back_urls: {
                          success: APP_URL + '?payment=success&plan=' + plan,
                          failure: APP_URL + '?payment=failure',
                          pending: APP_URL + '?payment=pending'
                },
                auto_return: 'approved',
                notification_url: APP_URL + '/api/payment/webhook'
        };

      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
              method: 'POST',
              headers: {
                        'Authorization': 'Bearer ' + MP_ACCESS_TOKEN,
                        'Content-Type': 'application/json'
              },
              body: JSON.stringify(preference)
      });
        const mpData = await mpRes.json();

      if (!mpRes.ok) {
              return res.status(500).json({ error: 'Error al crear preferencia MP', detail: mpData });
      }

      return res.status(200).json({
              init_point: mpData.init_point,
              sandbox_init_point: mpData.sandbox_init_point,
              preference_id: mpData.id
      });
  }

  // WEBHOOK - MP notifica pago aprobado
  if (url.endsWith('/webhook') && req.method === 'POST') {
        const { type, data } = req.body || {};

      if (type === 'payment' && data?.id) {
              const mpRes = await fetch('https://api.mercadopago.com/v1/payments/' + data.id, {
                        headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN }
              });
              const payment = await mpRes.json();

          if (payment.status === 'approved') {
                    const ref = payment.external_reference || '';
                    const [username, plan] = ref.split('|');
                    if (username && PLANS[plan]) {
                                const now = new Date();
                                const expiresAt = new Date(now.getTime() + 30 * 86400000).toISOString();
                                await sbFetch(
                                              'users?username=eq.' + encodeURIComponent(username),
                                              'PATCH',
                                  {
                                                  payment_status: 'paid',
                                                  active: true,
                                                  plan,
                                                  searches_limit: PLANS[plan].searches,
                                                  searches_this_month: 0,
                                                  expires_at: expiresAt,
                                                  month_reset: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
                                  }
                                            );
                    }
          }
      }
        return res.status(200).end();
  }

  return res.status(404).json({ error: 'Endpoint no encontrado' });
}
