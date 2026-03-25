// ProductScout IA - Register API
// POST /api/register - crea cuenta nueva y devuelve usuario

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PLANS = {
    basico:  { name: 'Basico',  searches_per_month: 10, price: 10, days: 30 },
    pro:     { name: 'Pro',     searches_per_month: 999, price: 25, days: 30 },
    agencia: { name: 'Agencia', searches_per_month: 999, price: 60, days: 30 }
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
                  'Content-Type': 'application/json',
                  'Prefer': method === 'POST' ? 'return=representation' : ''
                }
        };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
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

    // Check if username already exists
    const check = await sbFetch(`users?username=eq.${encodeURIComponent(username)}&select=id`);
    if (check.ok && check.data.length > 0) {
          return res.status(409).json({ error: 'El usuario ya existe' });
        }

    // Check if email already exists
    const checkEmail = await sbFetch(`users?email=eq.${encodeURIComponent(email)}&select=id`);
    if (checkEmail.ok && checkEmail.data.length > 0) {
          return res.status(409).json({ error: 'El email ya esta registrado' });
        }

    const planInfo = PLANS[plan];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + planInfo.days * 86400000).toISOString();

    const newUser = {
          username,
          password,
          email,
          plan,
          role: 'user',
          active: true,
          payment_status: 'pending',
          searches_this_month: 0,
          searches_limit: planInfo.searches_per_month,
          created_at: now.toISOString(),
          expires_at: expiresAt,
          month_reset: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
        };

    const insert = await sbFetch('users', 'POST', newUser);
    if (!insert.ok) {
          return res.status(500).json({ error: 'Error al crear usuario', detail: insert.data });
        }

    return res.status(201).json({
          success: true,
          message: 'Cuenta creada correctamente',
          user: username,
          plan: planInfo.name,
          expires_at: expiresAt,
          payment_status: 'pending'
        });
  }
