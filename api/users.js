// ProductScout IA - Users Management API
// Admin: matypereira (never expires, full access)
// Regular users: expire after N days from activation
// Storage: GitHub repo file (data/users.json) - real-time, no redeploy needed

const ADMIN_USER = process.env.APP_USER || 'matypereira';
const ADMIN_KEY = process.env.ADMIN_KEY || 'pf-admin-secret-2024';
const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = 'matiasezequielpereira4340-sudo/productscout-ia';
const GH_FILE = 'data/users.json';
const GH_API = `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`;

async function getUsers() {
  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (GH_TOKEN) headers['Authorization'] = `token ${GH_TOKEN}`;
    const res = await fetch(GH_API, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.parse(content);
  } catch { return []; }
}

async function getFileSha() {
  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (GH_TOKEN) headers['Authorization'] = `token ${GH_TOKEN}`;
    const res = await fetch(GH_API, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha;
  } catch { return null; }
}

async function persistUsers(users) {
  if (!GH_TOKEN) { console.error('GH_TOKEN not set'); return false; }
  try {
    const sha = await getFileSha();
    const content = Buffer.from(JSON.stringify(users, null, 2)).toString('base64');
    const body = { message: 'update users', content };
    if (sha) body.sha = sha;
    const res = await fetch(GH_API, {
      method: 'PUT',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch(e) { console.error('persistUsers error:', e.message); return false; }
}

function isExpired(u) {
  if (!u.expiryDays || !u.createdAt) return false;
  const expiry = new Date(u.createdAt);
  expiry.setDate(expiry.getDate() + u.expiryDays);
  return new Date(Date.now()) > expiry;
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
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Acceso denegado' });

  if (req.method === 'GET') {
    const users = await getUsers();
    return res.status(200).json({ users: [
      { username: ADMIN_USER, role: 'admin', active: true, expiryDays: null, createdAt: null },
      ...users.map(u => ({ ...u, role: 'user', expired: isExpired(u) }))
    ]});
  }

  if (req.method === 'POST') {
    const { username, password, expiryDays } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Faltan campos requeridos' });
    if (username === ADMIN_USER) return res.status(400).json({ error: 'Nombre de usuario reservado' });
    const users = await getUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'El usuario ya existe' });
    users.push({ username, password, expiryDays: parseInt(expiryDays) || 30, createdAt: new Date().toISOString(), active: true });
    await persistUsers(users);
    return res.status(201).json({ success: true, message: 'Usuario creado correctamente' });
  }

  if (req.method === 'DELETE') {
    const { username, action, active } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Falta username' });
    let users = await getUsers();
    if (action === 'toggle') { users = users.map(u => u.username === username ? { ...u, active } : u); }
    else { users = users.filter(u => u.username !== username); }
    await persistUsers(users);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Metodo no permitido' });
}
