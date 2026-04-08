// ProductScout IA - Register API
// POST /api/register - crea cuenta nueva usando USERS_DB (mismo sistema que users.js)

const ADMIN_USER  = process.env.APP_USER    || 'matypereira';
const ADMIN_KEY   = process.env.ADMIN_KEY   || 'pf-admin-secret-2024';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID   = process.env.VERCEL_PROJECT_ID;

const PLANS = {
            basico: { name: 'Basico', searches_limit: 10, days: 30 },
            pro:    { name: 'Pro',    searches_limit: 999, days: 30 },
            agencia: { name: 'Agencia', searches_limit: 999, days: 30 }
};

function cors(res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getUsers() {
            try { return process.env.USERS_DB ? JSON.parse(process.env.USERS_DB) : []; }
            catch { return []; }
}

async function persistUsers(users) {
        try {
                  const listRes = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env`, {
                              headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
                  });
                  const listData = await listRes.json();
                  const envVar = (listData.envs || []).find(e => e.key === 'USERS_DB');
                  const newValue = JSON.stringify(users);

          if (envVar) {
                      await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${envVar.id}`, {
                                    method: 'PATCH',
                                    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ value: newValue, type: 'plain', target: ['production', 'preview', 'development'] })
                      });
          } else {
                      await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key: 'USERS_DB', value: newValue, type: 'plain', target: ['production', 'preview', 'development'] })
                      });
          }

          // Trigger redeploy so new USERS_DB value takes effect
          const deploymentsRes = await fetch(
                      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&limit=1&target=production`,
                { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
                    );
                  const deploymentsData = await deploymentsRes.json();
                  const latest = (deploymentsData.deployments || [])[0];
                  if (latest) {
                              await fetch('https://api.vercel.com/v13/deployments', {
                                            method: 'POST',
                                            headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ name: latest.name, gitSource: { type: 'github', ref: 'main', repoId: latest.meta && latest.meta.githubRepoId } })
                              });
                  }
                  return true;
        } catch(e) {
                  console.error('persistUsers error:', e.message);
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

      const users = getUsers();
            if (users.find(u => u.username === username)) {
                              return res.status(400).json({ error: 'El usuario ya existe' });
            }
            if (username === ADMIN_USER) {
                              return res.status(400).json({ error: 'Nombre de usuario reservado' });
            }

      const planInfo = PLANS[plan];
            const expiresAt = new Date(Date.now() + planInfo.days * 86400000);

      const newUser = {
                        username,
                        password,
                        email,
                        plan: planInfo.name,
                        searches_limit: planInfo.searches_limit,
                        searches_used: 0,
                        expiryDays: planInfo.days,
                        createdAt: new Date().toISOString(),
                        expires_at: expiresAt.toISOString(),
                        active: true,
                        payment_status: 'active'
      };

      users.push(newUser);
            persistUsers(users); // fire and forget - triggers redeploy

      return res.status(201).json({
                        success: true,
                        message: 'Cuenta creada correctamente',
                        user: username,
                        plan: planInfo.name,
                        expires_at: expiresAt.toISOString(),
                        payment_status: 'active'
      });
}
