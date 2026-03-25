// ProductScout IA - Scout API
// POST /api/scout - analiza productos con IA (valida limites de plan)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_USER = process.env.APP_USER || 'matypereira';

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
                  'Prefer': 'return=representation'
          }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
    const data = await res.json();
    return { ok: res.ok, data };
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { countries, criteria, capital, canal, nicho, riesgo, username } = req.body;

  if (!countries || !Array.isArray(countries) || countries.length === 0) {
        return res.status(400).json({ error: 'Se requiere al menos un pais', debug: req.body });
  }

  // Check usage limits if Supabase is configured and user is not admin
  if (SUPABASE_URL && SUPABASE_KEY && username && username !== ADMIN_USER) {
        const userRes = await sbFetch(
                'users?username=eq.' + encodeURIComponent(username) +
                '&select=searches_this_month,searches_limit,month_reset,active,payment_status,expires_at'
              );

      if (userRes.ok && userRes.data.length > 0) {
              const user = userRes.data[0];
              const now = new Date();

          // Check account still valid
          if (!user.active || user.payment_status !== 'paid') {
                    return res.status(403).json({ error: 'Cuenta no activa o pago pendiente' });
          }
              if (user.expires_at && now > new Date(user.expires_at)) {
                        return res.status(403).json({ error: 'Tu acceso expiro. Renova tu plan.', expired: true });
              }

          // Check monthly limit
          let searchesUsed = user.searches_this_month || 0;
              if (user.month_reset && now >= new Date(user.month_reset)) {
                        searchesUsed = 0;
              }
              const limit = user.searches_limit || 10;
              if (searchesUsed >= limit) {
                        return res.status(429).json({
                                    error: 'Alcanzaste el limite de busquedas de tu plan (' + limit + '/mes). Upgrade para continuar.',
                                    searches_used: searchesUsed,
                                    searches_limit: limit,
                                    limit_reached: true
                        });
              }
      }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const criteriaText = criteria && criteria.length > 0 ? criteria.join(', ') : 'margen, demanda, tendencias';
    const prompt = 'Sos un experto analista de mercados de importacion global hacia Argentina con 15 anios de experiencia.\n\nCONFIGURACION DE BUSQUEDA:\n- Paises de origen: ' + countries.join(', ') + '\n- Criterios de filtrado: ' + criteriaText + '\n- Capital disponible: ' + capital + '\n- Canal de venta: ' + canal + '\n- Categoria preferida: ' + nicho + '\n- Tolerancia al riesgo: ' + riesgo + '\n\nAnaliza los paises seleccionados e identifica entre 4 y 6 productos especificos con alto potencial de importacion. Distribuye los productos entre los diferentes paises.\n\nDevuelve SOLO un JSON valido (sin markdown, sin texto extra) con este formato:\n{\n "products": [\n {\n "nombre": "Nombre del producto",\n "pais": "Pais de origen",\n "score": 88,\n "margen": 55,\n "demanda": "Alta",\n "riesgo": "Bajo",\n "tendencia": "sube",\n "descripcion": "Por que este producto es una buena oportunidad",\n "topPick": true\n }\n ]\n}\n\nReglas:\n- score: numero 0-100\n- margen: numero entero porcentaje\n- demanda: Alta, Media o Baja\n- riesgo: Bajo, Medio o Alto\n- tendencia: sube, estable o baja\n- Solo un topPick true\n- Productos reales y especificos\n- Usar solo paises de la lista seleccionada';

  try {
        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                          'Content-Type': 'application/json',
                          'x-api-key': apiKey,
                          'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                          model: 'claude-haiku-4-5',
                          max_tokens: 1536,
                          messages: [{ role: 'user', content: prompt }]
                })
        });

      const data = await apiRes.json();
        if (!apiRes.ok) {
                return res.status(500).json({ error: 'Error de API Anthropic', debug: { status: apiRes.status, data } });
        }

      let rawText = data.content?.[0]?.text || '';
        rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) rawText = rawText.substring(jsonStart, jsonEnd + 1);

      let parsed;
        try {
                parsed = JSON.parse(rawText);
        } catch (parseErr) {
                return res.status(500).json({ error: 'Error al parsear JSON', raw: rawText.substring(0, 500) });
        }

      if (!parsed.products || !Array.isArray(parsed.products)) {
              return res.status(500).json({ error: 'Formato invalido', raw: rawText.substring(0, 300) });
      }

      parsed.products = parsed.products.map((p, i) => ({
              nombre: p.nombre || p.name || ('Producto ' + (i + 1)),
              pais: p.pais || p.origen || countries[i % countries.length] || 'Internacional',
              score: parseInt(p.score) || 70,
              margen: parseInt(p.margen) || 35,
              demanda: p.demanda || 'Media',
              riesgo: p.riesgo || p.nivel_riesgo || 'Medio',
              tendencia: p.tendencia || 'estable',
              descripcion: p.descripcion || '',
              topPick: i === 0 ? true : false
      }));

      // Save to history and increment counter
      if (SUPABASE_URL && SUPABASE_KEY && username) {
              // Save search
          await sbFetch('searches', 'POST', {
                    username,
                    countries,
                    params: { capital, canal, nicho, riesgo, criteria },
                    results_count: parsed.products.length,
                    created_at: new Date().toISOString()
          });

          // Increment counter
          if (username !== ADMIN_USER) {
                    const userRes2 = await sbFetch(
                                'users?username=eq.' + encodeURIComponent(username) + '&select=searches_this_month,month_reset'
                              );
                    if (userRes2.ok && userRes2.data.length > 0) {
                                const u = userRes2.data[0];
                                const now = new Date();
                                if (u.month_reset && now >= new Date(u.month_reset)) {
                                              await sbFetch('users?username=eq.' + encodeURIComponent(username), 'PATCH', {
                                                              searches_this_month: 1,
                                                              month_reset: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
                                              });
                                } else {
                                              await sbFetch('users?username=eq.' + encodeURIComponent(username), 'PATCH', {
                                                              searches_this_month: (u.searches_this_month || 0) + 1
                                              });
                                }
                    }
          }
      }

      return res.status(200).json(parsed);
  } catch (err) {
        return res.status(500).json({ error: 'Error interno', message: err.message });
  }
}
