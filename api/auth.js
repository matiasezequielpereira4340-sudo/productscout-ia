// ProductScout IA - Auth API
// POST /api/auth - login usando USERS_DB (mismo sistema que users.js)

const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_PASS = process.env.APP_PASS || 'maty123';
const ADMIN_KEY  = process.env.ADMIN_KEY  || 'pf-admin-secret-2024';

function cors(res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getUsers() {
      try {
              return process.env.USERS_DB ? JSON.parse(process.env.USERS_DB) : [];
      } catch {
              return [];
      }
}

function isExpired(u) {
      if (!u.expiryDays || !u.createdAt) return false;
      const expiry = new Date(u.createdAt);
      expiry.setDate(expiry.getDate() + u.expiryDays);
      return new Date() > expiry;
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

  // Buscar en USERS_DB
  const users = getUsers();
      const user = users.find(u => u.username === username);

  if (!user || user.password !== password) {
          return res.status(401).json({ success: false, error: 'Usuario o contrasena incorrectos' });
  }

  if (!user.active) {
          return res.status(403).json({ success: false, error: 'Cuenta desactivada. Contacta al administrador.' });
  }

  if (isExpired(user)) {
          return res.status(403).json({ success: false, error: 'Tu acceso expiro. Contacta al administrador para renovar.', expired: true });
  }

  // Calcular fecha de expiracion
  let expiresAt = null;
      if (user.createdAt && user.expiryDays) {
              const d = new Date(user.createdAt);
              d.setDate(d.getDate() + user.expiryDays);
              expiresAt = d.toISOString();
      }

  const plan = user.plan || 'basico';
      const searchesLimit = plan === 'pro' || plan === 'agencia' ? 999 : (user.searches_limit || 10);

  return res.status(200).json({
          success: true,
          role: user.role || 'user',
          user: username,
          email: user.email || '',
          plan: plan,
          expires_at: expiresAt,
          expiresAt: expiresAt,
          searches_used: user.searches_used || 0,
          searches_limit: searchesLimit,
          expiryDays: user.expiryDays
  });
}
