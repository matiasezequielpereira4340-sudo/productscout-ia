// ProductScout IA - Users Management API
// Solución FINAL: Lee USERS_DB directo de Vercel API (valor real, no caché)
// Escribe con PATCH a Vercel API. Sin redeploy. Sin dependencias externas.

const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_KEY  = process.env.ADMIN_KEY || 'pf-admin-secret-2024';

async function getUsersDB(projectId, token) {
  // Obtener la lista de env vars y su ID
  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return { users: [], envId: null };
  const data = await res.json();
  const envVar = (data.envs || []).find(e => e.key === 'USERS_DB');
  if (!envVar) return { users: [], envId: null };

  // Obtener el valor REAL del env var (GET single env var devuelve el value decrypted)
  const envRes = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env/${envVar.id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!envRes.ok) return { users: [], envId: envVar.id };
  const envData = await envRes.json();
  
  try {
    const value = envData.value || '';
    const users = value ? JSON.parse(value) : [];
    return { users: Array.isArray(users) ? users : [], envId: envVar.id };
  } catch {
    return { users: [], envId: envVar.id };
  }
}

async function getUsers(projectId, token) {
  try {
    if (projectId && token) {
      const { users } = await getUsersDB(projectId, token);
      return users;
    }
  } catch(e) { console.error('getUsers error:', e.message); }
  // Fallback
  try { return process.env.USERS_DB ? JSON.parse(process.env.USERS_DB) : []; }
  catch { return []; }
}

async function persistUsers(users, projectId, token) {
  try {
    const { envId } = await getUsersDB(projectId, token);
    const newValue = JSON.stringify(users);
    
    if (envId) {
      const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env/${envId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue, type: 'plain', target: ['production','preview','development'] })
      });
      return res.ok;
    } else {
      const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'USERS_DB', value: newValue, type: 'plain', target: ['production','preview','development'] })
      });
      return res.ok;
    }
  } catch(e) { console.error('persistUsers error:', e.message); return false; }
}

function isExpired(u) {
  if (!u.expiryDays || !u.createdAt) return false;
  const expiry = new Date(u.createdAt);
  expiry.setDate(expiry.getDate() + u.expiryDays);
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

  const projectId = process.env.VERCEL_PROJECT_ID;
  const token = process.env.VERCEL_TOKEN;

  if (req.method === 'GET') {
    const users = await getUsers(projectId, token);
    return res.status(200).json({ users: [
      { username: ADMIN_USER, role: 'admin', active: true, expiryDays: null, createdAt: null },
      ...users.map(u => ({ ...u, role: 'user', expired: isExpired(u) }))
    ]});
  }

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

  if (req.method === 'DELETE') {
    const { username, action, active } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Falta username' });
    let users = await getUsers(projectId, token);
    users = action === 'toggle'
      ? users.map(u => u.username === username ? { ...u, active } : u)
      : users.filter(u => u.username !== username);
    await persistUsers(users, projectId, token);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Metodo no permitido' });
}
