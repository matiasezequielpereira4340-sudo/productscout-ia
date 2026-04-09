// ProductScout IA - Auth API
// POST /api/auth - login usando tabla ps_users en Supabase

const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_PASS = process.env.APP_PASS || 'maty123';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function cors(res) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function getUserFromDB(username) {
          try {
                      const res = await fetch(
                                    `${SUPABASE_URL}/rest/v1/ps_users?username=eq.${encodeURIComponent(username)}&select=*&limit=1`,
                              {
                                              headers: {
                                                                'apikey': SUPABASE_KEY,
                                                                'Authorization': `Bearer ${SUPABASE_KEY}`,
                                                                'Content-Type': 'application/json'
                                              }
                              }
                                  );
                      if (!res.ok) {
                                    console.error('getUserFromDB failed:', res.status, await res.text());
                                    return null;
                      }
                      const rows = await res.json();
                      return rows.length > 0 ? rows[0] : null;
          } catch(e) {
                      console.error('getUserFromDB error:', e.message);
                      return null;
          }
}

function isExpired(u) {
          if (!u.expires_at) return false;
          return Date.now() > new Date(u.expires_at).getTime();
}

export default async function handler(req, res) {
          cors(res);
          if (req.method === 'OPTIONS') return res.status(200).end();

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

  // Buscar en Supabase tabla ps_users
  const user = await getUserFromDB(username);

  if (!user || user.password_hash !== password) {
              return res.status(401).json({ success: false, error: 'Usuario o contrasena incorrectos' });
  }

  if (!user.active) {
              return res.status(403).json({ success: false, error: 'Cuenta desactivada. Contacta al administrador.' });
  }

  if (isExpired(user)) {
              return res.status(403).json({ success: false, error: 'Tu acceso expiro. Contacta al administrador para renovar.', expired: true });
  }

  return res.status(200).json({
              success: true,
              role: 'user',
              user: username,
              email: user.email || '',
              plan: user.plan || 'basico',
              expires_at: user.expires_at,
              expiresAt: user.expires_at,
              searches_used: user.searches_used || 0,
              searches_limit: user.searches_limit || 10
  });
}
