// ProductScout IA - Users Management API
// Admin: matypereira (never expires, full access)
// Regular users: expire after N days from activation
// Persistence: Reads/Writes USERS_DB via Vercel API in real-time (no cache, no redeploy needed)

const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_KEY = process.env.ADMIN_KEY || 'pf-admin-secret-2024';

// Read USERS_DB live from Vercel API (bypasses deployment cache)
async function getUsers(projectId, token) {
      try {
              // First try to read from live Vercel API env vars
        if (projectId && token) {
                  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
                              headers: { Authorization: `Bearer ${token}` }
                  });
                  if (res.ok) {
                              const data = await res.json();
                              const envVar = (data.envs || []).find(e => e.key === 'USERS_DB');
                              if (envVar && envVar.value) {
                                            try { return JSON.parse(envVar.value); } catch { return []; }
                              }
                  }
        }
      } catch {}
      // Fallback: read from process.env (deployment cache)
  try { return process.env.USERS_DB ? JSON.parse(process.env.USERS_DB) : []; }
      catch { return []; }
}

function isExpired(u) {
      if (!u.expiryDays || !u.createdAt) return false;
      const expiry = new Date(u.createdAt);
      expiry.setDate(expiry.getDate() + u.expiryDays);
      return new Date(Date.now()) > expiry;
}

async function persistUsers(users, projectId, token) {
      try {
              const listRes = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
                        headers: { Authorization: `Bearer ${token}` }
              });
              const listData = await listRes.json();
              const envVar = (listData.envs || []).find(e => e.key === 'USERS_DB');
              const newValue = JSON.stringify(users);

        if (envVar) {
                  await fetch(`https://api.vercel.com/v10/projects/${projectId}/env/${envVar.id}`, {
                              method: 'PATCH',
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                              body: JSON.stringify({ value: newValue, type: 'plain', target: ['production', 'preview', 'development'] })
                  });
        } else {
                  await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                              body: JSON.stringify({ key: 'USERS_DB', value: newValue, type: 'plain', target: ['production', 'preview', 'development'] })
                  });
        }
              return true;
      } catch(e) {
              console.error('persistUsers error:', e.message);
              return false;
      }
}

function cors(res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
}

export default async function handler(req, res) {
      cors(res);
      if (req.method === 'OPTIONS') return res.status(200).end();

  const adminKey = req.headers['x-admin-key'];
      if (adminKey !== ADMIN_KEY) {
              return res.status(403).json({ error: 'Acceso denegado' });
      }

  const projectId = process.env.VERCEL_PROJECT_ID;
      const token = process.env.VERCEL_TOKEN;

  // GET /api/users - List all users (reads live from Vercel API)
  if (req.method === 'GET') {
          const users = await getUsers(projectId, token);
          const usersWithStatus = [
              { username: ADMIN_USER, role: 'admin', active: true, expiryDays: null, createdAt: null },
                    ...users.map(u => ({ ...u, role: 'user', expired: isExpired(u) }))
                  ];
          return res.status(200).json({ users: usersWithStatus });
  }

  // POST /api/users - Create new user
  if (req.method === 'POST') {
          const { username, password, expiryDays } = req.body || {};
          if (!username || !password) return res.status(400).json({ error: 'Faltan campos requeridos' });
          if (username === ADMIN_USER) return res.status(400).json({ error: 'Nombre de usuario reservado' });
          const users = await getUsers(projectId, token);
          if (users.find(u => u.username === username)) return res.status(400).json({ error: 'El usuario ya existe' });
          users.push({ username, password, expiryDays: parseInt(expiryDays) || 30, createdAt: new Date().toISOString(), active: true });
          await persistUsers(users, projectId, token);
          return res.status(201).json({ success: true, message: 'Usuario creado correctamente' });
  }

  // DELETE /api/users - Toggle active status or delete user
  if (req.method === 'DELETE') {
          const { username, action, active } = req.body || {};
          if (!username) return res.status(400).json({ error: 'Falta username' });
          let users = await getUsers(projectId, token);
          if (action === 'toggle') {
                    users = users.map(u => u.username === username ? { ...u, active } : u);
          } else {
                    users = users.filter(u => u.username !== username);
          }
          await persistUsers(users, projectId, token);
          return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Metodo no permitido' });
}
