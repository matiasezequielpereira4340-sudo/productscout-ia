// ProductScout IA - Register API
// POST /api/register - crea cuenta nueva usando USERS_DB (mismo sistema que users.js)

const ADMIN_USER   = process.env.APP_USER    || 'matypereira';
const ADMIN_KEY    = process.env.ADMIN_KEY   || 'pf-admin-secret-2024';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID   = process.env.VERCEL_PROJECT_ID;

const PLANS = {
      basico:  { name: 'Basico',  searches_limit: 10,  days: 30 },
      pro:     { name: 'Pro',     searches_limit: 999, days: 30 },
      agencia: { name: 'Agencia', searches_limit: 999, days: 30 }
};

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

async function persistUsers(users) {
      if (!PROJECT_ID || !VERCEL_TOKEN) return false;
      try {
              const listRes = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env`, {
                        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
              });
              const listData = await listRes.json();
              const envVar = listData.envs && listData.envs.find(e => e.key === 'USERS_DB');
              const method = envVar ? 'PATCH' : 'POST';
              const url = envVar
                ? `https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${envVar.id}`
                        : `https://api.vercel.com/v10/projects/${PROJECT_ID}/env`;
              const body = envVar
                ? { value: JSON.stringify(users) }
                        : { key: 'USERS_DB', value: JSON.stringify(users), type: 'plain', target: ['production', 'preview', 'development'] };
              await fetch(url, {
                        method,
                        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
              });
              return true;
      } catch {
              return false;
      }
}

export default async function handler(req, res) {
      cors(res);
      if (req.method === 'OPTIONS') return res.status(200).end();
      if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const { username, password, email, plan } = req.body || {};

  if (!username || !password || !email || !plan) {
          return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
      if (!PLANS[plan]) {
              return res.status(400).json({ error: 'Plan invalido' });
      }
      if (username.length < 3) {
              return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
      }
      if (password.length < 6) {
              return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres' });
      }
      if (username === ADMIN_USER) {
              return res.status(400).json({ error: 'Nombre de usuario no disponible' });
      }

  const users = getUsers();

  if (users.find(u => u.username === username)) {
          return res.status(409).json({ error: 'El usuario ya existe' });
  }
      if (users.find(u => u.email === email)) {
              return res.status(409).json({ error: 'El email ya esta registrado' });
      }

  const planInfo = PLANS[plan];
      const newUser = {
              username,
              password,
              email,
              plan,
              role: 'user',
              active: true,
              searches_used: 0,
              searches_limit: planInfo.searches_limit,
              expiryDays: planInfo.days,
              createdAt: new Date().toISOString()
      };

  users.push(newUser);
      await persistUsers(users);

  const expiresAt = new Date(Date.now() + planInfo.days * 86400000).toISOString();

  return res.status(201).json({
          success: true,
          message: 'Cuenta creada correctamente',
          user: username,
          plan: planInfo.name,
          expires_at: expiresAt,
          payment_status: 'active'
  });
}
