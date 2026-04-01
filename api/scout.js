// ProductScout IA - Scout API
// POST /api/scout - analiza productos con IA usando Anthropic
// Limites de plan validados via USERS_DB (mismo sistema que users.js)

const ADMIN_USER   = process.env.APP_USER || 'matypereira';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID   = process.env.VERCEL_PROJECT_ID;

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

function isExpired(u) {
      if (!u.expiryDays || !u.createdAt) return false;
      const expiry = new Date(u.createdAt);
      expiry.setDate(expiry.getDate() + u.expiryDays);
      return new Date() > expiry;
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
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { countries, criteria, capital, canal, nicho, riesgo, username } = req.body || {};

  if (!countries || !Array.isArray(countries) || countries.length === 0) {
          return res.status(400).json({ error: 'Se requiere al menos un pais' });
  }

  // Validar limites de plan via USERS_DB (solo para usuarios no-admin)
  if (username && username !== ADMIN_USER) {
          const users = getUsers();
          const user = users.find(u => u.username === username);
          if (user) {
                    if (!user.active) {
                                return res.status(403).json({ error: 'Cuenta no activa' });
                    }
                    if (isExpired(user)) {
                                return res.status(403).json({ error: 'Tu acceso expiro.', expired: true });
                    }
                    const limit = user.searches_limit || 10;
                    const used  = user.searches_used  || 0;
                    if (used >= limit) {
                                return res.status(429).json({
                                              error: 'Alcanzaste el limite de busquedas de tu plan (' + limit + '/mes). Upgrade para continuar.',
                                              searches_used: used,
                                              searches_limit: limit,
                                              limit_reached: true
                                });
                    }
          }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const criteriaText = criteria && criteria.length > 0 ? criteria.join(', ') : 'margen, demanda, tendencias';
      const prompt = `Sos un experto analista de mercados de importacion global hacia Argentina con 15 anios de experiencia.

      CONFIGURACION DE BUSQUEDA:
      - Paises de origen: ${countries.join(', ')}
      - Criterios de filtrado: ${criteriaText}
      - Capital disponible: ${capital}
      - Canal de venta: ${canal}
      - Categoria preferida: ${nicho}
      - Tolerancia al riesgo: ${riesgo}

      Analiza los paises seleccionados e identifica entre 4 y 6 productos especificos con alto potencial de importacion. Distribuye los productos entre los diferentes paises.

      Devuelve SOLO un JSON valido (sin markdown, sin texto extra) con este formato:
      {
        "products": [
            {
                  "nombre": "Nombre del producto",
                        "pais": "Pais de origen",
                              "score": 88,
                                    "margen": 55,
                                          "demanda": "Alta",
                                                "riesgo": "Bajo",
                                                      "tendencia": "sube",
                                                            "descripcion": "Por que este producto es una buena oportunidad",
                                                                  "topPick": true
                                                                      }
                                                                        ]
                                                                        }

                                                                        Reglas:
                                                                        - score: numero 0-100
                                                                        - margen: numero entero porcentaje
                                                                        - demanda: Alta, Media o Baja
                                                                        - riesgo: Bajo, Medio o Alto
                                                                        - tendencia: sube, estable o baja
                                                                        - Solo un topPick true
                                                                        - Productos reales y especificos
                                                                        - Usar solo paises de la lista seleccionada`;

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
          const jsonEnd   = rawText.lastIndexOf('}');
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
                  nombre:      p.nombre    || p.name      || ('Producto ' + (i + 1)),
                  pais:        p.pais      || p.origen    || countries[i % countries.length] || 'Internacional',
                  score:       parseInt(p.score)  || 70,
                  margen:      parseInt(p.margen) || 35,
                  demanda:     p.demanda   || 'Media',
                  riesgo:      p.riesgo    || p.nivel_riesgo || 'Medio',
                  tendencia:   p.tendencia || 'estable',
                  descripcion: p.descripcion || p.justificacion || '',
                  topPick:     i === 0 ? true : false
        }));

        // Incrementar contador de busquedas del usuario en USERS_DB
        if (username && username !== ADMIN_USER) {
                  try {
                              const users = getUsers();
                              const idx = users.findIndex(u => u.username === username);
                              if (idx !== -1) {
                                            users[idx].searches_used = (users[idx].searches_used || 0) + 1;
                                            await persistUsers(users);
                              }
                  } catch (e) {
                              // No bloquear si falla el contador
                  }
        }

        return res.status(200).json(parsed);

  } catch (err) {
          return res.status(500).json({ error: 'Error interno', message: err.message });
  }
}
