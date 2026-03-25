// ProductScout IA - Auth API (Supabase)
// POST /api/auth - login con validacion Supabase + admin fallback

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_PASS = process.env.APP_PASS || 'maty123';

const PLAN_NAMES = {
    basico: 'Basico',
    pro: 'Pro',
    agencia: 'Agencia'
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
                  'Content-Type': 'application/json'
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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const { username, password } = req.body || {};
    if (!username || !password) {
          return res.status(400).json({ success: false, error: 'Faltan credenciales' });
    }

  // Admin hardcoded (nunca expira)
  if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.status(200).json({
                success: true,
                role: 'admin',
                user: username,
                plan: 'admin',
                searches_used: 0,
                searches_limit: 999
        });
  }

  // Supabase lookup (if configured)
  if (SUPABASE_URL && SUPABASE_KEY) {
        const result = await sbFetch(
                'users?username=eq.' + encodeURIComponent(username) +
                '&select=username,password,email,role,plan,active,payment_status,expires_at,searches_this_month,searches_limit,month_reset'
              );

      if (!result.ok) {
              return res.status(500).json({ success: false, error: 'Error de base de datos' });
      }

      const users = result.data;
        if (!users || users.length === 0) {
                return res.status(401).json({ success: false, error: 'Usuario o contrasena incorrectos' });
        }

      const user = users[0];

      if (user.password !== password) {
              return res.status(401).json({ success: false, error: 'Usuario o contrasena incorrectos' });
      }
        if (!user.active) {
                return res.status(403).json({ success: false, error: 'Cuenta desactivada. Contacta al administrador.' });
        }
        if (user.payment_status !== 'paid') {
                return res.status(403).json({
                          success: false,
                          error: 'Pago pendiente. Completa el pago para acceder.',
                          payment_status: user.payment_status
                });
        }
        if (user.expires_at && new Date() > new Date(user.expires_at)) {
                return res.status(403).json({
                          success: false,
                          error: 'Tu acceso expiro. Renova tu plan para continuar.',
                          expired: true
                });
        }

      // Reset monthly counter if needed
      const now = new Date();
        let searchesUsed = user.searches_this_month || 0;
        if (user.month_reset && now >= new Date(user.month_reset)) {
                searchesUsed = 0;
                await sbFetch(
                          'users?username=eq.' + encodeURIComponent(username),
                          'PATCH',
                  {
                              searches_this_month: 0,
                              month_reset: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
                  }
                        );
        }

      return res.status(200).json({
              success: true,
              role: user.role || 'user',
              user: username,
              email: user.email,
              plan: user.plan,
              plan_name: PLAN_NAMES[user.plan] || user.plan,
              expires_at: user.expires_at,
              searches_used: searchesUsed,
              searches_limit: user.searches_limit || 10,
              payment_status: user.payment_status
      });
  }

  // Fallback if Supabase not configured
  return res.status(401).json({ success: false, error: 'Usuario o contrasena incorrectos' });
}
