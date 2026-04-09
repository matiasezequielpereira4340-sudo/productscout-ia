// ProductScout IA - Users Management API
// Almacenamiento con Supabase (tabla: users)

const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_KEY = process.env.ADMIN_KEY || 'pf-admin-secret-2024';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbFetch(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
          ...options,
          headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation',
                  ...(options.headers || {})
          }
    });
    return res;
}

async function getUsers() {
    try {
          const res = await sbFetch('users?select=*&order=created_at.asc');
          if (!res.ok) return [];
          return await res.json();
    } catch(e) {
          console.error('getUsers error:', e.message);
          return [];
    }
}

async function createUser(username, password, expiryDays) {
    const res = await sbFetch('users', {
          method: 'POST',
          body: JSON.stringify({
                  username,
                  password,
                  expiry_days: parseInt(expiryDays) || 30,
                  active: true,
                  created_at: new Date().toISOString()
          })
    });
    return res.ok;
}

async function updateUser(username, data) {
    const res = await sbFetch(`users?username=eq.${encodeURIComponent(username)}`, {
          method: 'PATCH',
          body: JSON.stringify(data)
    });
    return res.ok;
}

async function deleteUserFromDB(username) {
    const res = await sbFetch(`users?username=eq.${encodeURIComponent(username)}`, {
          method: 'DELETE'
    });
    return res.ok;
}

function isExpired(u) {
    if (!u.expiry_days || !u.created_at) return false;
    const expiry = new Date(u.created_at);
    expiry.setDate(expiry.getDate() + u.expiry_days);
    return Date.now() > expiry.getTime();
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
        return res.status(403).json({ error: 'Acceso denegado' });
  }

  if (req.method === 'GET') {
        const users = await getUsers();
        return res.status(200).json({ users: [
          { username: ADMIN_USER, role: 'admin', active: true, expiryDays: null, createdAt: null },
                ...users.map(u => ({
                          username: u.username,
                          role: 'user',
                          active: u.active,
                          expiryDays: u.expiry_days,
                          createdAt: u.created_at,
                          expired: isExpired(u)
                }))
              ]});
  }

  if (req.method === 'POST') {
        const { username, password, expiryDays } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Faltan campos requeridos' });
        if (username === ADMIN_USER) return res.status(400).json({ error: 'Nombre de usuario reservado' });
        const existing = await getUsers();
        if (existing.find(u => u.username === username)) return res.status(400).json({ error: 'El usuario ya existe' });
        const ok = await createUser(username, password, expiryDays);
        if (!ok) return res.status(500).json({ error: 'Error al crear usuario en base de datos' });
        return res.status(201).json({ success: true, message: 'Usuario creado correctamente' });
  }

  if (req.method === 'DELETE') {
        const { username, action, active } = req.body || {};
        if (!username) return res.status(400).json({ error: 'Falta username' });
        if (action === 'toggle') {
                await updateUser(username, { active });
                return res.status(200).json({ success: true });
        } else {
                await deleteUserFromDB(username);
                return res.status(200).json({ success: true });
        }
  }

  return res.status(405).json({ error: 'Metodo no permitido' });
}
