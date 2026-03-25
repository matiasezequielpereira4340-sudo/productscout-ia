// ProductScout IA - History API
// GET  /api/history?username=X  -> trae historial del usuario
// POST /api/history              -> guarda una busqueda nueva

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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

  // GET - fetch history for a user
  if (req.method === 'GET') {
    const username = req.query?.username || (req.url || '').split('username=')[1]?.split('&')[0];
    if (!username) return res.status(400).json({ error: 'username requerido' });

    const result = await sbFetch(
      'searches?username=eq.' + encodeURIComponent(username) +
      '&order=created_at.desc&limit=20&select=id,countries,params,results_count,created_at'
    );
    if (!result.ok) return res.status(500).json({ error: 'Error al obtener historial' });
    return res.status(200).json({ history: result.data });
}

  // POST - save a new search
  if (req.method === 'POST') {
    const { username, countries, params, results_count } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username requerido' });

    // Save the search
    const insert = await sbFetch('searches', 'POST', {
      username,
      countries: countries || [],
      params: params || {},
              results_count: results_count || 0,
                      created_at: new Date().toISOString()
                });

    // Increment search counter for user
    const userRes = await sbFetch(
      'users?username=eq.' + encodeURIComponent(username) + '&select=searches_this_month,month_reset'
    );
    if (userRes.ok && userRes.data.length > 0) {
      const user = userRes.data[0];
      const now = new Date();
      const monthReset = new Date(user.month_reset);

      // Reset counter if new month
      if (now >= monthReset) {
        await sbFetch(
          'users?username=eq.' + encodeURIComponent(username),
          'PATCH',
{
            searches_this_month: 1,
            month_reset: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
}
        );
      } else {
        await sbFetch(
          'users?username=eq.' + encodeURIComponent(username),
          'PATCH',
{ searches_this_month: (user.searches_this_month || 0) + 1 }
        );
      }
    }

    if (!insert.ok) return res.status(500).json({ error: 'Error al guardar busqueda' });
    return res.status(201).json({ success: true });
      }

  return res.status(405).json({ error: 'Metodo no permitido' });
}
