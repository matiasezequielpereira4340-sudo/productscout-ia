// ProductScout IA - Auth + User Management API
// Admin: matypereira (never expires, full access)
// Regular users: expire after N days from activation

const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_PASS = process.env.APP_PASS || 'maty123';
const ADMIN_KEY = process.env.ADMIN_KEY || 'pf-admin-secret-2024';

function getUsers() {
  try { return process.env.USERS_DB ? JSON.parse(process.env.USERS_DB) : []; }
  catch { return []; }
}

function isExpired(u) {
  if (!u.expiryDays || !u.createdAt) return false;
  const expiry = new Date(u.createdAt);
  expiry.setDate(expiry.getDate() + u.expiryDays);
  return new Date() > expiry;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-key');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { username, password, action } = req.body || {};

  if (action === 'login') {
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    // Admin check - never expires
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      return res.status(200).json({
        success: true,
        role: 'admin',
        username: ADMIN_USER,
        expiresAt: null
      });
    }

    // Regular user check
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Tu cuenta está desactivada. Contactá al administrador.' });
    }

    if (isExpired(user)) {
      return res.status(403).json({ error: 'Tu sesión expiró. Contactá al administrador para renovarla.' });
    }

    // Calculate expiry date
    const createdAt = new Date(user.createdAt);
    const expiresAt = new Date(createdAt);
    expiresAt.setDate(expiresAt.getDate() + user.expiryDays);

    return res.status(200).json({
      success: true,
      role: 'user',
      username: user.username,
      expiresAt: expiresAt.toISOString()
    });
  }

  return res.status(400).json({ error: 'Acción no reconocida' });
}
